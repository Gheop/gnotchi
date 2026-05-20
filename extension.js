import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { SocketServer } from './src/socketServer.js';
import { SessionManager } from './src/sessionManager.js';
import { Indicator } from './src/indicator.js';
import { clearSpriteCache } from './src/mascot.js';
import { withHooks, needsWrite } from './lib/hooksConfig.js';

function focusWindowByPid(pid) {
    if (!pid || !global.display)
        return false;
    const wm = global.workspace_manager;
    if (!wm)
        return false;
    for (let i = 0; i < wm.get_n_workspaces(); i++) {
        for (const w of wm.get_workspace_by_index(i).list_windows()) {
            if (w.get_pid && w.get_pid() === pid) {
                w.get_workspace().activate(global.get_current_time());
                w.activate(global.get_current_time());
                return true;
            }
        }
    }
    return false;
}

export default class GnotchiExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._writeRuntimeConf();
        this._ensureHooks();
        this._settingsIds = [];
        this._settingsIds.push(this._settings.connect('changed::emotion-mode',
            () => this._writeRuntimeConf()));

        const idleMs = this._settings.get_int('idle-timeout-minutes') * 60000;
        this._maxMascots = this._settings.get_int('max-mascots');

        this._terminalPids = new Map();
        this._notifyOnStop = this._settings.get_boolean('notify-on-stop');
        this._notifyOnError = this._settings.get_boolean('notify-on-error');
        this._settingsIds.push(this._settings.connect('changed::notify-on-stop',
            () => { this._notifyOnStop = this._settings.get_boolean('notify-on-stop'); }));
        this._settingsIds.push(this._settings.connect('changed::notify-on-error',
            () => { this._notifyOnError = this._settings.get_boolean('notify-on-error'); }));

        const assetsDir = GLib.build_filenamev([this.path, 'assets']);
        this._indicator = new Indicator(assetsDir, () => this.openPreferences(), {
            focusByPid: focusWindowByPid,
        });
        this._indicator.setHideWhenIdle(this._settings.get_boolean('hide-when-idle'));
        this._settingsIds.push(this._settings.connect('changed::hide-when-idle',
            () => this._indicator.setHideWhenIdle(this._settings.get_boolean('hide-when-idle'))));
        this._indicator.setFeedFilter(this._settings.get_string('feed-filter'));
        this._settingsIds.push(this._settings.connect('changed::feed-filter',
            () => this._indicator.setFeedFilter(this._settings.get_string('feed-filter'))));
        this._indicator.setCelebrateOnStop(this._settings.get_boolean('celebrate-on-stop'));
        this._settingsIds.push(this._settings.connect('changed::celebrate-on-stop',
            () => this._indicator.setCelebrateOnStop(this._settings.get_boolean('celebrate-on-stop'))));
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._mgr = new SessionManager(idleMs);
        this._mgrIds = [
            this._mgr.connect('session-added', (_m, id) =>
                this._indicator.addSession(id, this._maxMascots, this._terminalPids.get(id))),
            this._mgr.connect('session-removed', (_m, id) => {
                this._terminalPids.delete(id);
                this._indicator.removeSession(id);
            }),
            this._mgr.connect('session-changed', (_m, id) => {
                const e = this._mgr.sessions.get(id);
                if (e)
                    this._indicator.updateSession(id, e.session.state);
            }),
            this._mgr.connect('feed', (_m, msg) => {
                const pid = msg?.data?.terminal_pid;
                if (Number.isFinite(pid) && pid > 0) {
                    this._terminalPids.set(msg.session_id, pid);
                    this._indicator.setTerminalPid(msg.session_id, pid);
                }
                const transcript = msg?.data?.transcript_path;
                if (typeof transcript === 'string' && transcript)
                    this._indicator.setTranscriptPath(msg.session_id, transcript);
                this._indicator.pushFeed(msg);
                this._maybeNotify(msg);
            }),
        ];

        this._server = new SocketServer();
        this._serverIds = [
            this._server.connect('message', (_s, msg) => this._mgr.onMessage(msg)),
            this._server.connect('log', (_s, line) => log(`[gnotchi] ${line}`)),
        ];
        this._server.start();
        this._indicator.setStatusText('socket actif');
    }

    disable() {
        if (this._server) {
            for (const id of this._serverIds)
                this._server.disconnect(id);
            this._server.stop();
            this._server = null;
        }
        this._serverIds = null;
        if (this._mgr) {
            for (const id of this._mgrIds)
                this._mgr.disconnect(id);
            this._mgr.destroy();
            this._mgr = null;
        }
        this._mgrIds = null;
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        clearSpriteCache();
        if (this._settingsIds && this._settings) {
            for (const id of this._settingsIds)
                this._settings.disconnect(id);
        }
        this._settingsIds = null;
        this._settings = null;
    }

    _maybeNotify(msg) {
        if (!msg || !msg.event)
            return;
        const short = String(msg.session_id || '').slice(0, 8) || '?';
        if (msg.event === 'Stop') {
            if (this._notifyOnStop)
                Main.notify('gnotchi', `Session ${short} done`);
            this._indicator.celebrate(msg.session_id);
        } else if (msg.event === 'PostToolUse' && msg.data?.is_error && this._notifyOnError) {
            Main.notify('gnotchi', `Tool error in ${short}`);
        }
    }

    _writeRuntimeConf() {
        const rt = GLib.get_user_runtime_dir();
        const mode = this._settings.get_string('emotion-mode');
        const path = GLib.build_filenamev([rt, 'gnotchi.conf']);
        try {
            GLib.file_set_contents(path, JSON.stringify({ emotion_mode: mode }));
        } catch (e) {
            log(`[gnotchi] conf: ${e}`);
        }
    }

    _ensureHooks() {
        try {
            const emit = GLib.build_filenamev([this.path, 'tools', 'gnotchi-emit']);
            const claudeDir = GLib.getenv('CLAUDE_CONFIG_DIR') ||
                GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
            const path = GLib.build_filenamev([claudeDir, 'settings.json']);
            const file = Gio.File.new_for_path(path);
            let obj = {};
            if (file.query_exists(null)) {
                const [ok, bytes] = GLib.file_get_contents(path);
                if (!ok)
                    return;
                const text = new TextDecoder().decode(bytes);
                try {
                    obj = text.trim() ? JSON.parse(text) : {};
                } catch (e) {
                    log(`[gnotchi] settings.json invalide, hooks non posés: ${e}`);
                    return;
                }
            }
            if (!needsWrite(obj, emit))
                return;
            const bak = `${path}.gnotchi.bak`;
            if (file.query_exists(null) && !Gio.File.new_for_path(bak).query_exists(null))
                GLib.file_set_contents(bak, JSON.stringify(obj, null, 2));
            const next = JSON.stringify(withHooks(obj, emit), null, 2) + '\n';
            const tmp = `${path}.gnotchi.tmp`;
            GLib.file_set_contents(tmp, next);
            Gio.File.new_for_path(tmp).move(file, Gio.FileCopyFlags.OVERWRITE, null, null);
            log('[gnotchi] hooks Claude Code posés/réparés');
        } catch (e) {
            log(`[gnotchi] _ensureHooks: ${e}`);
        }
    }
}

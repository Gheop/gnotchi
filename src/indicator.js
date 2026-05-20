import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Mascot } from './mascot.js';
import { nextVerb } from '../lib/spinnerVerbs.js';
import { UsageTracker } from './usageTracker.js';
import { humanize, sparkline, prettyProject } from '../lib/usage.js';
import { shouldDisplay } from '../lib/feed.js';
import { humanDuration } from '../lib/duration.js';
import { candidateArgvs } from '../lib/terminalLauncher.js';

const FEED_MAX = 12;
const ISLAND_MASCOT_SIZE = 48;

export const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(assetsDir, openPrefs, opts = {}) {
        super._init(0.0, 'gnotchi');
        this._assetsDir = assetsDir;
        this._focusByPid = opts.focusByPid || (() => false);
        this._mascots = new Map(); // id -> Mascot (top bar)
        this._islandMascots = new Map(); // id -> Mascot (popup)
        this._activity = new Map(); // id -> string (pour le tooltip de survol)
        this._cwd = new Map(); // id -> cwd (dernier connu via feed)
        this._stateSince = new Map(); // id -> ms du dernier changement d'activité
        this._terminalPids = new Map(); // id -> pid (pour le clic terminal jump)
        this._transcripts = new Map(); // id -> chemin du .jsonl
        this._confettis = new Set(); // St.Widget en vol (cleanup au destroy)
        this._feed = [];
        this._working = new Set();
        this._spinnerId = 0;
        this._verb = null;
        this._hideWhenIdle = false;
        this._feedFilter = 'all';
        this._celebrate = true;
        this._tooltip = new St.Label({
            visible: false,
            style_class: 'dash-label',
        });
        Main.layoutManager.addChrome(this._tooltip);

        this._box = new St.BoxLayout({ style_class: 'gnotchi-box' });
        this.add_child(this._box);

        this._header = new PopupMenu.PopupMenuItem('gnotchi · 0 session', { reactive: false });
        this.menu.addMenuItem(this._header);

        this._island = new St.BoxLayout({ style_class: 'gnotchi-island', x_expand: true });
        this._island.set_style(
            `background-image: url("file://${assetsDir}/grass.png"); ` +
            'background-size: 64px 64px; background-repeat: repeat; ' +
            'min-height: 64px; border-radius: 8px;');
        this._island.set_clip_to_allocation(true);
        const islandItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        islandItem.add_child(this._island);
        this.menu.addMenuItem(islandItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._feedLabel = new St.Label({ style_class: 'gnotchi-feed', text: '' });
        const feedItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        feedItem.add_child(this._feedLabel);
        this.menu.addMenuItem(feedItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._status = new PopupMenu.PopupMenuItem('socket actif', { reactive: false });
        this.menu.addMenuItem(this._status);
        this._usage = new UsageTracker();
        this._usageRow = new PopupMenu.PopupMenuItem("Usage aujourd'hui : calcul…", { reactive: false });
        this.menu.addMenuItem(this._usageRow);
        this._sparkRow = new PopupMenu.PopupMenuItem('7 derniers jours : …', { reactive: false });
        this.menu.addMenuItem(this._sparkRow);
        this._sessionsMenu = new PopupMenu.PopupSubMenuMenuItem('Sessions actives (0)');
        this.menu.addMenuItem(this._sessionsMenu);
        this._topProjectsRow = new PopupMenu.PopupMenuItem('Top projets : …', { reactive: false });
        this.menu.addMenuItem(this._topProjectsRow);

        const newSession = new PopupMenu.PopupMenuItem('Nouvelle session Claude Code…');
        newSession.connect('activate', () => this._launchClaude());
        this.menu.addMenuItem(newSession);
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refreshUsage();
        });
        const prefsItem = new PopupMenu.PopupMenuItem('Préférences…');
        prefsItem.connect('activate', () => openPrefs());
        this.menu.addMenuItem(prefsItem);
    }

    addSession(id, maxMascots, terminalPid) {
        if (Number.isFinite(terminalPid) && terminalPid > 0)
            this._terminalPids.set(id, terminalPid);
        if (!this._stateSince.has(id))
            this._stateSince.set(id, Date.now());
        if (this._mascots.size < maxMascots) {
            const m = new Mascot(this._assetsDir);
            m.setSeed(id);
            this._mascots.set(id, m);
            this._box.add_child(m);
            this._attachTooltip(m, id);
            this._attachClickJump(m, id);
        }
        const im = new Mascot(this._assetsDir, ISLAND_MASCOT_SIZE);
        im.setSeed(id);
        this._islandMascots.set(id, im);
        this._island.add_child(im);
        this._refreshHeader();
        this._refreshSessionsMenu();
        this._updateVisibility();
    }

    updateSession(id, state) {
        const m = this._mascots.get(id);
        if (m)
            m.setState(state.activity, state.mood);
        const im = this._islandMascots.get(id);
        if (im)
            im.setState(state.activity, state.mood);
        if (this._activity.get(id) !== state.activity)
            this._stateSince.set(id, Date.now());
        this._activity.set(id, state.activity);
        if (state.activity === 'working')
            this._working.add(id);
        else
            this._working.delete(id);
        this._syncSpinner();
    }

    removeSession(id) {
        const m = this._mascots.get(id);
        if (m) {
            this._box.remove_child(m);
            m.destroy();
            this._mascots.delete(id);
        }
        const im = this._islandMascots.get(id);
        if (im) {
            this._island.remove_child(im);
            im.destroy();
            this._islandMascots.delete(id);
        }
        this._activity.delete(id);
        this._cwd.delete(id);
        this._stateSince.delete(id);
        this._terminalPids.delete(id);
        this._transcripts.delete(id);
        this._working.delete(id);
        this._syncSpinner();
        this._refreshSessionsMenu();
        this._updateVisibility();
    }

    _refreshSessionsMenu() {
        const ids = [...this._islandMascots.keys()];
        this._sessionsMenu.label.set_text(`Sessions actives (${ids.length})`);
        this._sessionsMenu.menu.removeAll();
        if (!ids.length) {
            const empty = new PopupMenu.PopupMenuItem('— aucune session —', { reactive: false });
            this._sessionsMenu.menu.addMenuItem(empty);
            return;
        }
        for (const id of ids) {
            const short = id.slice(0, 8);
            const item = new PopupMenu.PopupMenuItem(`Copier l’ID : ${short}…`);
            item.connect('activate', () => {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, id);
                Main.notify('gnotchi', `Session ID copié : ${short}…`);
            });
            this._sessionsMenu.menu.addMenuItem(item);
        }
    }

    _attachClickJump(actor, id) {
        actor.connect('button-press-event', (_a, event) => {
            const btn = event.get_button();
            if (btn === Clutter.BUTTON_PRIMARY) {
                const pid = this._terminalPids.get(id);
                if (pid && this._focusByPid(pid))
                    return Clutter.EVENT_STOP;
                return Clutter.EVENT_PROPAGATE;
            }
            if (btn === Clutter.BUTTON_SECONDARY) {
                const path = this._transcripts.get(id);
                if (path && this._openTranscript(path))
                    return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _openTranscript(path) {
        try {
            const uri = Gio.File.new_for_path(path).get_uri();
            return Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (e) {
            logError(e, 'gnotchi: openTranscript');
            return false;
        }
    }

    setTranscriptPath(id, path) {
        if (typeof path === 'string' && path.length)
            this._transcripts.set(id, path);
    }

    setHideWhenIdle(on) {
        this._hideWhenIdle = !!on;
        this._updateVisibility();
    }

    _updateVisibility() {
        if (!this._hideWhenIdle) {
            this.show();
            return;
        }
        this.visible = this._islandMascots.size > 0;
    }

    _attachTooltip(actor, id) {
        actor.reactive = true;
        actor.track_hover = true;
        actor.connect('notify::hover', () => {
            if (actor.hover)
                this._showTooltip(actor, id);
            else
                this._tooltip.hide();
        });
    }

    _showTooltip(actor, id) {
        const activity = this._activity.get(id) ?? 'idle';
        const cwd = this._cwd.get(id);
        const head = cwd ? GLib.path_get_basename(cwd) : id.slice(0, 8);
        const since = this._stateSince.get(id);
        const dur = since ? ` · ${humanDuration(Date.now() - since)}` : '';
        this._tooltip.set_text(`${head} · ${activity}${dur}`);
        const [x, y] = actor.get_transformed_position();
        const w = actor.get_width();
        const h = actor.get_height();
        // Affiche pour mesurer, puis recale (-tooltipWidth/2 + actorWidth/2).
        this._tooltip.opacity = 0;
        this._tooltip.show();
        const tw = this._tooltip.get_width();
        const tx = Math.max(8, Math.round(x + w / 2 - tw / 2));
        this._tooltip.set_position(tx, Math.round(y + h + 4));
        this._tooltip.ease({
            opacity: 255,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    pushFeed(msg) {
        if (msg && msg.cwd && msg.session_id)
            this._cwd.set(msg.session_id, msg.cwd);
        if (!shouldDisplay(msg, this._feedFilter))
            return;
        const proj = msg.cwd ? GLib.path_get_basename(msg.cwd) : msg.session_id.slice(0, 6);
        const t = new Date(msg.ts * 1000).toLocaleTimeString();
        this._feed.unshift(`${t}  ${proj}  ${msg.event}`);
        this._feed = this._feed.slice(0, FEED_MAX);
        this._feedLabel.set_text(this._feed.join('\n'));
    }

    setFeedFilter(mode) {
        this._feedFilter = mode === 'significant' ? 'significant' : 'all';
    }

    setCelebrateOnStop(on) {
        this._celebrate = !!on;
    }

    celebrate(id) {
        if (!this._celebrate)
            return;
        const m = this._mascots.get(id);
        if (!m)
            return;
        const [ax, ay] = m.get_transformed_position();
        const w = m.get_width();
        const colors = ['#ff8c42', '#a78bfa', '#22d3ee', '#f472b6', '#facc15'];
        const N = 8;
        for (let i = 0; i < N; i++) {
            const c = colors[i % colors.length];
            const px = new St.Widget({
                style: `background-color: ${c}; border-radius: 2px;`,
                width: 5, height: 5,
                opacity: 230,
                reactive: false,
            });
            Main.layoutManager.addChrome(px);
            this._confettis.add(px);
            const startX = Math.round(ax + w / 2 + (Math.random() * 14 - 7));
            const startY = Math.round(ay + 22);
            px.set_position(startX, startY);
            const drift = Math.round(Math.random() * 60 - 30);
            const fall = 50 + Math.round(Math.random() * 30);
            px.ease({
                x: startX + drift,
                y: startY + fall,
                opacity: 0,
                duration: 800 + Math.round(Math.random() * 200),
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    this._confettis.delete(px);
                    Main.layoutManager.removeChrome(px);
                    px.destroy();
                },
            });
        }
    }

    setStatusText(text) {
        this._status.label.set_text(text);
    }

    _refreshUsage() {
        const s = this._usage.summary();
        if (!s) {
            this._usageRow.label.set_text("Usage aujourd'hui : calcul…");
            this._sparkRow.label.set_text('7 derniers jours : …');
            this._topProjectsRow.label.set_text('Top projets : …');
            return;
        }
        const extra = s.skipped ? ` · +${s.skipped} fich. ignorés` : '';
        this._usageRow.label.set_text(
            `Usage aujourd'hui (approx.) : ${humanize(s.work)} tok · cache ${humanize(s.cache)}${extra}`);
        if (s.daily && s.daily.length) {
            const work = s.daily.map(d => d.work);
            const max = Math.max(...work, 0);
            this._sparkRow.label.set_text(
                `7 derniers jours : ${sparkline(work)}  (max ${humanize(max)})`);
        } else {
            this._sparkRow.label.set_text('7 derniers jours : —');
        }
        if (s.projects && s.projects.length) {
            const top = s.projects.slice(0, 3)
                .map(p => `${prettyProject(p.project)} ${humanize(p.work)}`)
                .join(' · ');
            this._topProjectsRow.label.set_text(`Top projets : ${top}`);
        } else {
            this._topProjectsRow.label.set_text('Top projets : —');
        }
    }

    _launchClaude() {
        for (const argv of candidateArgvs('claude')) {
            try {
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDIN_INHERIT);
                return true;
            } catch (e) {
                // binaire absent ou autre : on tente le suivant
            }
        }
        Main.notify('gnotchi', 'Aucun terminal compatible trouvé');
        return false;
    }

    _refreshHeader() {
        if (this._working.size > 0)
            return; // le ticker affiche le verbe ; ne pas écraser
        const n = this._islandMascots.size;
        this._header.label.set_text(`gnotchi · ${n} session${n > 1 ? 's' : ''}`);
    }

    _syncSpinner() {
        if (this._working.size > 0) {
            if (this._spinnerId)
                return;
            this._verb = nextVerb(this._verb);
            this._header.label.set_text(`✻ ${this._verb}…`);
            this._spinnerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                this._verb = nextVerb(this._verb);
                this._header.label.set_text(`✻ ${this._verb}…`);
                return GLib.SOURCE_CONTINUE;
            });
        } else {
            this._stopSpinner();
            this._refreshHeader();
        }
    }

    _stopSpinner() {
        if (this._spinnerId) {
            GLib.source_remove(this._spinnerId);
            this._spinnerId = 0;
        }
    }

    destroy() {
        this._stopSpinner();
        this._usage.destroy();
        for (const px of this._confettis) {
            try { Main.layoutManager.removeChrome(px); } catch { }
            try { px.destroy(); } catch { }
        }
        this._confettis.clear();
        if (this._tooltip) {
            Main.layoutManager.removeChrome(this._tooltip);
            this._tooltip.destroy();
            this._tooltip = null;
        }
        for (const m of this._mascots.values()) {
            this._box.remove_child(m);
            m.destroy();
        }
        for (const m of this._islandMascots.values()) {
            this._island.remove_child(m);
            m.destroy();
        }
        this._mascots.clear();
        this._islandMascots.clear();
        super.destroy();
    }
});

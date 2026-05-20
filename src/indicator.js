import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Mascot } from './mascot.js';
import { nextVerb } from '../lib/spinnerVerbs.js';
import { UsageTracker } from './usageTracker.js';
import { humanize } from '../lib/usage.js';

const FEED_MAX = 12;
const ISLAND_MASCOT_SIZE = 48;

export const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(assetsDir, openPrefs) {
        super._init(0.0, 'gnotchi');
        this._assetsDir = assetsDir;
        this._mascots = new Map(); // id -> Mascot (top bar)
        this._islandMascots = new Map(); // id -> Mascot (popup)
        this._feed = [];
        this._working = new Set();
        this._spinnerId = 0;
        this._verb = null;

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
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refreshUsage();
        });
        const prefsItem = new PopupMenu.PopupMenuItem('Préférences…');
        prefsItem.connect('activate', () => openPrefs());
        this.menu.addMenuItem(prefsItem);
    }

    addSession(id, maxMascots) {
        if (this._mascots.size < maxMascots) {
            const m = new Mascot(this._assetsDir);
            m.setSeed(id);
            this._mascots.set(id, m);
            this._box.add_child(m);
        }
        const im = new Mascot(this._assetsDir, ISLAND_MASCOT_SIZE);
        im.setSeed(id);
        this._islandMascots.set(id, im);
        this._island.add_child(im);
        this._refreshHeader();
    }

    updateSession(id, state) {
        const m = this._mascots.get(id);
        if (m)
            m.setState(state.activity, state.mood);
        const im = this._islandMascots.get(id);
        if (im)
            im.setState(state.activity, state.mood);
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
        this._working.delete(id);
        this._syncSpinner();
    }

    pushFeed(msg) {
        const proj = msg.cwd ? GLib.path_get_basename(msg.cwd) : msg.session_id.slice(0, 6);
        const t = new Date(msg.ts * 1000).toLocaleTimeString();
        this._feed.unshift(`${t}  ${proj}  ${msg.event}`);
        this._feed = this._feed.slice(0, FEED_MAX);
        this._feedLabel.set_text(this._feed.join('\n'));
    }

    setStatusText(text) {
        this._status.label.set_text(text);
    }

    _refreshUsage() {
        const s = this._usage.summary();
        if (!s) {
            this._usageRow.label.set_text("Usage aujourd'hui : calcul…");
            return;
        }
        const extra = s.skipped ? ` · +${s.skipped} fich. ignorés` : '';
        this._usageRow.label.set_text(
            `Usage aujourd'hui (approx.) : ${humanize(s.work)} tok · cache ${humanize(s.cache)}${extra}`);
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

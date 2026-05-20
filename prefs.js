import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { withHooks, withoutHooks, hooksPresent } from './lib/hooksConfig.js';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnotchiPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const behavior = new Adw.PreferencesGroup({ title: 'Comportement' });
        page.add(behavior);

        const modes = ['off', 'local', 'local-headless'];
        const modeRow = new Adw.ComboRow({
            title: 'Mode émotions',
            subtitle: 'local-headless envoie le prompt à Claude via votre login Claude Code',
            model: Gtk.StringList.new(modes),
        });
        const idx = modes.indexOf(settings.get_string('emotion-mode'));
        modeRow.set_selected(idx >= 0 ? idx : modes.indexOf('local'));
        modeRow.connect('notify::selected', () =>
            settings.set_string('emotion-mode', modes[modeRow.get_selected()]));
        behavior.add(modeRow);

        const idleRow = new Adw.SpinRow({
            title: "Minutes d'inactivité avant retrait",
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 240, step_increment: 1, page_increment: 10 }),
        });
        settings.bind('idle-timeout-minutes', idleRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(idleRow);

        const maxRow = new Adw.SpinRow({
            title: 'Mascottes max dans le top bar',
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 20, step_increment: 1, page_increment: 5 }),
        });
        settings.bind('max-mascots', maxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(maxRow);

        const diag = new Adw.PreferencesGroup({ title: 'Diagnostic' });
        page.add(diag);
        const settingsPath = `${GLib.get_home_dir()}/.claude/settings.json`;
        const emit = GLib.build_filenamev([this.path, 'tools', 'gnotchi-emit']);

        const stateRow = new Adw.ActionRow({ title: 'Hooks Claude Code' });
        diag.add(stateRow);

        const readSettings = () => {
            const f = Gio.File.new_for_path(settingsPath);
            if (!f.query_exists(null))
                return {};
            const [ok, bytes] = GLib.file_get_contents(settingsPath);
            if (!ok)
                throw new Error('lecture impossible');
            const t = new TextDecoder().decode(bytes);
            return t.trim() ? JSON.parse(t) : {};
        };
        const writeSettings = (obj) => {
            const next = JSON.stringify(obj, null, 2) + '\n';
            const tmp = `${settingsPath}.gnotchi.tmp`;
            GLib.file_set_contents(tmp, next);
            Gio.File.new_for_path(tmp).move(
                Gio.File.new_for_path(settingsPath),
                Gio.FileCopyFlags.OVERWRITE, null, null);
        };
        const refresh = () => {
            try {
                stateRow.subtitle = hooksPresent(readSettings(), emit)
                    ? 'posés et à jour' : 'absents ou périmés — cliquez « Installer / réparer »';
            } catch (e) {
                stateRow.subtitle = `settings.json illisible : ${e.message}`;
            }
        };

        const installBtn = new Gtk.Button({ label: 'Installer / réparer les hooks', valign: Gtk.Align.CENTER });
        installBtn.connect('clicked', () => {
            try { writeSettings(withHooks(readSettings(), emit)); } catch (e) { logError(e); }
            refresh();
        });
        const installRow = new Adw.ActionRow({ title: 'Poser ou réparer les hooks' });
        installRow.add_suffix(installBtn);
        installRow.activatable_widget = installBtn;
        diag.add(installRow);

        const removeBtn = new Gtk.Button({ label: 'Retirer les hooks', valign: Gtk.Align.CENTER });
        removeBtn.connect('clicked', () => {
            try { writeSettings(withoutHooks(readSettings())); } catch (e) { logError(e); }
            refresh();
        });
        const removeRow = new Adw.ActionRow({ title: 'Retirer les hooks gnotchi' });
        removeRow.add_suffix(removeBtn);
        removeRow.activatable_widget = removeBtn;
        diag.add(removeRow);

        refresh();

        window.add(page);
    }
}

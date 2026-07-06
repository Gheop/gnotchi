import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    newPet, applyEvent, stageForXp, hungerLevel,
    serializePets, parsePets, capPets,
} from '../lib/pet.js';

const SAVE_DEBOUNCE_MS = 30000;

export class PetStore {
    constructor(dir) {
        this._pets = new Map(); // cwd -> { xp, bornTs, lastFedTs }
        this._dirty = false;
        this._saveId = 0;
        this._dir = dir ||
            GLib.build_filenamev([GLib.get_user_data_dir(), 'gnotchi']);
        this._path = GLib.build_filenamev([this._dir, 'pets.json']);
    }

    load() {
        try {
            const f = Gio.File.new_for_path(this._path);
            if (!f.query_exists(null))
                return;
            const [ok, bytes] = GLib.file_get_contents(this._path);
            if (ok)
                this._pets = parsePets(new TextDecoder().decode(bytes));
        } catch (e) {
            logError(e, 'gnotchi: petStore load');
            this._pets = new Map();
        }
    }

    onEvent(cwd, event, _data, now) {
        if (typeof cwd !== 'string' || !cwd)
            return null;
        let pet = this._pets.get(cwd);
        if (!pet) {
            pet = newPet(now);
            this._pets.set(cwd, pet);
        }
        const { pet: next, justAte, leveledUp } = applyEvent(pet, event, now);
        if (justAte) {
            this._pets.set(cwd, next);
            this._markDirty();
        }
        return { stage: stageForXp(this._pets.get(cwd).xp), justAte, leveledUp };
    }

    stageFor(cwd) {
        const p = this._pets.get(cwd);
        return p ? stageForXp(p.xp) : 'egg';
    }

    hungerFor(cwd, now) {
        const p = this._pets.get(cwd);
        return p ? hungerLevel(p, now) : 0;
    }

    topPets(n) {
        return [...this._pets.entries()]
            .map(([cwd, p]) => ({ cwd, xp: p.xp, stage: stageForXp(p.xp) }))
            .sort((a, b) => b.xp - a.xp)
            .slice(0, n);
    }

    _markDirty() {
        this._dirty = true;
        if (this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            SAVE_DEBOUNCE_MS, () => {
                this._saveId = 0;
                this.flush();
                return GLib.SOURCE_REMOVE;
            });
    }

    flush() {
        if (!this._dirty)
            return;
        this._pets = capPets(this._pets);
        try {
            GLib.mkdir_with_parents(this._dir, 0o755);
            const tmp = `${this._path}.tmp`;
            GLib.file_set_contents(tmp, serializePets(this._pets));
            Gio.File.new_for_path(tmp).move(
                Gio.File.new_for_path(this._path),
                Gio.FileCopyFlags.OVERWRITE, null, null);
            this._dirty = false;
        } catch (e) {
            logError(e, 'gnotchi: petStore flush');
        }
    }

    destroy() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        this.flush();
    }
}

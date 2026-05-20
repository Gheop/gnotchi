import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    parseUsageLine, sumUsage, headline, startOfTodayMs,
} from '../lib/usage.js';

const TAIL_BYTES = 262144;
const MAX_FILES = 250;
const CACHE_MS = 60000;

// Promisifie un appel *_async via sa forme callback (auto-contenu :
// évite tout conflit avec un Gio._promisify global du Shell).
function pcall(obj, method, ...args) {
    const finish = method.replace(/_async$/, '_finish');
    return new Promise((resolve, reject) => {
        obj[method](...args, (src, res) => {
            try {
                resolve(src[finish](res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

export class UsageTracker {
    constructor() {
        this._cache = null;
        this._cacheTs = 0;
        this._busy = false;
        this._cancel = new Gio.Cancellable();
    }

    // Renvoie le résumé caché (ou null au tout début) et déclenche un
    // rafraîchissement async si le cache a plus de 60 s.
    summary() {
        if (this._cache && Date.now() - this._cacheTs < CACHE_MS)
            return this._cache;
        this._refresh().catch(e => logError(e, 'gnotchi: usage'));
        return this._cache;
    }

    async _refresh() {
        if (this._busy)
            return;
        this._busy = true;
        try {
            const now = Date.now();
            const since = startOfTodayMs(now);
            const root = GLib.build_filenamev(
                [GLib.get_home_dir(), '.claude', 'projects']);
            const files = await this._listToday(root, since);
            files.sort((a, b) => b.mtime - a.mtime);
            const skipped = Math.max(0, files.length - MAX_FILES);
            const entries = [];
            for (const f of files.slice(0, MAX_FILES)) {
                for (const ln of await this._tailLines(f.path, f.size)) {
                    const e = parseUsageLine(ln);
                    if (e)
                        entries.push(e);
                }
            }
            const h = headline(sumUsage(entries, since));
            this._cache = { work: h.work, cache: h.cache, skipped };
            this._cacheTs = Date.now();
        } catch (e) {
            logError(e, 'gnotchi: usage refresh');
        } finally {
            this._busy = false;
        }
    }

    async _listToday(root, since) {
        const out = [];
        const dir = Gio.File.new_for_path(root);
        let projEnum;
        try {
            projEnum = await pcall(dir, 'enumerate_children_async',
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
                this._cancel);
        } catch {
            return out;
        }
        for (;;) {
            const infos = await pcall(projEnum, 'next_files_async',
                32, GLib.PRIORITY_DEFAULT, this._cancel);
            if (!infos.length)
                break;
            for (const pi of infos) {
                if (pi.get_file_type() !== Gio.FileType.DIRECTORY)
                    continue;
                const sub = dir.get_child(pi.get_name());
                let sEnum;
                try {
                    sEnum = await pcall(sub, 'enumerate_children_async',
                        'standard::name,time::modified,standard::size',
                        Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
                        this._cancel);
                } catch {
                    continue;
                }
                for (;;) {
                    const fis = await pcall(sEnum, 'next_files_async',
                        64, GLib.PRIORITY_DEFAULT, this._cancel);
                    if (!fis.length)
                        break;
                    for (const fi of fis) {
                        const name = fi.get_name();
                        if (!name.endsWith('.jsonl'))
                            continue;
                        const dt = fi.get_modification_date_time();
                        const ms = dt ? dt.to_unix() * 1000 : 0;
                        if (ms < since)
                            continue;
                        out.push({
                            path: sub.get_child(name).get_path(),
                            mtime: ms,
                            size: fi.get_size(),
                        });
                    }
                }
                try {
                    sEnum.close(this._cancel);
                } catch { }
            }
        }
        try {
            projEnum.close(this._cancel);
        } catch { }
        return out;
    }

    async _tailLines(path, size) {
        const start = size > TAIL_BYTES ? size - TAIL_BYTES : 0;
        const want = size - start;
        if (want <= 0)
            return [];
        const f = Gio.File.new_for_path(path);
        let stream;
        try {
            stream = await pcall(f, 'read_async',
                GLib.PRIORITY_DEFAULT, this._cancel);
            if (start > 0)
                stream.seek(start, GLib.SeekType.SET, this._cancel);
            const bytes = await pcall(stream, 'read_bytes_async',
                want, GLib.PRIORITY_DEFAULT, this._cancel);
            try {
                stream.close(this._cancel);
            } catch { }
            const text = new TextDecoder().decode(bytes.toArray());
            const lines = text.split('\n');
            if (start > 0)
                lines.shift(); // 1re ligne partielle
            return lines;
        } catch {
            try {
                if (stream)
                    stream.close(this._cancel);
            } catch { }
            return [];
        }
    }

    destroy() {
        try {
            this._cancel.cancel();
        } catch { }
        this._cache = null;
    }
}

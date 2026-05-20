export const MAX_LINE_BYTES = 65536;

export const KNOWN_EVENTS = new Set([
    'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'Notification', 'Stop', 'PreCompact', 'SessionEnd', 'Emotion',
]);

export class LineFramer {
    constructor() {
        this._buf = '';
        this._overflow = false;
    }

    feed(chunk) {
        const lines = [];
        this._buf += chunk;
        let idx;
        while ((idx = this._buf.indexOf('\n')) !== -1) {
            const line = this._buf.slice(0, idx);
            this._buf = this._buf.slice(idx + 1);
            if (this._overflow) {
                this._overflow = false; // ligne fautive terminée, on resynchronise
                continue;
            }
            if (line.length > MAX_LINE_BYTES)
                continue; // ligne complète surdimensionnée : on jette, garde inconditionnelle
            lines.push(line);
        }
        if (this._buf.length > MAX_LINE_BYTES) {
            this._buf = '';
            this._overflow = true;
        }
        return lines;
    }
}

export function validateMessage(obj, now) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
        return { ok: false, reason: 'pas-un-objet' };
    if (obj.v !== 1)
        return { ok: false, reason: 'version' };
    if (!KNOWN_EVENTS.has(obj.event))
        return { ok: false, reason: 'event-inconnu' };
    if (typeof obj.session_id !== 'string' || obj.session_id.length === 0)
        return { ok: false, reason: 'session_id' };
    const ts = Number(obj.ts);
    return {
        ok: true,
        msg: {
            v: 1,
            event: obj.event,
            session_id: obj.session_id,
            cwd: typeof obj.cwd === 'string' ? obj.cwd : '',
            ts: Number.isFinite(ts) && ts > 0 ? ts : now,
            data: (typeof obj.data === 'object' && obj.data !== null && !Array.isArray(obj.data)) ? obj.data : {},
        },
    };
}

export function parseLine(line, now) {
    let obj;
    try {
        obj = JSON.parse(line);
    } catch {
        return { ok: false, reason: 'json' };
    }
    return validateMessage(obj, now);
}

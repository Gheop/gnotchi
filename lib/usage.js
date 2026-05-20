// Agrégation locale de l'usage tokens depuis les transcripts Claude Code.
// Module pur, sans dépendance GNOME.

export function parseUsageLine(line) {
    let d;
    try {
        d = JSON.parse(line);
    } catch {
        return null;
    }
    const u = d && d.message && d.message.usage;
    if (!u || typeof u !== 'object')
        return null;
    const n = (x) => (Number.isFinite(x) ? x : 0);
    const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
    return {
        ts: Number.isFinite(ts) ? ts : null,
        input: n(u.input_tokens),
        output: n(u.output_tokens),
        cacheCreation: n(u.cache_creation_input_tokens),
        cacheRead: n(u.cache_read_input_tokens),
    };
}

export function sumUsage(entries, sinceMs) {
    const t = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    for (const e of entries) {
        if (!e || !Number.isFinite(e.ts) || e.ts < sinceMs)
            continue;
        t.input += e.input;
        t.output += e.output;
        t.cacheCreation += e.cacheCreation;
        t.cacheRead += e.cacheRead;
    }
    return t;
}

export function headline(totals) {
    return {
        work: totals.input + totals.output + totals.cacheCreation,
        cache: totals.cacheRead,
    };
}

export function humanize(value) {
    if (!Number.isFinite(value))
        return '0';
    const n = Math.max(0, Math.floor(value));
    const fmt = (v, s) => {
        const r = Math.round(v * 10) / 10;
        return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + s;
    };
    if (n < 1000)
        return String(n);
    if (n < 1e6)
        return fmt(n / 1e3, 'k');
    if (n < 1e9)
        return fmt(n / 1e6, 'M');
    return fmt(n / 1e9, 'G');
}

export function startOfTodayMs(now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

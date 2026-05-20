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

const ONE_DAY_MS = 86400000;

// Regroupe les entries par jour local sur `days` jours, en finissant par
// `anchorStartMs` (minuit local du jour courant). Renvoie un array de
// taille `days`, du plus ancien au plus récent.
export function aggregateByDay(entries, anchorStartMs, days) {
    const buckets = Array.from({ length: days }, () => ({ work: 0, cache: 0 }));
    const oldest = anchorStartMs - (days - 1) * ONE_DAY_MS;
    const newest = anchorStartMs + ONE_DAY_MS;
    for (const e of entries) {
        if (!e || !Number.isFinite(e.ts))
            continue;
        if (e.ts < oldest || e.ts >= newest)
            continue;
        const idx = Math.floor((e.ts - oldest) / ONE_DAY_MS);
        if (idx < 0 || idx >= days)
            continue;
        buckets[idx].work += e.input + e.output + e.cacheCreation;
        buckets[idx].cache += e.cacheRead;
    }
    return buckets;
}

// Agrégation par projet. Chaque entry doit porter un champ `project`
// (slug `~/.claude/projects/<slug>/` typiquement). Renvoie un array
// `[{project, work, cache}]` trié par work décroissant.
export function aggregateByProject(entries, sinceMs) {
    const map = new Map();
    for (const e of entries) {
        if (!e || typeof e.project !== 'string' || !e.project)
            continue;
        if (!Number.isFinite(e.ts) || e.ts < sinceMs)
            continue;
        const cur = map.get(e.project) || { work: 0, cache: 0 };
        cur.work += e.input + e.output + e.cacheCreation;
        cur.cache += e.cacheRead;
        map.set(e.project, cur);
    }
    return [...map.entries()]
        .map(([project, totals]) => ({ project, ...totals }))
        .sort((a, b) => b.work - a.work);
}

// Le slug Claude Code est le cwd path-encodé (slashes -> tirets).
// On garde le dernier segment pour rester lisible et court à l'affichage.
export function prettyProject(slug) {
    if (typeof slug !== 'string' || !slug)
        return '?';
    const trimmed = slug.replace(/^-+|-+$/g, '');
    const parts = trimmed.split('-').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : slug;
}

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// Sparkline en blocks Unicode. Échelle relative au max de la série.
// Une valeur 0 stricte donne le glyphe le plus bas ; une valeur >0 mais
// très faible donne au moins le 2e niveau pour rester visible.
export function sparkline(values) {
    if (!values || !values.length)
        return '';
    const max = Math.max(...values, 0);
    if (max === 0)
        return SPARK_CHARS[0].repeat(values.length);
    return values.map(v => {
        if (v <= 0)
            return SPARK_CHARS[0];
        const ratio = v / max;
        const idx = Math.min(SPARK_CHARS.length - 1,
            Math.max(1, Math.ceil(ratio * (SPARK_CHARS.length - 1))));
        return SPARK_CHARS[idx];
    }).join('');
}

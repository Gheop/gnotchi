// Quota Claude Code (abonnement Pro/Max) tel que renvoyé par l'endpoint
// OAuth d'Anthropic. Module pur, sans dépendance GNOME.
//
// L'endpoint n'est pas documenté publiquement : le parsing reste tolérant
// (champ manquant -> null) pour ne jamais casser l'affichage du popup.
// La réponse expose deux vues redondantes, `five_hour`/`seven_day` et un
// tableau `limits` plus riche (severity, limite hebdo scopée par modèle).
// On lit `limits` en priorité et on retombe sur les champs plats.

import { humanDuration } from './duration.js';

function parseResetsAt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        // secondes epoch ; au-delà de 1e11 c'est déjà des millisecondes
        return value > 1e11 ? value : value * 1000;
    }
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}

function clampPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return null;
    return Math.min(100, Math.max(0, n));
}

function fromFlat(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const pct = clampPct(raw.utilization);
    if (pct === null)
        return null;
    return { pct, resetsAt: parseResetsAt(raw.resets_at), severity: null, scope: null };
}

function fromLimit(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const pct = clampPct(raw.percent);
    if (pct === null)
        return null;
    const model = raw.scope && raw.scope.model && raw.scope.model.display_name;
    return {
        pct,
        resetsAt: parseResetsAt(raw.resets_at),
        severity: typeof raw.severity === 'string' ? raw.severity : null,
        scope: typeof model === 'string' && model ? model : null,
    };
}

function findLimit(limits, kind) {
    if (!Array.isArray(limits))
        return null;
    for (const l of limits) {
        if (l && l.kind === kind)
            return fromLimit(l);
    }
    return null;
}

// Accepte le texte brut de la réponse ou un objet déjà décodé.
export function parseQuota(input) {
    let data = input;
    if (typeof input === 'string') {
        try {
            data = JSON.parse(input);
        } catch {
            return null;
        }
    }
    if (!data || typeof data !== 'object')
        return null;
    const session = findLimit(data.limits, 'session') || fromFlat(data.five_hour);
    const weekly = findLimit(data.limits, 'weekly_all') || fromFlat(data.seven_day);
    const scoped = findLimit(data.limits, 'weekly_scoped');
    if (!session && !weekly && !scoped)
        return null;
    return { session, weekly, scoped };
}

// Extrait le token OAuth de ~/.claude/.credentials.json.
export function extractToken(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object')
        return null;
    const oauth = data.claudeAiOauth || {};
    const candidates = [
        oauth.accessToken, oauth.access_token,
        data.accessToken, data.access_token,
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c)
            return c;
    }
    return null;
}

// Le token porte sa propre date d'expiration : inutile de tenter l'appel
// si elle est passée (Claude Code le rafraîchira de son côté).
export function isTokenExpired(text, now) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return false;
    }
    const exp = data && data.claudeAiOauth && data.claudeAiOauth.expiresAt;
    return Number.isFinite(exp) && exp <= now;
}

function formatWindow(label, win, now) {
    if (!win)
        return `${label} —`;
    const name = win.scope ? `${label} ${win.scope}` : label;
    const pct = `${Math.round(win.pct)} %`;
    if (!Number.isFinite(win.resetsAt))
        return `${name} ${pct}`;
    const left = win.resetsAt - now;
    if (left <= 0)
        return `${name} ${pct} · reset imminent`;
    return `${name} ${pct} · reset dans ${humanDuration(left)}`;
}

// Deux lignes pour le popup : la fenêtre 5 h, puis l'hebdo (global et,
// si l'API la renvoie, la part scopée au modèle).
export function formatQuota(quota, now) {
    if (!quota)
        return null;
    const weekly = [formatWindow('7 j', quota.weekly, now)];
    if (quota.scoped)
        weekly.push(formatWindow('dont', quota.scoped, now));
    return {
        session: `Quota session : ${formatWindow('5 h', quota.session, now)}`,
        weekly: `Quota hebdo : ${weekly.join('  ·  ')}`,
    };
}

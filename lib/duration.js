// Formatage compact de durées (depuis un événement). Pas de zero-padding,
// granularité dégradée selon l'ordre de grandeur :
//   < 60s   -> "12s"
//   < 1h    -> "5m"
//   < 24h   -> "2h", "2h15m"
//   >= 24h  -> "3d", "3d4h"
// Renvoie "?" pour des entrées non finies ou négatives.

export function humanDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '?';
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) {
        const mm = m - h * 60;
        return mm > 0 ? `${h}h${mm}m` : `${h}h`;
    }
    const d = Math.floor(h / 24);
    const hh = h - d * 24;
    return hh > 0 ? `${d}d${hh}h` : `${d}d`;
}

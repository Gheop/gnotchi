// Filtre pur des messages du feed (popup).
// "all" laisse tout passer ; "significant" ne garde que les événements à
// gros impact narratif d'une session (démarrage/fin, complétion, compaction,
// erreurs d'outils), pour éviter le bruit en working intense.

const SIGNIFICANT_EVENTS = new Set([
    'SessionStart',
    'Stop',
    'PreCompact',
    'SessionEnd',
]);

export function isSignificant(msg) {
    if (!msg || typeof msg.event !== 'string')
        return false;
    if (SIGNIFICANT_EVENTS.has(msg.event))
        return true;
    if (msg.event === 'PostToolUse' && msg.data && msg.data.is_error === true)
        return true;
    return false;
}

export function shouldDisplay(msg, mode) {
    if (mode === 'significant')
        return isSignificant(msg);
    return true;
}

// Calcule les hooks gnotchi dans un objet settings.json (pur, sans GNOME).
// Mêmes 8 événements et même détection que tools/install-hooks.sh.

export const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse',
    'PostToolUse', 'Notification', 'Stop', 'PreCompact', 'SessionEnd'];

const GNOTCHI_RE = new RegExp('(^|/)gnotchi-emit (' + EVENTS.join('|') + ')$');

function clone(o) {
    return JSON.parse(JSON.stringify(o || {}));
}

export function isGnotchiGroup(group) {
    const hooks = (group && group.hooks) || [];
    return hooks.some(h => GNOTCHI_RE.test(String((h && h.command) || '')));
}

export function withHooks(settings, emitPath) {
    const s = clone(settings);
    // hooks corrompu (array, string…) → on repart d'un objet vide
    const hooks = (s.hooks && typeof s.hooks === 'object' && !Array.isArray(s.hooks))
        ? s.hooks : {};
    for (const ev of EVENTS) {
        const kept = (Array.isArray(hooks[ev]) ? hooks[ev] : [])
            .filter(g => !isGnotchiGroup(g));
        kept.push({ hooks: [{ type: 'command', command: `${emitPath} ${ev}` }] });
        hooks[ev] = kept;
    }
    s.hooks = hooks;
    return s;
}

export function withoutHooks(settings) {
    const s = clone(settings);
    const hooks = (s.hooks && typeof s.hooks === 'object' && !Array.isArray(s.hooks))
        ? s.hooks : null;
    if (!hooks)
        return s;
    for (const ev of Object.keys(hooks)) {
        const kept = (Array.isArray(hooks[ev]) ? hooks[ev] : [])
            .filter(g => !isGnotchiGroup(g));
        if (kept.length)
            hooks[ev] = kept;
        else
            delete hooks[ev];
    }
    if (Object.keys(hooks).length === 0)
        delete s.hooks;
    return s;
}

export function hooksPresent(settings, emitPath) {
    const hooks = (settings && settings.hooks) || {};
    return EVENTS.every(ev => {
        const groups = Array.isArray(hooks[ev]) ? hooks[ev] : [];
        return groups.some(g =>
            ((g && g.hooks) || []).some(h =>
                String((h && h.command) || '') === `${emitPath} ${ev}`));
    });
}

export function needsWrite(settings, emitPath) {
    return !hooksPresent(settings, emitPath);
}

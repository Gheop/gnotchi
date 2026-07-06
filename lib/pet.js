// Logique pure du pet (une créature par projet). Aucune dépendance GNOME.

export const XP_PER_TOOL = 1;
export const XP_PER_TURN = 10;

// Seuils de stade, en XP cumulé, du plus bas au plus haut.
export const STAGE_THRESHOLDS = [
    { stage: 'egg', min: 0 },
    { stage: 'baby', min: 50 },
    { stage: 'teen', min: 300 },
    { stage: 'adult', min: 1000 },
];

const HOUR_MS = 3600000;
export const HUNGER_PECKISH_MS = 2 * HOUR_MS;
export const HUNGER_STARVING_MS = 8 * HOUR_MS;

export function xpForEvent(event) {
    if (event === 'PostToolUse')
        return XP_PER_TOOL;
    if (event === 'Stop')
        return XP_PER_TURN;
    return 0;
}

export function stageForXp(xp) {
    let stage = 'egg';
    for (const t of STAGE_THRESHOLDS) {
        if (xp >= t.min)
            stage = t.stage;
    }
    return stage;
}

export function newPet(now) {
    return { xp: 0, bornTs: now, lastFedTs: now };
}

export function applyEvent(pet, event, now) {
    const gain = xpForEvent(event);
    if (gain === 0)
        return { pet, justAte: false, leveledUp: false };
    const before = stageForXp(pet.xp);
    const next = { ...pet, xp: pet.xp + gain, lastFedTs: now };
    const leveledUp = stageForXp(next.xp) !== before;
    return { pet: next, justAte: true, leveledUp };
}

export function hungerLevel(pet, now) {
    const dt = now - pet.lastFedTs;
    if (dt >= HUNGER_STARVING_MS)
        return 2;
    if (dt >= HUNGER_PECKISH_MS)
        return 1;
    return 0;
}

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

export const PETS_VERSION = 1;
export const MAX_PETS = 200;

export function serializePets(petsMap) {
    const pets = {};
    for (const [cwd, p] of petsMap.entries())
        pets[cwd] = { xp: p.xp, bornTs: p.bornTs, lastFedTs: p.lastFedTs };
    return JSON.stringify({ version: PETS_VERSION, pets });
}

export function parsePets(text) {
    let obj;
    try {
        obj = JSON.parse(text);
    } catch {
        return new Map();
    }
    if (!obj || obj.version !== PETS_VERSION ||
        typeof obj.pets !== 'object' || obj.pets === null)
        return new Map();
    const out = new Map();
    for (const [cwd, p] of Object.entries(obj.pets)) {
        if (!p || typeof p !== 'object')
            continue;
        const xp = Number(p.xp);
        if (!Number.isFinite(xp) || xp < 0)
            continue;
        const bornTs = Number(p.bornTs);
        const lastFedTs = Number(p.lastFedTs);
        out.set(cwd, {
            xp,
            bornTs: Number.isFinite(bornTs) ? bornTs : 0,
            lastFedTs: Number.isFinite(lastFedTs) ? lastFedTs : 0,
        });
    }
    return out;
}

// Garde au plus `max` pets, ceux au lastFedTs le plus récent.
export function capPets(petsMap, max = MAX_PETS) {
    if (petsMap.size <= max)
        return petsMap;
    const sorted = [...petsMap.entries()]
        .sort((a, b) => b[1].lastFedTs - a[1].lastFedTs);
    return new Map(sorted.slice(0, max));
}

// Taille d'icône par stade, dérivée d'une base (22 top bar, 48 island).
const STAGE_SCALE = { egg: 0.55, baby: 0.62, teen: 0.82, adult: 1 };

export function stageIconSize(stage, baseSize) {
    const f = STAGE_SCALE[stage] ?? 1;
    return Math.max(1, Math.round(baseSize * f));
}

// La faim penche l'humeur idle vers 'sad' quand affamé, sans écraser une
// humeur déjà expressive.
export function hungerMood(baseMood, level) {
    if (level >= 2 && (baseMood === 'neutral' || baseMood === undefined))
        return 'sad';
    return baseMood;
}

const STAGE_EMOJI = { egg: '🥚', baby: '🐣', teen: '🧒', adult: '🧑' };

export function stageEmoji(stage) {
    return STAGE_EMOJI[stage] ?? '🥚';
}

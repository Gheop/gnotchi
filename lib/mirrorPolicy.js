// Politique miroir des mascottes (pur, sans dépendance GNOME).
// Reprise de notchi : SpriteMirrorPolicy / NotchiState.mirrorPolicy.

// FNV-1a 32 bits, déterministe. Source unique de hachage du projet.
export function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// Bornes en secondes. Activité inconnue -> never.
const MODES = {
    idle: { kind: 'timed', lo: 30, hi: 60 },
    waiting: { kind: 'timed', lo: 45, hi: 90 },
    working: { kind: 'timed', lo: 10, hi: 15 },
    compacting: { kind: 'stateEntry' },
    sleeping: { kind: 'never' },
    waving: { kind: 'never' },
};

export function mirrorMode(activity) {
    return MODES[activity] ? { ...MODES[activity] } : { kind: 'never' };
}

// Décision figée à l'entrée d'un état (mode stateEntry).
export function entryMirrored(seed, activity, entrySeq) {
    return (hash(`${seed}|${activity}|${entrySeq}`) & 1) === 0;
}

export function isMirrored(activity, seed, nowSec, entryMirroredFlag) {
    const m = mirrorMode(activity);
    if (m.kind === 'never')
        return false;
    if (m.kind === 'stateEntry')
        // entryMirroredFlag doit être un booléen ; undefined => false silencieux.
        return entryMirroredFlag === true;
    const interval = m.lo + (hash(`${seed}|${activity}|i`) % (m.hi - m.lo + 1));
    const win = Math.floor(nowSec / interval);
    return (hash(`${seed}|${activity}|${win}`) & 1) === 0;
}

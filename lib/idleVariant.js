// Variation idle : à chaque entrée dans idle/neutral, on retire au sort entre
// la pose classique et la pose méditation. Choix déterministe par
// (seed, entrySeq) pour rester reproductible et désynchroniser les sessions.

const MEDITATE_EVERY = 3;

// hash 32 bits mixant seed et compteur d'entrée, sans Date/Math.random.
function mix(seed, entrySeq) {
    let h = (seed >>> 0) ^ ((entrySeq * 2654435761) >>> 0);
    h = Math.imul(h, 1597334677) >>> 0;
    h ^= h >>> 15;
    return h >>> 0;
}

export function chooseIdleMood(mood, seed, entrySeq) {
    if (mood !== 'neutral')
        return mood;
    return (mix(seed, entrySeq) % MEDITATE_EVERY) === 0 ? 'meditating' : 'neutral';
}

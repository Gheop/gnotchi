// Variation idle : à chaque entrée dans idle/neutral, on retire au sort entre
// la pose classique, la méditation (fréquente) et le cowboy au lasso (rare,
// easter-egg). Choix déterministe par (seed, entrySeq) pour rester
// reproductible et désynchroniser les sessions.
//
// Répartition sur 12 buckets : cowboy 1/12, meditating 4/12, neutral 7/12.
const COWBOY_BUCKET = 0;
const MEDITATE_MAX_BUCKET = 4; // buckets 1..4

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
    const bucket = mix(seed, entrySeq) % 12;
    if (bucket === COWBOY_BUCKET)
        return 'cowboy';
    if (bucket <= MEDITATE_MAX_BUCKET)
        return 'meditating';
    return 'neutral';
}

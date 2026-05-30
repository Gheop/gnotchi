// Mapping (activity, mood) -> nom de fichier sprite notchi.
// La matrice notchi est éparse : repli documenté ci-dessous.

const AVAILABLE = {
    idle: ['neutral', 'happy', 'elated', 'sad', 'sobbing', 'meditating', 'cowboy'],
    working: ['neutral', 'happy', 'sad', 'sobbing'],
    waiting: ['neutral', 'happy', 'sad', 'sobbing'],
    sleeping: ['neutral'],
    compacting: ['neutral'],
    waving: ['neutral'],
};

function resolveMood(activity, mood) {
    const avail = AVAILABLE[activity] ?? ['neutral'];
    if (avail.includes(mood))
        return mood;
    if (mood === 'elated' && avail.includes('happy'))
        return 'happy';
    return 'neutral';
}

// 'sobbing' (vocabulaire gnotchi) s'écrit 'sob' dans les fichiers notchi.
function moodToken(mood) {
    return mood === 'sobbing' ? 'sob' : mood;
}

export function spriteFile(activity, mood) {
    const a = AVAILABLE[activity] ? activity : 'idle';
    const m = resolveMood(a, mood);
    return `claude_${a}_${moodToken(m)}.png`;
}

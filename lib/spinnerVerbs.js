// Verbes fantaisistes pour l'indicateur « en train de travailler »,
// extraits et triés de notchi SpinnerVerbs.all (participes présents anglais).
// Module pur, sans dépendance GNOME.

export const VERBS = [
    'Accomplishing', 'Actualizing', 'Architecting', 'Baking', 'Bamboozling',
    'Befuddling', 'Bloviating', 'Booping', 'Bootstrapping', 'Brewing',
    'Burrowing', 'Calculating', 'Canoodling', 'Caramelizing', 'Cascading',
    'Catapulting', 'Cerebrating', 'Channeling', 'Churning', 'Clanking',
    'Coalescing', 'Cogitating', 'Combobulating', 'Composing', 'Computing',
    'Concocting', 'Considering', 'Contemplating', 'Cooking', 'Crafting',
    'Creating', 'Crunching', 'Crystallizing', 'Cultivating', 'Deciphering',
    'Deliberating', 'Determining', 'Discombobulating', 'Doodling', 'Effecting',
    'Elucidating', 'Embellishing', 'Enchanting', 'Envisioning', 'Fabricating',
    'Fermenting', 'Finagling', 'Flummoxing', 'Forging', 'Formulating',
    'Frolicking', 'Generating', 'Germinating', 'Hatching', 'Herding',
    'Ideating', 'Imagining', 'Improvising', 'Incubating', 'Inferring',
    'Juggling', 'Manifesting', 'Marinating', 'Mulling', 'Munging',
    'Noodling', 'Orchestrating', 'Percolating', 'Pondering', 'Processing',
    'Puzzling', 'Reticulating', 'Ruminating', 'Scheming', 'Sculpting',
    'Simmering', 'Smooshing', 'Spelunking', 'Spinning', 'Stewing',
    'Summoning', 'Synthesizing', 'Tinkering', 'Transmuting', 'Unfurling',
    'Vibing', 'Whirring', 'Wrangling',
];

export function randomVerb() {
    return VERBS[Math.floor(Math.random() * VERBS.length)];
}

export function nextVerb(current) {
    if (VERBS.length <= 1)
        return VERBS[0];
    let v = current;
    while (v === current)
        v = VERBS[Math.floor(Math.random() * VERBS.length)];
    return v;
}

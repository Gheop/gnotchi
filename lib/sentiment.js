export const MOODS = ['neutral', 'happy', 'elated', 'sad', 'sobbing'];

// Ordre de précédence : sobbing > elated > sad > happy > neutral. tools/gnotchi-emit maintient une liste de mots-clés parallèle (matching par sous-chaîne côté python).
const RULES = [
    { mood: 'sobbing', re: /(?<![a-zA-Zà-ÿ])(putain|merde|encore cass|toujours pas|tjrs pas|wtf|fait chier)(?![a-zA-Zà-ÿ])/i },
    { mood: 'elated',  re: /(?<![a-zA-Zà-ÿ])(parfait|génial|genial|excellent|incroyable|ça marche enfin|ca marche enfin|exactement)(?![a-zA-Zà-ÿ])/i },
    { mood: 'sad',     re: /(?<![a-zA-Zà-ÿ])(bug|cass[ée]|erreur|échec|echec|marche pas|plante|broken|fail)(?![a-zA-Zà-ÿ])/i },
    { mood: 'happy',   re: /(?<![a-zA-Zà-ÿ])(merci|super|nickel|bien joué|bien joue|top|cool|ça marche|ca marche)(?![a-zA-Zà-ÿ])/i },
];

export function classify(text) {
    const t = String(text ?? '');
    for (const { mood, re } of RULES) {
        if (re.test(t))
            return mood;
    }
    return 'neutral';
}

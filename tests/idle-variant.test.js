import { test, assertEqual, run } from './harness.js';
import { chooseIdleMood } from '../lib/idleVariant.js';

test('mood non-neutral passe tel quel', () => {
    for (const m of ['happy', 'elated', 'sad', 'sobbing']) {
        assertEqual(chooseIdleMood(m, 12345, 1), m);
        assertEqual(chooseIdleMood(m, 0, 7), m);
    }
});

test('neutral retourne soit neutral soit meditating', () => {
    for (let s = 0; s < 50; s++)
        for (let e = 0; e < 5; e++) {
            const r = chooseIdleMood('neutral', s, e);
            assertEqual(r === 'neutral' || r === 'meditating', true);
        }
});

test('determinisme : meme (seed, entrySeq) -> meme resultat', () => {
    for (let s = 0; s < 20; s++)
        for (let e = 0; e < 5; e++) {
            const a = chooseIdleMood('neutral', s, e);
            const b = chooseIdleMood('neutral', s, e);
            assertEqual(a, b);
        }
});

test('alternance : sur 300 tirages, meditating apparait ~1/3 du temps', () => {
    let med = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
        if (chooseIdleMood('neutral', i, 1) === 'meditating')
            med++;
    }
    // Tolérance large : entre 20 % et 50 %, mais on attend ~33 %.
    assertEqual(med > N * 0.2 && med < N * 0.5, true);
});

run();

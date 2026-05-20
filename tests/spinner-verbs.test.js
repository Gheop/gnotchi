import { test, assertEqual, assertTrue, run } from './harness.js';
import { VERBS, randomVerb, nextVerb } from '../lib/spinnerVerbs.js';

test('VERBS non vide, chaînes non vides, sans doublon', () => {
    assertTrue(Array.isArray(VERBS) && VERBS.length >= 30, 'liste suffisante');
    assertTrue(VERBS.every(v => typeof v === 'string' && v.length > 0), 'chaînes non vides');
    assertEqual(new Set(VERBS).size, VERBS.length);
});

test('VERBS : participes présents (se terminent par ing)', () => {
    assertTrue(VERBS.every(v => /ing$/.test(v)), 'tous en -ing');
});

test('randomVerb ∈ VERBS', () => {
    for (let i = 0; i < 200; i++)
        assertTrue(VERBS.includes(randomVerb()), 'membre de VERBS');
});

test('nextVerb ∈ VERBS et ≠ courant', () => {
    for (const cur of [VERBS[0], VERBS[VERBS.length - 1]]) {
        for (let i = 0; i < 200; i++) {
            const v = nextVerb(cur);
            assertTrue(VERBS.includes(v), 'membre');
            assertTrue(v !== cur, 'différent du courant');
        }
    }
});

test('nextVerb(undefined) renvoie un membre', () => {
    for (let i = 0; i < 50; i++)
        assertTrue(VERBS.includes(nextVerb(undefined)), 'membre');
});

run();

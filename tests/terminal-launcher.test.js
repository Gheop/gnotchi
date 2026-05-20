import { test, assertEqual, assertTrue, run } from './harness.js';
import { candidateArgvs } from '../lib/terminalLauncher.js';

test('candidateArgvs renvoie une liste non vide', () => {
    const argvs = candidateArgvs('claude');
    assertTrue(argvs.length >= 5);
});

test('chaque argv termine par une commande shell contenant la cible', () => {
    for (const argv of candidateArgvs('claude')) {
        assertTrue(argv.length >= 3);
        const last = argv[argv.length - 1];
        assertTrue(typeof last === 'string');
        assertTrue(last.includes('claude'));
    }
});

test('argv[0] est juste un binaire (pas de chemin absolu)', () => {
    for (const argv of candidateArgvs('whatever')) {
        assertEqual(argv[0].includes('/'), false);
    }
});

run();

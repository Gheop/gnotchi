import { test, assertEqual, run } from './harness.js';
import { humanDuration } from '../lib/duration.js';

test('humanDuration : secondes', () => {
    assertEqual(humanDuration(0), '0s');
    assertEqual(humanDuration(1000), '1s');
    assertEqual(humanDuration(59000), '59s');
});

test('humanDuration : minutes', () => {
    assertEqual(humanDuration(60000), '1m');
    assertEqual(humanDuration(5 * 60000), '5m');
    assertEqual(humanDuration(59 * 60000 + 59000), '59m');
});

test('humanDuration : heures avec mm', () => {
    assertEqual(humanDuration(60 * 60000), '1h');
    assertEqual(humanDuration(2 * 60 * 60000 + 15 * 60000), '2h15m');
    assertEqual(humanDuration(23 * 60 * 60000), '23h');
});

test('humanDuration : jours', () => {
    assertEqual(humanDuration(24 * 60 * 60000), '1d');
    assertEqual(humanDuration(3 * 24 * 60 * 60000 + 4 * 60 * 60000), '3d4h');
});

test('humanDuration : entrées invalides', () => {
    assertEqual(humanDuration(-1), '?');
    assertEqual(humanDuration(NaN), '?');
    assertEqual(humanDuration(Infinity), '?');
    assertEqual(humanDuration('toto'), '?');
});

run();

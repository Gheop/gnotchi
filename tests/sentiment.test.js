import { test, assertEqual, run } from './harness.js';
import { classify, MOODS } from '../lib/sentiment.js';

test('MOODS dans l\'ordre attendu', () => {
    assertEqual(MOODS, ['neutral', 'happy', 'elated', 'sad', 'sobbing']);
});

test('positif fort → elated', () => {
    assertEqual(classify('parfait, ça marche enfin, génial !'), 'elated');
});

test('positif → happy', () => {
    assertEqual(classify('super, merci beaucoup'), 'happy');
});

test('négatif → sad', () => {
    assertEqual(classify('il y a un bug, ça ne marche pas'), 'sad');
});

test('négatif fort → sobbing', () => {
    assertEqual(classify('toujours pas, encore cassé, putain'), 'sobbing');
});

test('neutre par défaut', () => {
    assertEqual(classify('ajoute une fonction qui lit le fichier'), 'neutral');
});

test('insensible à la casse', () => {
    assertEqual(classify('MERCI'), 'happy');
});

test('formes accentuées : cassé → sad', () => {
    assertEqual(classify('il est cassé'), 'sad');
});

test('formes accentuées : un échec → sad', () => {
    assertEqual(classify('c’est un échec'), 'sad');
});

test('formes accentuées : ça marche → happy', () => {
    assertEqual(classify('bon ça marche'), 'happy');
});

test('formes accentuées : ça marche enfin → elated', () => {
    assertEqual(classify('ça marche enfin'), 'elated');
});

test('bug ne matche pas dans debugging', () => {
    assertEqual(classify('je fais du debugging tranquille'), 'neutral');
});

run();

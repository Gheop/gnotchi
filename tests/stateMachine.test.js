import { test, assertEqual, assertTrue, run } from './harness.js';
import {
    initialState, reduce, ACTIVITIES,
    shouldDecayWorking, shouldDecayWaving, applyDecay, isExpired,
} from '../lib/stateMachine.js';

const ev = (event, data = {}, sid = 's1') => ({ event, data, session_id: sid });

test('ACTIVITIES', () => {
    assertEqual(ACTIVITIES, ['idle', 'working', 'waiting', 'sleeping', 'compacting', 'waving']);
});

test('initialState', () => {
    assertEqual(initialState(100), {
        activity: 'idle', mood: 'neutral', lastEventTs: 100, bornTs: 100, ended: false,
    });
});

test('UserPromptSubmit → working + humeur depuis data.emotion', () => {
    const s = reduce(initialState(0), ev('UserPromptSubmit', { emotion: 'happy' }), 5);
    assertEqual(s.activity, 'working');
    assertEqual(s.mood, 'happy');
    assertEqual(s.lastEventTs, 5);
});

test('UserPromptSubmit sans emotion garde l’humeur courante', () => {
    let s = reduce(initialState(0), ev('UserPromptSubmit', { emotion: 'sad' }), 1);
    s = reduce(s, ev('UserPromptSubmit', {}), 2);
    assertEqual(s.mood, 'sad');
});

test('Notification → waiting, Stop → idle, PreCompact → compacting', () => {
    assertEqual(reduce(initialState(0), ev('Notification'), 1).activity, 'waiting');
    assertEqual(reduce(initialState(0), ev('Stop'), 1).activity, 'idle');
    assertEqual(reduce(initialState(0), ev('PreCompact'), 1).activity, 'compacting');
});

test('Emotion ne change que l’humeur', () => {
    let s = reduce(initialState(0), ev('PreCompact'), 1);
    s = reduce(s, ev('Emotion', { emotion: 'elated' }), 2);
    assertEqual(s.activity, 'compacting');
    assertEqual(s.mood, 'elated');
});

test('SessionEnd marque ended', () => {
    const s = reduce(initialState(0), ev('SessionEnd'), 1);
    assertTrue(s.ended);
    assertEqual(s.lastEventTs, 1);
});

test('shouldDecayWorking seulement si working et délai dépassé', () => {
    const s = reduce(initialState(0), ev('PreToolUse'), 10);
    assertEqual(shouldDecayWorking(s, 19, 8), true);
    assertEqual(shouldDecayWorking(s, 11, 8), false);
    assertEqual(shouldDecayWorking({ ...s, activity: 'waiting' }, 999, 8), false);
});

test('applyDecay ramène working à idle uniquement', () => {
    assertEqual(applyDecay({ activity: 'working' }).activity, 'idle');
    assertEqual(applyDecay({ activity: 'waiting' }).activity, 'waiting');
});

test('isExpired', () => {
    const s = initialState(0);
    assertEqual(isExpired(s, 100, 50), true);
    assertEqual(isExpired(s, 40, 50), false);
});

test('Emotion ignore une humeur inconnue', () => {
    let s = reduce(initialState(0), ev('UserPromptSubmit', { emotion: 'happy' }), 1);
    s = reduce(s, ev('Emotion', { emotion: 'berserk' }), 2);
    assertEqual(s.mood, 'happy');
    assertEqual(s.activity, 'working');
});

test('Emotion sans data garde l’humeur', () => {
    const s = reduce(initialState(0), ev('Emotion', {}), 1);
    assertEqual(s.mood, 'neutral');
});

test('Emotion accepte une humeur valide', () => {
    assertEqual(reduce(initialState(0), ev('Emotion', { emotion: 'sobbing' }), 1).mood, 'sobbing');
});

test('SessionStart -> waving', () => {
    const s = reduce(initialState(0), { event: 'SessionStart', data: {} }, 10);
    assertEqual(s.activity, 'waving');
    assertEqual(s.mood, 'neutral');
});

test('PreCompact -> compacting', () => {
    const s = reduce(initialState(0), { event: 'PreCompact', data: {} }, 10);
    assertEqual(s.activity, 'compacting');
});

test('shouldDecayWaving + applyDecay : waving -> idle', () => {
    let s = reduce(initialState(0), { event: 'SessionStart', data: {} }, 10);
    assertEqual(shouldDecayWaving(s, 10 + 2599, 2600), false);
    assertEqual(shouldDecayWaving(s, 10 + 2600, 2600), true);
    s = applyDecay({ ...s, activity: 'waving' });
    assertEqual(s.activity, 'idle');
});

test('ACTIVITIES contient compacting et waving', () => {
    assertEqual(ACTIVITIES.includes('compacting'), true);
    assertEqual(ACTIVITIES.includes('waving'), true);
});

run();

import { test, assertEqual, assertTrue, run } from './harness.js';
import { LineFramer, validateMessage, parseLine, KNOWN_EVENTS, MAX_LINE_BYTES } from '../lib/protocol.js';

test('LineFramer découpe sur les sauts de ligne', () => {
    const f = new LineFramer();
    assertEqual(f.feed('a\nbb\nc'), ['a', 'bb']);
    assertEqual(f.feed('cc\n'), ['ccc']);
});

test('LineFramer abandonne une ligne trop longue et resynchronise', () => {
    const f = new LineFramer();
    const huge = 'x'.repeat(MAX_LINE_BYTES + 10);
    assertEqual(f.feed(huge), []);          // pas de \n, accumulation rejetée
    assertEqual(f.feed('\nok\n'), ['ok']);  // resync après le prochain \n
});

test('validateMessage accepte un message conforme et normalise', () => {
    const r = validateMessage({ v: 1, event: 'Stop', session_id: 's1' }, 1000);
    assertTrue(r.ok);
    assertEqual(r.msg, { v: 1, event: 'Stop', session_id: 's1', cwd: '', ts: 1000, data: {} });
});

test('validateMessage rejette event inconnu / session_id manquant', () => {
    assertEqual(validateMessage({ v: 1, event: 'Nope', session_id: 's' }, 0).ok, false);
    assertEqual(validateMessage({ v: 1, event: 'Stop' }, 0).ok, false);
    assertEqual(validateMessage('pas-un-objet', 0).ok, false);
});

test('KNOWN_EVENTS contient Emotion et SessionEnd', () => {
    assertTrue(KNOWN_EVENTS.has('Emotion'));
    assertTrue(KNOWN_EVENTS.has('SessionEnd'));
});

test('parseLine renvoie ok:false sur JSON cassé', () => {
    assertEqual(parseLine('{cassé', 0).ok, false);
});

test('LineFramer jette une ligne complète surdimensionnée mais garde les suivantes', () => {
    const f = new LineFramer();
    assertEqual(f.feed('x'.repeat(MAX_LINE_BYTES + 1) + '\nok\n'), ['ok']);
});

test('validateMessage : data tableau est normalisé en objet vide', () => {
    const r = validateMessage({ v: 1, event: 'Stop', session_id: 's', data: [1, 2] }, 5);
    assertTrue(r.ok);
    assertEqual(r.msg.data, {});
});

run();

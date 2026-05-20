import { test, assertEqual, assertTrue, run } from './harness.js';
import { hash, mirrorMode, entryMirrored, isMirrored } from '../lib/mirrorPolicy.js';

test('hash déterministe et distinct', () => {
    assertEqual(hash('abc'), hash('abc'));
    assertTrue(hash('abc') !== hash('abd'), 'collision triviale');
    assertTrue(hash('') >= 0, 'non signé');
});

test('mirrorMode par activité', () => {
    assertEqual(mirrorMode('idle'), { kind: 'timed', lo: 30, hi: 60 });
    assertEqual(mirrorMode('waiting'), { kind: 'timed', lo: 45, hi: 90 });
    assertEqual(mirrorMode('working'), { kind: 'timed', lo: 10, hi: 15 });
    assertEqual(mirrorMode('compacting'), { kind: 'stateEntry' });
    assertEqual(mirrorMode('sleeping'), { kind: 'never' });
    assertEqual(mirrorMode('waving'), { kind: 'never' });
    assertEqual(mirrorMode('bogus'), { kind: 'never' });
});

test('never -> jamais miroir', () => {
    for (const a of ['sleeping', 'waving']) {
        assertEqual(isMirrored(a, 'seed', 1234, true), false);
        assertEqual(isMirrored(a, 'seed', 9999, false), false);
    }
});

test('stateEntry -> renvoie le flag tel quel', () => {
    assertEqual(isMirrored('compacting', 'seed', 1, true), true);
    assertEqual(isMirrored('compacting', 'seed', 1, false), false);
});

test('timed déterministe', () => {
    for (const [a, s, t] of [['working', 's1', 1000], ['idle', 'z', 50], ['waiting', 'q', 7777]]) {
        const v = isMirrored(a, s, t, false);
        assertTrue(v === true || v === false, `${a} doit renvoyer un booléen`);
        assertEqual(isMirrored(a, s, t, false), v);
    }
});

test('timed bascule au fil du temps', () => {
    const seen = new Set();
    for (let t = 0; t < 6000; t++)
        seen.add(isMirrored('idle', 'sX', t, false));
    assertEqual([...seen].sort(), [false, true]);
});

test('timed varie selon le seed', () => {
    let differ = false;
    for (let t = 0; t < 2000 && !differ; t++)
        if (isMirrored('working', 'a', t, false) !== isMirrored('working', 'b', t, false))
            differ = true;
    assertTrue(differ, 'deux seeds devraient diverger quelque part');
});

test('entryMirrored déterministe et variable', () => {
    assertEqual(entryMirrored('s', 'compacting', 3), entryMirrored('s', 'compacting', 3));
    const seen = new Set();
    for (let n = 0; n < 50; n++)
        seen.add(entryMirrored('s', 'compacting', n));
    assertEqual([...seen].sort(), [false, true]);
});

run();

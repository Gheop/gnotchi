import { test, assertEqual, assertTrue, run } from './harness.js';
import { EVENTS, isGnotchiGroup, withHooks, withoutHooks, hooksPresent, needsWrite }
    from '../lib/hooksConfig.js';

const EMIT = '/x/tools/gnotchi-emit';

test('EVENTS = 8 événements Claude Code', () => {
    assertEqual(EVENTS, ['SessionStart', 'UserPromptSubmit', 'PreToolUse',
        'PostToolUse', 'Notification', 'Stop', 'PreCompact', 'SessionEnd']);
});

test('withHooks sur {} pose les 8 events au bon chemin', () => {
    const s = withHooks({}, EMIT);
    for (const ev of EVENTS) {
        assertEqual(s.hooks[ev].length, 1);
        assertEqual(s.hooks[ev][0].hooks[0].command, `${EMIT} ${ev}`);
        assertEqual(s.hooks[ev][0].hooks[0].type, 'command');
    }
});

test('withHooks idempotent', () => {
    const a = withHooks({}, EMIT);
    const b = withHooks(a, EMIT);
    assertEqual(JSON.stringify(b), JSON.stringify(a));
});

test('withHooks préserve un hook non-gnotchi', () => {
    const base = { hooks: { Stop: [{ hooks: [{ type: 'command', command: '/bin/other x' }] }] } };
    const s = withHooks(base, EMIT);
    const cmds = s.hooks.Stop.map(g => g.hooks[0].command);
    assertTrue(cmds.includes('/bin/other x'), 'hook tiers conservé');
    assertTrue(cmds.includes(`${EMIT} Stop`), 'hook gnotchi ajouté');
    assertEqual(s.hooks.Stop.length, 2);
});

test('withHooks remplace un chemin périmé', () => {
    const stale = withHooks({}, '/old/gnotchi-emit');
    assertEqual(hooksPresent(stale, EMIT), false);
    const fixed = withHooks(stale, EMIT);
    assertEqual(hooksPresent(fixed, EMIT), true);
    for (const ev of EVENTS)
        assertEqual(fixed.hooks[ev].length, 1);
});

test('withoutHooks retire gnotchi, prune les vides, garde le reste', () => {
    const base = withHooks({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '/bin/other' }] }] } }, EMIT);
    const s = withoutHooks(base);
    assertEqual(s.hooks.Stop.length, 1);
    assertEqual(s.hooks.Stop[0].hooks[0].command, '/bin/other');
    assertEqual('SessionStart' in (s.hooks || {}), false);
});

test('withoutHooks sur tout-gnotchi supprime la clé hooks', () => {
    const s = withoutHooks(withHooks({}, EMIT));
    assertEqual('hooks' in s, false);
});

test('isGnotchiGroup', () => {
    assertEqual(isGnotchiGroup({ hooks: [{ command: `${EMIT} Stop` }] }), true);
    assertEqual(isGnotchiGroup({ hooks: [{ command: '/bin/other' }] }), false);
    assertEqual(isGnotchiGroup({}), false);
    assertEqual(isGnotchiGroup(null), false);
    assertEqual(isGnotchiGroup(undefined), false);
});

test('hooksPresent / needsWrite', () => {
    assertEqual(hooksPresent({}, EMIT), false);
    assertEqual(needsWrite({}, EMIT), true);
    const ok = withHooks({}, EMIT);
    assertEqual(hooksPresent(ok, EMIT), true);
    assertEqual(needsWrite(ok, EMIT), false);
    const partial = withHooks({}, EMIT);
    delete partial.hooks.Stop;
    assertEqual(hooksPresent(partial, EMIT), false);
});

run();

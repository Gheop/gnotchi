import { test, assertEqual, assertTrue, run } from './harness.js';
import {
    xpForEvent, stageForXp, newPet, applyEvent, hungerLevel,
    XP_PER_TOOL, XP_PER_TURN,
} from '../lib/pet.js';

test('xpForEvent : outil +1, tour +10, reste 0', () => {
    assertEqual(xpForEvent('PostToolUse'), XP_PER_TOOL);
    assertEqual(xpForEvent('Stop'), XP_PER_TURN);
    assertEqual(xpForEvent('PreToolUse'), 0);
    assertEqual(xpForEvent('SessionStart'), 0);
    assertEqual(xpForEvent('Notification'), 0);
});

test('stageForXp : bornes exactes des seuils', () => {
    assertEqual(stageForXp(0), 'egg');
    assertEqual(stageForXp(49), 'egg');
    assertEqual(stageForXp(50), 'baby');
    assertEqual(stageForXp(299), 'baby');
    assertEqual(stageForXp(300), 'teen');
    assertEqual(stageForXp(999), 'teen');
    assertEqual(stageForXp(1000), 'adult');
    assertEqual(stageForXp(999999), 'adult');
});

test('newPet : xp 0, timestamps posés', () => {
    const p = newPet(1000);
    assertEqual(p.xp, 0);
    assertEqual(p.bornTs, 1000);
    assertEqual(p.lastFedTs, 1000);
});

test('applyEvent : outil nourrit et met à jour lastFedTs', () => {
    const p = newPet(1000);
    const r = applyEvent(p, 'PostToolUse', 2000);
    assertEqual(r.pet.xp, 1);
    assertEqual(r.pet.lastFedTs, 2000);
    assertEqual(r.justAte, true);
    assertEqual(r.leveledUp, false);
    // immutabilité : le pet d'origine n'est pas modifié
    assertEqual(p.xp, 0);
});

test('applyEvent : event non nourrissant est un no-op', () => {
    const p = { xp: 40, bornTs: 0, lastFedTs: 500 };
    const r = applyEvent(p, 'PreToolUse', 2000);
    assertEqual(r.justAte, false);
    assertEqual(r.leveledUp, false);
    assertEqual(r.pet.xp, 40);
    assertEqual(r.pet.lastFedTs, 500);
});

test('applyEvent : leveledUp true au franchissement de seuil', () => {
    const p = { xp: 49, bornTs: 0, lastFedTs: 0 };
    const r = applyEvent(p, 'PostToolUse', 1);
    assertEqual(r.pet.xp, 50);
    assertEqual(r.leveledUp, true); // egg -> baby
});

test('applyEvent : pas de leveledUp sans franchissement', () => {
    const p = { xp: 50, bornTs: 0, lastFedTs: 0 };
    const r = applyEvent(p, 'PostToolUse', 1);
    assertEqual(r.pet.xp, 51);
    assertEqual(r.leveledUp, false); // reste baby
});

test('hungerLevel : seuils 2h / 8h', () => {
    const p = { xp: 0, bornTs: 0, lastFedTs: 0 };
    assertEqual(hungerLevel(p, 0), 0);
    assertEqual(hungerLevel(p, 2 * 3600000 - 1), 0);
    assertEqual(hungerLevel(p, 2 * 3600000), 1);
    assertEqual(hungerLevel(p, 8 * 3600000 - 1), 1);
    assertEqual(hungerLevel(p, 8 * 3600000), 2);
});

run();

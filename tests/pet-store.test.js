import GLib from 'gi://GLib';
import { test, assertEqual, assertTrue, run } from './harness.js';
import { PetStore } from '../src/petStore.js';

function tmpDir() {
    const base = GLib.build_filenamev([
        GLib.get_tmp_dir(),
        `gnotchi-pet-test-${GLib.get_real_time()}`,
    ]);
    GLib.mkdir_with_parents(base, 0o755);
    return base;
}

test('onEvent : crée un pet et le nourrit', () => {
    const s = new PetStore(tmpDir());
    const r = s.onEvent('/proj', 'PostToolUse', {}, 1000);
    assertEqual(r.justAte, true);
    assertEqual(r.stage, 'egg');
    assertEqual(s.stageFor('/proj'), 'egg');
});

test('onEvent : cwd vide -> null', () => {
    const s = new PetStore(tmpDir());
    assertEqual(s.onEvent('', 'Stop', {}, 1000), null);
    assertEqual(s.onEvent(null, 'Stop', {}, 1000), null);
});

test('onEvent : franchissement de stade remonte leveledUp', () => {
    const s = new PetStore(tmpDir());
    // 5 Stop = 50 XP -> baby
    let last;
    for (let i = 0; i < 5; i++)
        last = s.onEvent('/proj', 'Stop', {}, 1000 + i);
    assertEqual(last.stage, 'baby');
    assertEqual(last.leveledUp, true);
});

test('topPets : trié par XP décroissant', () => {
    const s = new PetStore(tmpDir());
    s.onEvent('/a', 'Stop', {}, 1);       // 10
    s.onEvent('/b', 'PostToolUse', {}, 1); // 1
    for (let i = 0; i < 3; i++)
        s.onEvent('/c', 'Stop', {}, 1);   // 30
    const top = s.topPets(2);
    assertEqual(top.length, 2);
    assertEqual(top[0].cwd, '/c');
    assertEqual(top[1].cwd, '/a');
});

test('flush puis load : les pets survivent', () => {
    const dir = tmpDir();
    const s1 = new PetStore(dir);
    s1.onEvent('/proj', 'Stop', {}, 1000);
    s1.flush();
    const s2 = new PetStore(dir);
    s2.load();
    assertEqual(s2.stageFor('/proj'), 'egg');
    assertEqual(s2.topPets(1)[0].xp, 10);
});

test('load : dossier vierge -> pas de crash, store vide', () => {
    const s = new PetStore(tmpDir());
    s.load();
    assertEqual(s.topPets(5).length, 0);
});

run();

import { test, assertEqual, run } from './harness.js';
import { spriteFile } from '../lib/spriteMap.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { MOODS } from '../lib/sentiment.js';
import { ACTIVITIES } from '../lib/stateMachine.js';

test('idle a les 5 humeurs', () => {
    assertEqual(spriteFile('idle', 'neutral'), 'claude_idle_neutral.png');
    assertEqual(spriteFile('idle', 'happy'), 'claude_idle_happy.png');
    assertEqual(spriteFile('idle', 'elated'), 'claude_idle_elated.png');
    assertEqual(spriteFile('idle', 'sad'), 'claude_idle_sad.png');
    assertEqual(spriteFile('idle', 'sobbing'), 'claude_idle_sob.png');
});

test('idle/meditating mappe vers le sprite extrait de la vidéo notchi', () => {
    assertEqual(spriteFile('idle', 'meditating'), 'claude_idle_meditating.png');
    const path = 'assets/sprites/claude_idle_meditating.png';
    assertEqual(Gio.File.new_for_path(path).query_exists(null), true);
});

test('idle/cowboy mappe vers le sprite cowboy au lasso', () => {
    assertEqual(spriteFile('idle', 'cowboy'), 'claude_idle_cowboy.png');
    const path = 'assets/sprites/claude_idle_cowboy.png';
    assertEqual(Gio.File.new_for_path(path).query_exists(null), true);
    const { w, h } = pngSize(path);
    assertEqual(h, 64);
    assertEqual(w % 64 === 0 && w >= 64, true);
});

test('working/waiting : elated retombe sur happy', () => {
    assertEqual(spriteFile('working', 'elated'), 'claude_working_happy.png');
    assertEqual(spriteFile('waiting', 'elated'), 'claude_waiting_happy.png');
});

test('sobbing s ecrit sob', () => {
    assertEqual(spriteFile('working', 'sobbing'), 'claude_working_sob.png');
});

test('sleeping/compacting/waving toujours neutral', () => {
    assertEqual(spriteFile('sleeping', 'sad'), 'claude_sleeping_neutral.png');
    assertEqual(spriteFile('compacting', 'happy'), 'claude_compacting_neutral.png');
    assertEqual(spriteFile('waving', 'sobbing'), 'claude_waving_neutral.png');
});

test('activite inconnue retombe sur idle', () => {
    assertEqual(spriteFile('bogus', 'happy'), 'claude_idle_happy.png');
});

test('humeur inconnue retombe sur neutral', () => {
    assertEqual(spriteFile('idle', 'bogus'), 'claude_idle_neutral.png');
});

function pngSize(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error(`lecture ${path}`);
    const dv = new DataView(new Uint8Array(bytes).buffer);
    // signature PNG (8 octets) + IHDR : width @16, height @20 (big-endian)
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

// Requiert d'être lancé depuis la racine du dépôt (chemins assets/sprites/ relatifs).
test('chaque activity x mood resout vers un fichier existant 64px multiple de 64', () => {
    for (const a of ACTIVITIES) {
        for (const m of MOODS) {
            const file = spriteFile(a, m);
            const path = `assets/sprites/${file}`;
            assertEqual(Gio.File.new_for_path(path).query_exists(null), true);
            const { w, h } = pngSize(path);
            assertEqual(h, 64);
            assertEqual(w % 64 === 0 && w >= 64, true);
        }
    }
});

run();

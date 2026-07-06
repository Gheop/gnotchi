# Évolution persistante + tokivore — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque projet une créature Tamagotchi qui grandit à travers quatre stades de vie (œuf → bébé → ado → adulte), persistée sur disque, qui « mange » quand Claude travaille et devient « affamée » quand le projet est silencieux.

**Architecture:** Une monnaie unique, l'XP événementiel (outil +1, tour fini +10), alimente la croissance. La logique est purement fonctionnelle dans `lib/pet.js` (testable sous `gjs -m`). `src/petStore.js` porte la persistance débouncée dans `~/.local/share/gnotchi/pets.json`. `Mascot` fait varier `icon_size` selon le stade et dessine l'œuf en St/CSS. L'extension route les events du feed vers le store et propage stade + animations aux mascottes.

**Tech Stack:** GJS / GNOME Shell 50, Gio + GLib, sprites notchi existants (aucun nouvel asset). Tests purs via `gjs -m` sur le mini-runner `tests/harness.js`.

## Global Constraints

- GNOME Shell 50, GJS. Modules `lib/` purs, sans dépendance GNOME Shell (St/Clutter/resource:///), testables sous `gjs -m`.
- Commentaires et copie utilisateur en français. Commits : impératif présent, minuscule initiale, pas de point final, terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- XP exact : `PostToolUse` → +1, `Stop` → +10, tout autre event → 0. Les erreurs d'outil nourrissent quand même (ton cozy).
- Seuils de stade exacts (XP cumulé) : `egg` [0,50), `baby` [50,300), `teen` [300,1000), `adult` [1000,+∞).
- Seuils de faim exacts : rassasié < 2h, grignoteur 2–8h, affamé > 8h depuis `lastFedTs`.
- Clé du pet : le `cwd` réel reçu dans les messages du feed. Jamais le slug encodé.
- Persistance : `~/.local/share/gnotchi/pets.json`, écriture atomique (tmp + rename), débouncée (~30s) + flush au `disable()`, cap à 200 pets (éviction du `lastFedTs` le plus ancien).
- Ton cozy : jamais de régression de stade, jamais de mort. La faim est cosmétique.
- Aucun nouvel asset image : les stades se rendent par échelle de `icon_size` + un œuf dessiné en St/CSS.
- Chaque version bumpe `metadata.json` et ajoute une section changelog en tête du README.

---

## File Structure

- `lib/pet.js` (créer) : logique pure. XP, stades, faim, sérialisation, éviction, helpers visuels. Aucune dépendance GNOME.
- `tests/pet.test.js` (créer) : tests du module pur.
- `src/petStore.js` (créer) : persistance disque + débounce + éviction, s'appuie sur `lib/pet.js`.
- `tests/pet-store.test.js` (créer) : tests du store (mémoire + I/O sur dossier temporaire).
- `src/mascot.js` (modifier) : `setStage`, œuf dessiné, éclosion, « nom » de bouffe.
- `src/indicator.js` (modifier) : propage stade/faim/anim aux mascottes, ligne popup « Pets ».
- `extension.js` (modifier) : possède le `PetStore`, route les events du feed.
- `schemas/org.gnome.shell.extensions.gnotchi.gschema.xml` (modifier) : clés `evolution-enabled`, `notify-on-levelup`.
- `prefs.js` (modifier) : toggles des deux nouvelles clés.
- `README.md`, `metadata.json` (modifier) : changelog + bump de version.

---

## Task 1: `lib/pet.js` — croissance pure

**Files:**
- Create: `lib/pet.js`
- Test: `tests/pet.test.js`

**Interfaces:**
- Consumes: rien.
- Produces :
  - `xpForEvent(event: string) -> number`
  - `stageForXp(xp: number) -> 'egg'|'baby'|'teen'|'adult'`
  - `newPet(now: number) -> { xp, bornTs, lastFedTs }`
  - `applyEvent(pet, event: string, now: number) -> { pet, justAte: boolean, leveledUp: boolean }`
  - `hungerLevel(pet, now: number) -> 0|1|2`
  - constantes exportées : `XP_PER_TOOL`, `XP_PER_TURN`, `STAGE_THRESHOLDS`, `HUNGER_PECKISH_MS`, `HUNGER_STARVING_MS`

- [ ] **Step 1: Write the failing test**

Créer `tests/pet.test.js` :

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/pet.test.js`
Expected: FAIL — `lib/pet.js` n'existe pas (erreur d'import).

- [ ] **Step 3: Write minimal implementation**

Créer `lib/pet.js` :

```js
// Logique pure du pet (une créature par projet). Aucune dépendance GNOME.

export const XP_PER_TOOL = 1;
export const XP_PER_TURN = 10;

// Seuils de stade, en XP cumulé, du plus bas au plus haut.
export const STAGE_THRESHOLDS = [
    { stage: 'egg', min: 0 },
    { stage: 'baby', min: 50 },
    { stage: 'teen', min: 300 },
    { stage: 'adult', min: 1000 },
];

const HOUR_MS = 3600000;
export const HUNGER_PECKISH_MS = 2 * HOUR_MS;
export const HUNGER_STARVING_MS = 8 * HOUR_MS;

export function xpForEvent(event) {
    if (event === 'PostToolUse')
        return XP_PER_TOOL;
    if (event === 'Stop')
        return XP_PER_TURN;
    return 0;
}

export function stageForXp(xp) {
    let stage = 'egg';
    for (const t of STAGE_THRESHOLDS) {
        if (xp >= t.min)
            stage = t.stage;
    }
    return stage;
}

export function newPet(now) {
    return { xp: 0, bornTs: now, lastFedTs: now };
}

export function applyEvent(pet, event, now) {
    const gain = xpForEvent(event);
    if (gain === 0)
        return { pet, justAte: false, leveledUp: false };
    const before = stageForXp(pet.xp);
    const next = { ...pet, xp: pet.xp + gain, lastFedTs: now };
    const leveledUp = stageForXp(next.xp) !== before;
    return { pet: next, justAte: true, leveledUp };
}

export function hungerLevel(pet, now) {
    const dt = now - pet.lastFedTs;
    if (dt >= HUNGER_STARVING_MS)
        return 2;
    if (dt >= HUNGER_PECKISH_MS)
        return 1;
    return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/pet.test.js`
Expected: PASS — `8/8 ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/pet.js tests/pet.test.js
git commit -m "feat: logique pure de croissance du pet (XP, stades, faim)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/pet.js` — sérialisation, éviction, helpers visuels

**Files:**
- Modify: `lib/pet.js`
- Test: `tests/pet.test.js`

**Interfaces:**
- Consumes: `stageForXp` (Task 1).
- Produces :
  - `serializePets(petsMap: Map<string, pet>) -> string`
  - `parsePets(text: string) -> Map<string, pet>`
  - `capPets(petsMap: Map, max?: number) -> Map`
  - `stageIconSize(stage: string, baseSize: number) -> number`
  - `hungerMood(baseMood: string, level: number) -> string`
  - `stageEmoji(stage: string) -> string`
  - constantes : `PETS_VERSION`, `MAX_PETS`

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/pet.test.js`, **avant** l'appel `run()` final, en complétant la ligne d'import du haut :

```js
import {
    serializePets, parsePets, capPets,
    stageIconSize, hungerMood, stageEmoji, PETS_VERSION,
} from '../lib/pet.js';

test('serialize/parse : round-trip', () => {
    const m = new Map([
        ['/a', { xp: 340, bornTs: 100, lastFedTs: 200 }],
        ['/b', { xp: 5, bornTs: 10, lastFedTs: 20 }],
    ]);
    const back = parsePets(serializePets(m));
    assertEqual(back.get('/a'), { xp: 340, bornTs: 100, lastFedTs: 200 });
    assertEqual(back.get('/b'), { xp: 5, bornTs: 10, lastFedTs: 20 });
});

test('parsePets : entrée corrompue -> map vide', () => {
    assertEqual(parsePets('pas du json').size, 0);
    assertEqual(parsePets('{}').size, 0);
    assertEqual(parsePets('{"version":999,"pets":{}}').size, 0);
    assertEqual(parsePets(JSON.stringify({ version: PETS_VERSION, pets: null })).size, 0);
});

test('parsePets : ignore les entrées invalides', () => {
    const text = JSON.stringify({
        version: PETS_VERSION,
        pets: {
            '/ok': { xp: 10, bornTs: 1, lastFedTs: 2 },
            '/bad': { xp: -3, bornTs: 1, lastFedTs: 2 },
            '/nan': { xp: 'x', bornTs: 1, lastFedTs: 2 },
        },
    });
    const m = parsePets(text);
    assertEqual(m.size, 1);
    assertTrue(m.has('/ok'));
});

test('capPets : garde les lastFedTs les plus récents', () => {
    const m = new Map([
        ['/old', { xp: 1, bornTs: 0, lastFedTs: 100 }],
        ['/mid', { xp: 1, bornTs: 0, lastFedTs: 200 }],
        ['/new', { xp: 1, bornTs: 0, lastFedTs: 300 }],
    ]);
    const capped = capPets(m, 2);
    assertEqual(capped.size, 2);
    assertTrue(capped.has('/new'));
    assertTrue(capped.has('/mid'));
    assertTrue(!capped.has('/old'));
});

test('stageIconSize : croît avec le stade, borné à baseSize', () => {
    assertTrue(stageIconSize('baby', 48) < stageIconSize('teen', 48));
    assertTrue(stageIconSize('teen', 48) < stageIconSize('adult', 48));
    assertEqual(stageIconSize('adult', 48), 48);
    assertTrue(stageIconSize('egg', 22) >= 1);
});

test('hungerMood : affamé penche neutral vers sad, sinon inchangé', () => {
    assertEqual(hungerMood('neutral', 2), 'sad');
    assertEqual(hungerMood('neutral', 1), 'neutral');
    assertEqual(hungerMood('happy', 2), 'happy');
    assertEqual(hungerMood('sad', 0), 'sad');
});

test('stageEmoji : un emoji par stade', () => {
    for (const s of ['egg', 'baby', 'teen', 'adult'])
        assertTrue(typeof stageEmoji(s) === 'string' && stageEmoji(s).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/pet.test.js`
Expected: FAIL — imports `serializePets`/`parsePets`/… non définis.

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `lib/pet.js` :

```js
export const PETS_VERSION = 1;
export const MAX_PETS = 200;

export function serializePets(petsMap) {
    const pets = {};
    for (const [cwd, p] of petsMap.entries())
        pets[cwd] = { xp: p.xp, bornTs: p.bornTs, lastFedTs: p.lastFedTs };
    return JSON.stringify({ version: PETS_VERSION, pets });
}

export function parsePets(text) {
    let obj;
    try {
        obj = JSON.parse(text);
    } catch {
        return new Map();
    }
    if (!obj || obj.version !== PETS_VERSION ||
        typeof obj.pets !== 'object' || obj.pets === null)
        return new Map();
    const out = new Map();
    for (const [cwd, p] of Object.entries(obj.pets)) {
        if (!p || typeof p !== 'object')
            continue;
        const xp = Number(p.xp);
        if (!Number.isFinite(xp) || xp < 0)
            continue;
        const bornTs = Number(p.bornTs);
        const lastFedTs = Number(p.lastFedTs);
        out.set(cwd, {
            xp,
            bornTs: Number.isFinite(bornTs) ? bornTs : 0,
            lastFedTs: Number.isFinite(lastFedTs) ? lastFedTs : 0,
        });
    }
    return out;
}

// Garde au plus `max` pets, ceux au lastFedTs le plus récent.
export function capPets(petsMap, max = MAX_PETS) {
    if (petsMap.size <= max)
        return petsMap;
    const sorted = [...petsMap.entries()]
        .sort((a, b) => b[1].lastFedTs - a[1].lastFedTs);
    return new Map(sorted.slice(0, max));
}

// Taille d'icône par stade, dérivée d'une base (22 top bar, 48 island).
const STAGE_SCALE = { egg: 0.55, baby: 0.62, teen: 0.82, adult: 1 };

export function stageIconSize(stage, baseSize) {
    const f = STAGE_SCALE[stage] ?? 1;
    return Math.max(1, Math.round(baseSize * f));
}

// La faim penche l'humeur idle vers 'sad' quand affamé, sans écraser une
// humeur déjà expressive.
export function hungerMood(baseMood, level) {
    if (level >= 2 && (baseMood === 'neutral' || baseMood === undefined))
        return 'sad';
    return baseMood;
}

const STAGE_EMOJI = { egg: '🥚', baby: '🐣', teen: '🧒', adult: '🧑' };

export function stageEmoji(stage) {
    return STAGE_EMOJI[stage] ?? '🥚';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/pet.test.js`
Expected: PASS — `15/15 ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/pet.js tests/pet.test.js
git commit -m "feat: sérialisation, éviction et helpers visuels du pet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `src/petStore.js` — persistance débouncée

**Files:**
- Create: `src/petStore.js`
- Test: `tests/pet-store.test.js`

**Interfaces:**
- Consumes: `newPet`, `applyEvent`, `stageForXp`, `hungerLevel`, `serializePets`, `parsePets`, `capPets` (Tasks 1–2).
- Produces :
  - `new PetStore(dir?)` — `dir` optionnel pour les tests.
  - `.load() -> void`
  - `.onEvent(cwd, event, data, now) -> { stage, justAte, leveledUp } | null`
  - `.stageFor(cwd) -> string`
  - `.hungerFor(cwd, now) -> number`
  - `.topPets(n) -> [{ cwd, xp, stage }]`
  - `.flush() -> void`
  - `.destroy() -> void`

Note : `src/petStore.js` n'importe que `gi://Gio` et `gi://GLib`, tous deux disponibles sous `gjs -m`. Il est donc testable sans GNOME Shell, en injectant un dossier temporaire.

- [ ] **Step 1: Write the failing test**

Créer `tests/pet-store.test.js` :

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/pet-store.test.js`
Expected: FAIL — `src/petStore.js` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Créer `src/petStore.js` :

```js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    newPet, applyEvent, stageForXp, hungerLevel,
    serializePets, parsePets, capPets,
} from '../lib/pet.js';

const SAVE_DEBOUNCE_MS = 30000;

export class PetStore {
    constructor(dir) {
        this._pets = new Map(); // cwd -> { xp, bornTs, lastFedTs }
        this._dirty = false;
        this._saveId = 0;
        this._dir = dir ||
            GLib.build_filenamev([GLib.get_user_data_dir(), 'gnotchi']);
        this._path = GLib.build_filenamev([this._dir, 'pets.json']);
    }

    load() {
        try {
            const f = Gio.File.new_for_path(this._path);
            if (!f.query_exists(null))
                return;
            const [ok, bytes] = GLib.file_get_contents(this._path);
            if (ok)
                this._pets = parsePets(new TextDecoder().decode(bytes));
        } catch (e) {
            logError(e, 'gnotchi: petStore load');
            this._pets = new Map();
        }
    }

    onEvent(cwd, event, _data, now) {
        if (typeof cwd !== 'string' || !cwd)
            return null;
        let pet = this._pets.get(cwd);
        if (!pet) {
            pet = newPet(now);
            this._pets.set(cwd, pet);
        }
        const { pet: next, justAte, leveledUp } = applyEvent(pet, event, now);
        if (justAte) {
            this._pets.set(cwd, next);
            this._markDirty();
        }
        return { stage: stageForXp(this._pets.get(cwd).xp), justAte, leveledUp };
    }

    stageFor(cwd) {
        const p = this._pets.get(cwd);
        return p ? stageForXp(p.xp) : 'egg';
    }

    hungerFor(cwd, now) {
        const p = this._pets.get(cwd);
        return p ? hungerLevel(p, now) : 0;
    }

    topPets(n) {
        return [...this._pets.entries()]
            .map(([cwd, p]) => ({ cwd, xp: p.xp, stage: stageForXp(p.xp) }))
            .sort((a, b) => b.xp - a.xp)
            .slice(0, n);
    }

    _markDirty() {
        this._dirty = true;
        if (this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            SAVE_DEBOUNCE_MS, () => {
                this._saveId = 0;
                this.flush();
                return GLib.SOURCE_REMOVE;
            });
    }

    flush() {
        if (!this._dirty)
            return;
        this._pets = capPets(this._pets);
        try {
            GLib.mkdir_with_parents(this._dir, 0o755);
            const tmp = `${this._path}.tmp`;
            GLib.file_set_contents(tmp, serializePets(this._pets));
            Gio.File.new_for_path(tmp).move(
                Gio.File.new_for_path(this._path),
                Gio.FileCopyFlags.OVERWRITE, null, null);
            this._dirty = false;
        } catch (e) {
            logError(e, 'gnotchi: petStore flush');
        }
    }

    destroy() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        this.flush();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/pet-store.test.js`
Expected: PASS — `6/6 ok`.

- [ ] **Step 5: Commit**

```bash
git add src/petStore.js tests/pet-store.test.js
git commit -m "feat: PetStore, persistance débouncée des pets par projet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `Mascot.setStage` — échelle + œuf + éclosion

Rendu GNOME Shell (St/Clutter) : non testable sous `gjs -m`. Vérification manuelle via session Mutter imbriquée. La logique de taille est déjà couverte par `stageIconSize` (Task 2).

**Files:**
- Modify: `src/mascot.js`

**Interfaces:**
- Consumes: `stageIconSize` (Task 2).
- Produces : `Mascot.prototype.setStage(stage: string) -> void`. Le stade par défaut est `adult` (comportement actuel : taille pleine).

- [ ] **Step 1: Ajouter l'import et l'état de stade**

Dans `src/mascot.js`, compléter l'import de `lib/pet.js` en haut du fichier (après l'import de `idleVariant.js`, ligne ~9) :

```js
import { stageIconSize } from '../lib/pet.js';
```

Dans `_init` (après `this._size = size;`, ligne ~72), initialiser :

```js
        this._stage = 'adult';
        this._egg = null;
```

- [ ] **Step 2: Implémenter `setStage`**

Ajouter la méthode `setStage` dans la classe `Mascot` (par exemple juste après `setSeed`) :

```js
    // Applique un stade de vie : ajuste la taille du sprite, ou affiche
    // l'œuf dessiné au stade 'egg'. Une transition egg -> autre déclenche
    // l'éclosion.
    setStage(stage) {
        if (stage === this._stage)
            return;
        const hatching = this._stage === 'egg' && stage !== 'egg';
        this._stage = stage;
        const px = stageIconSize(stage, this._size);
        this._icon.icon_size = px;
        if (this._fadeIcon)
            this._fadeIcon.icon_size = px;
        if (stage === 'egg') {
            this._showEgg(px);
            return;
        }
        if (hatching)
            this._hatch();
        else
            this._hideEgg();
    }

    _showEgg(px) {
        this._icon.hide();
        if (!this._egg) {
            this._egg = new St.Widget({
                style: 'background-color: #f4e4c1; border-radius: 999px 999px ' +
                    '900px 900px; border: 1px solid #d9c39a;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._egg);
        }
        this._egg.set_size(Math.round(px * 0.8), px);
        this._egg.show();
    }

    _hideEgg() {
        if (this._egg)
            this._egg.hide();
        this._icon.show();
    }

    // Éclosion : l'œuf tremble puis fond vers le sprite.
    _hatch() {
        this._icon.opacity = 0;
        this._icon.show();
        if (this._egg) {
            const egg = this._egg;
            egg.set_pivot_point(0.5, 0.5);
            let n = 0;
            const shakeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 70, () => {
                egg.rotation_angle_z = (n % 2 === 0) ? 12 : -12;
                if (++n >= 6) {
                    egg.rotation_angle_z = 0;
                    egg.ease({
                        opacity: 0, duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: () => egg.hide(),
                    });
                    this._icon.ease({
                        opacity: 255, duration: 250,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
            this._hatchId = shakeId;
        } else {
            this._icon.opacity = 255;
        }
    }
```

Dans `destroy()` (avant `super.destroy();`), nettoyer le timer d'éclosion :

```js
        if (this._hatchId) {
            GLib.source_remove(this._hatchId);
            this._hatchId = 0;
        }
```

- [ ] **Step 3: Créer la fixture d'éclosion + régression pure**

Le rendu St n'est pas testable sous `gjs -m` ; la logique de taille l'est déjà (`stageIconSize`, Task 2). La vérification visuelle complète a lieu en Task 6, où le câblage appelle `setStage`. Ici, on prépare la fixture et on garde le filet pur.

Créer `tests/fixtures/hatch.jsonl` (6 × Stop = 60 XP, franchit le seuil bébé à 50) :

```json
{"event":"SessionStart","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
{"event":"Stop","session_id":"hatch1","cwd":"/tmp/hatchproj","data":{}}
```

Run: `gjs -m tests/pet.test.js && gjs -m tests/pet-store.test.js`
Expected: les deux suites passent (aucune régression après l'édition de `mascot.js`).

- [ ] **Step 4: Commit**

```bash
git add src/mascot.js tests/fixtures/hatch.jsonl
git commit -m "feat: stades de vie de la mascotte (échelle + œuf + éclosion)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `Mascot` — bouffe (nom) + level-up

**Files:**
- Modify: `src/mascot.js`

**Interfaces:**
- Produces :
  - `Mascot.prototype.nom() -> void` — pulse squash bref + une miette qui tombe.
  - `Mascot.prototype.celebrateLevelUp() -> void` — réutilise le glow existant (`_playGlow`).

- [ ] **Step 1: Implémenter `nom` avec débounce interne**

Ajouter dans la classe `Mascot` :

```js
    // « Nom » : petit squash vertical + une miette qui tombe. Débounce 1s
    // pour ne pas spammer pendant une rafale d'outils.
    nom() {
        const now = this._nowSec();
        if (this._lastNomSec && now - this._lastNomSec < 1)
            return;
        this._lastNomSec = now;

        this._icon.set_pivot_point(0.5, 1);
        this._icon.remove_transition('scale-y');
        this._icon.scale_y = 0.82;
        this._icon.ease({
            scale_y: 1,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });

        const crumb = new St.Widget({
            style: 'background-color: #c9a24b; border-radius: 2px;',
            width: 3, height: 3, reactive: false,
        });
        this.add_child(crumb);
        crumb.set_position(Math.round(this._size / 2), Math.round(this._size / 3));
        crumb.ease({
            y: this._size,
            opacity: 0,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this.remove_child(crumb);
                crumb.destroy();
            },
        });
    }

    celebrateLevelUp() {
        this._playGlow();
    }
```

- [ ] **Step 2: Vérification manuelle**

Reportée au flux complet de Task 6 (le câblage qui appelle `nom()` / `celebrateLevelUp()` n'existe pas encore). Ici, vérifier seulement l'absence de régression du reste :

Run: `for t in tests/*.test.js; do gjs -m "$t"; done`
Expected: tous les fichiers de test passent.

- [ ] **Step 3: Commit**

```bash
git add src/mascot.js
git commit -m "feat: anim de bouffe (nom) et glow de level-up sur la mascotte

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Câblage extension + indicator + ligne popup

**Files:**
- Modify: `extension.js`
- Modify: `src/indicator.js`

**Interfaces:**
- Consumes: `PetStore` (Task 3), `Mascot.setStage/nom/celebrateLevelUp` (Tasks 4–5), `stageEmoji`, `hungerMood` (Task 2).
- Produces :
  - `Indicator.setEvolutionEnabled(on: boolean)`
  - `Indicator.setPetStoreRef(store)`
  - `Indicator.applyPet(cwd, { stage, justAte, leveledUp })`
  - Faim : capturée à `addSession` depuis `store.hungerFor(cwd, now)`, remise à 0 quand le pet mange (`justAte`), appliquée à l'humeur dans `updateSession`. Pas de timer : les sessions sont retirées après ~30 min d'inactivité (`idle-timeout-minutes`), donc la faim (seuils 2h/8h) se lit surtout à la réouverture d'un projet, sur le `lastFedTs` persisté.

- [ ] **Step 1: extension.js — posséder le PetStore et router les events**

Dans `extension.js`, ajouter l'import (après l'import de `hooksConfig`, ligne ~9) :

```js
import { PetStore } from './src/petStore.js';
```

Dans `enable()`, après la création de l'indicator (après la ligne `Main.panel.addToStatusArea(...)`, ~ligne 62), créer et charger le store :

```js
        this._petStore = new PetStore();
        this._petStore.load();
        this._indicator.setPetStoreRef(this._petStore);
        this._evolutionEnabled = this._settings.get_boolean('evolution-enabled');
        this._indicator.setEvolutionEnabled(this._evolutionEnabled);
        this._notifyOnLevelup = this._settings.get_boolean('notify-on-levelup');
        this._settingsIds.push(this._settings.connect('changed::evolution-enabled',
            () => {
                this._evolutionEnabled = this._settings.get_boolean('evolution-enabled');
                this._indicator.setEvolutionEnabled(this._evolutionEnabled);
            }));
        this._settingsIds.push(this._settings.connect('changed::notify-on-levelup',
            () => { this._notifyOnLevelup = this._settings.get_boolean('notify-on-levelup'); }));
```

Dans le handler `feed` (le `this._mgr.connect('feed', ...)`), après `this._indicator.pushFeed(msg);` et avant `this._maybeNotify(msg);`, ajouter le routage pet :

```js
                if (this._evolutionEnabled && msg.cwd) {
                    const now = Date.now();
                    const r = this._petStore.onEvent(msg.cwd, msg.event, msg.data, now);
                    if (r) {
                        this._indicator.applyPet(msg.cwd, r);
                        if (r.leveledUp && this._notifyOnLevelup) {
                            const proj = GLib.path_get_basename(msg.cwd);
                            Main.notify('gnotchi', `${proj} : nouveau stade (${r.stage}) !`);
                        }
                    }
                }
```

Dans `disable()`, détruire le store (après le bloc `this._indicator`) :

```js
        if (this._petStore) {
            this._petStore.destroy();
            this._petStore = null;
        }
```

- [ ] **Step 2: indicator.js — appliquer stade et animations aux mascottes**

Dans `src/indicator.js`, ajouter l'import (compléter la ligne d'import de `lib/usage.js`, ~ligne 12) :

```js
import { stageEmoji, hungerMood } from '../lib/pet.js';
```

Dans `_init`, ajouter l'état (après `this._celebrate = true;`, ~ligne 40) :

```js
        this._evolutionEnabled = true;
        this._petStages = new Map(); // cwd -> stage
        this._petHunger = new Map(); // id -> level
        this._petStore = null;       // référence lecture seule posée par l'extension
```

Ajouter les méthodes publiques :

```js
    setEvolutionEnabled(on) {
        this._evolutionEnabled = !!on;
        if (!on) {
            for (const m of this._mascots.values())
                m.setStage('adult');
            for (const m of this._islandMascots.values())
                m.setStage('adult');
        }
        this._refreshPetsRow();
    }

    setPetStoreRef(store) {
        this._petStore = store;
    }

    // Applique un résultat de pet (stade + anims) à toutes les mascottes du cwd.
    applyPet(cwd, r) {
        if (!this._evolutionEnabled)
            return;
        this._petStages.set(cwd, r.stage);
        for (const [id, mcwd] of this._cwd.entries()) {
            if (mcwd !== cwd)
                continue;
            if (r.justAte)
                this._petHunger.set(id, 0); // il vient de manger : plus affamé
            for (const map of [this._mascots, this._islandMascots]) {
                const m = map.get(id);
                if (!m)
                    continue;
                m.setStage(r.stage);
                if (r.justAte)
                    m.nom();
                if (r.leveledUp)
                    m.celebrateLevelUp();
            }
        }
        this._refreshPetsRow();
    }

    _refreshPetsRow() {
        if (!this._petsRow)
            return;
        if (!this._evolutionEnabled || !this._petStore) {
            this._petsRow.label.set_text('Pets : —');
            return;
        }
        const top = this._petStore.topPets(3);
        if (!top.length) {
            this._petsRow.label.set_text('Pets : —');
            return;
        }
        const txt = top
            .map(p => `${GLib.path_get_basename(p.cwd)} ${stageEmoji(p.stage)} ${p.xp}`)
            .join(' · ');
        this._petsRow.label.set_text(`Pets : ${txt}`);
    }
```

Créer la ligne popup `_petsRow` dans `_init`, juste après la création de `_topProjectsRow` (~ligne 81) :

```js
        this._petsRow = new PopupMenu.PopupMenuItem('Pets : …', { reactive: false });
        this.menu.addMenuItem(this._petsRow);
```

Rafraîchir la ligne à l'ouverture du popup : dans le handler `open-state-changed` existant (~ligne 86), après `this._refreshUsage();`, ajouter `this._refreshPetsRow();`.

À `addSession`, initialiser le stade de la nouvelle mascotte depuis le stade connu du cwd (le cwd peut être encore inconnu ; défaut `egg`). Dans `addSession`, après avoir créé la mascotte top bar et la mascotte island, appeler pour chacune :

```js
        // stade + faim initiaux, dérivés du pet persisté pour ce cwd
        const cwd0 = this._cwd.get(id);
        const stage0 = (this._evolutionEnabled && cwd0)
            ? (this._petStages.get(cwd0) ?? 'egg') : 'adult';
        const level0 = (this._evolutionEnabled && cwd0 && this._petStore)
            ? this._petStore.hungerFor(cwd0, Date.now()) : 0;
        this._petHunger.set(id, level0);
        const mood0 = hungerMood('neutral', level0);
        m?.setStage(stage0);
        im.setStage(stage0);
        m?.setState('idle', mood0);
        im.setState('idle', mood0);
```

(placer cet extrait à la fin de `addSession`, avant `this._refreshHeader();`. `m` peut être undefined si le max de mascottes est atteint, d'où les appels optionnels `m?.`. Le `cwd` est déjà connu ici : `pushFeed` pose `_cwd` avant que `session-added` ne déclenche `addSession`.)

Appliquer la faim dans `updateSession` : après la mise à jour du sprite, si un niveau de faim est connu pour l'id, teinter l'humeur. Remplacer, dans `updateSession`, les deux appels `m.setState(state.activity, state.mood)` / `im.setState(...)` par une humeur ajustée :

```js
        const level = this._evolutionEnabled ? (this._petHunger.get(id) ?? 0) : 0;
        const mood = hungerMood(state.mood, level);
        const m = this._mascots.get(id);
        if (m)
            m.setState(state.activity, mood);
        const im = this._islandMascots.get(id);
        if (im)
            im.setState(state.activity, mood);
```

Enfin, nettoyer `_petHunger` dans `removeSession` : ajouter `this._petHunger.delete(id);` à côté des autres `delete` (près de `this._activity.delete(id);`).

- [ ] **Step 3: Vérification manuelle — flux complet**

```bash
rm -f ~/.local/share/gnotchi/pets.json
./tools/dev-test-nested.sh
```

Dans un autre terminal, avec le `XDG_RUNTIME_DIR` de la session imbriquée (l'afficher dans la session imbriquée via `echo $XDG_RUNTIME_DIR`), rejouer la fixture d'éclosion à ~0.5s d'intervalle :

```bash
XDG_RUNTIME_DIR=<celui-de-la-session-imbriquée> \
  python3 tools/gnotchi-sim tests/fixtures/hatch.jsonl 0.5
```

Attendu, en ouvrant le popup gnotchi :
- La mascotte island démarre en œuf, fait un petit « nom » à chaque Stop, éclôt (tremblement + sprite) au franchissement des 50 XP, puis grossit.
- La ligne « Pets : hatchproj 🐣 60 » apparaît.
- Fermer la fenêtre imbriquée pour quitter.

Vérifier aussi la persistance :

```bash
cat ~/.local/share/gnotchi/pets.json
```

Attendu : une entrée `/tmp/hatchproj` avec `"xp": 60` (après le flush du `disable`, soit à la fermeture de la session imbriquée).

- [ ] **Step 4: Commit**

```bash
git add extension.js src/indicator.js
git commit -m "feat: câble le PetStore aux mascottes et à la ligne popup Pets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Réglages, doc, version

**Files:**
- Modify: `schemas/org.gnome.shell.extensions.gnotchi.gschema.xml`
- Modify: `prefs.js`
- Modify: `README.md`
- Modify: `metadata.json`

**Interfaces:**
- Consumes: les clés lues dans `extension.js` (Task 6) : `evolution-enabled`, `notify-on-levelup`.

- [ ] **Step 1: gschema — deux nouvelles clés**

Dans `schemas/org.gnome.shell.extensions.gnotchi.gschema.xml`, ajouter dans le `<schema>`, avant `</schema>` :

```xml
    <key name="evolution-enabled" type="b">
      <default>true</default>
      <summary>Évolution des pets par projet</summary>
      <description>Si activé, chaque projet a une créature qui gagne de l'XP (outil +1, tour +10) et grandit à travers des stades de vie. Désactivé : mascottes à taille normale, aucun pet.</description>
    </key>
    <key name="notify-on-levelup" type="b">
      <default>false</default>
      <summary>Notification au changement de stade d'un pet</summary>
      <description>Si activé, une notification GNOME est émise quand le pet d'un projet passe à un stade de vie supérieur.</description>
    </key>
```

- [ ] **Step 2: Compiler le schéma et vérifier**

Run:
```bash
glib-compile-schemas schemas/ && echo "schéma compilé OK"
```
Expected: aucune erreur, `schéma compilé OK`.

- [ ] **Step 3: prefs.js — toggles**

`prefs.js` construit des `Adw.SwitchRow` liés par `settings.bind(...)` dans des groupes (`behavior`, `notify`). Ajouter le toggle d'évolution au groupe `behavior`, juste après `behavior.add(celebRow);` (~ligne 54) :

```js
        const evoRow = new Adw.SwitchRow({
            title: 'Évolution des pets',
            subtitle: 'Une créature par projet qui grandit avec l’activité (œuf → adulte)',
        });
        settings.bind('evolution-enabled', evoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(evoRow);
```

Ajouter le toggle de notification au groupe `notify`, juste après `notify.add(errRow);` (~ligne 81) :

```js
        const levelupRow = new Adw.SwitchRow({
            title: 'Au changement de stade d’un pet',
            subtitle: 'Notification GNOME quand un pet passe un stade de vie',
        });
        settings.bind('notify-on-levelup', levelupRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        notify.add(levelupRow);
```

- [ ] **Step 4: Bump de version + changelog**

Dans `metadata.json`, `version` est l'entier EGO (actuellement `19`) : le passer à `20`. Le semver (v1.16.0) ne vit que dans le README et les commits.

Dans `README.md`, ajouter en tête de la section `## Changelog` :

```markdown
### v1.16.0 — Pets qui évoluent + tokivore (2026-07-06)

- Chaque projet a désormais une créature qui grandit à travers quatre
  stades de vie (œuf, bébé, ado, adulte). Elle gagne de l'XP quand Claude
  travaille : chaque outil vaut +1, chaque tour terminé +10. Les stades
  sont persistés dans `~/.local/share/gnotchi/pets.json`, d'un jour à
  l'autre, une créature par projet (clé = cwd)
- Tokivore : la mascotte fait un petit « nom » (squash + miette) à chaque
  bouchée et prend un air affamé quand un projet reste silencieux plusieurs
  heures. Purement cosmétique : les stades ne régressent jamais
- L'œuf éclôt en fondu au franchissement des 50 XP ; la mascotte grossit à
  chaque nouveau stade, spectaculaire dans le popup
- Nouvelle ligne popup « Pets : projet 🐣 xp », top 3 par XP
- Deux préférences : « Évolution des pets » (défaut activé) et « Notifier
  les changements de stade » (défaut désactivé)
```

Mettre à jour la ligne « States » / description en tête du README si utile pour mentionner les stades.

- [ ] **Step 5: Suite complète + packaging**

Run:
```bash
for t in tests/*.test.js; do gjs -m "$t"; done
for t in tests/*.test.sh; do bash "$t"; done
```
Expected: tous les tests passent.

Run:
```bash
UUID=gnotchi@gheop.github bash tools/package.sh && echo "package OK"
```
Expected: le `.zip` se construit sans erreur (valide que `metadata.json` et le schéma sont cohérents).

- [ ] **Step 6: Commit**

```bash
git add schemas/ prefs.js README.md metadata.json
git commit -m "feat: v1.16.0 — pets qui évoluent + tokivore, réglages et doc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes d'exécution

- Les Tasks 1–3 sont pur TDD sous `gjs -m` : rouge, vert, commit.
- Les Tasks 4–6 touchent du rendu GNOME Shell non unit-testable ; leur logique testable a été extraite dans `lib/pet.js` (Task 2). La vérification est manuelle via `tools/dev-test-nested.sh` + `tools/gnotchi-sim`. Rejouer `tests/pet.test.js` et `tests/pet-store.test.js` après chaque tâche pour garder le filet de sécurité pur.
- Avant chaque test manuel de stade, supprimer `~/.local/share/gnotchi/pets.json` pour repartir d'un œuf.
- Task 7 lit `prefs.js` avant d'éditer : coller au pattern Adw réel du fichier plutôt qu'au squelette du plan.
```
# Évolution persistante + tokivore

Date : 2026-07-06
Statut : design validé, prêt pour plan d'implémentation

## Résumé

Deux features Tamagotchi piquées à Nomlings, fusionnées en une seule autour
d'une monnaie commune : l'activité de la session.

- **Évolution persistante** : chaque projet a une créature qui grandit à
  travers quatre stades de vie (œuf → bébé → ado → adulte), persistée sur
  disque d'un jour à l'autre.
- **Tokivore** : la créature « mange » quand Claude travaille (animation de
  bouffe sur les events) et devient « affamée » quand le projet reste
  silencieux (humeur cosmétique).

L'évolution est la colonne vertébrale long terme, le tokivore l'expression
court terme. Une seule feature cohérente.

## Décisions cadrantes

Quatre décisions verrouillées lors du brainstorming, avec leurs raisons :

1. **Périmètre : une créature par projet** (clé = cwd). Colle à l'identité
   multi-mascotte et top-projets de gnotchi. Un projet A peut être adulte
   pendant qu'un nouveau projet B démarre à l'œuf.
2. **Moteur : XP événementiel.** Les hooks ne transportent pas de tokens ;
   les tokens ne viennent que de l'agrégation des transcripts (laggée,
   fenêtre 7j glissante). L'XP dérivé des events est live, exact et sans
   dépendance disque. Les tokens réels restent la « saveur » (affichage
   existant), pas le moteur.
3. **Rendu : échelle + œuf dessiné.** Aucun sprite dédié n'existe. On fait
   varier `icon_size` selon le stade et on dessine l'œuf en St/CSS. Zéro
   asset à produire.
4. **Ton : cozy, zéro punition.** Les stades ne régressent jamais, le pet
   ne meurt jamais. La faim est une humeur cosmétique qui se dissipe dès la
   reprise. Colle à l'esprit non-intrusif de gnotchi.

## Contexte technique

État actuel du code pertinent :

- Les `Session` sont **éphémères** : créées au premier message, détruites au
  `SessionEnd` ou après timeout. Leur état vit uniquement en mémoire
  (`lib/stateMachine.js` → `initialState`). Rien ne survit à un reload de
  GNOME Shell. **Aucune couche de persistance runtime** n'existe : gsettings
  ne stocke que la config.
- Le `cwd` arrive live dans chaque message du feed. `extension.js` le route
  déjà vers l'indicator, qui le stocke dans `this._cwd` (id → cwd).
- Les mascottes sont keyées par `session_id`, pas par cwd. L'indicator garde
  la table `_cwd` (session_id → cwd) pour joindre les deux.
- `Mascot` (`src/mascot.js`) rend un sprite à `icon_size` fixe (22 top bar,
  48 popup island). Faire varier `icon_size` est trivial. Machinerie de
  fondu (`ease`) et de confettis (`celebrate()` dans l'indicator) déjà là.
- `UsageTracker` agrège les tokens par jour et par projet (slug). On ne
  s'appuie **pas** dessus pour la croissance.

## Architecture

### Nouveau module pur : `lib/pet.js`

Sans dépendance GNOME, testable comme les autres `lib/`.

```
xpForEvent(event, data) -> number
  PostToolUse -> +1   (une bouchée)
  Stop        -> +10  (un repas)
  autre       -> 0

stageForXp(xp) -> 'egg' | 'baby' | 'teen' | 'adult'
  egg   [0, 50)
  baby  [50, 300)
  teen  [300, 1000)
  adult [1000, +inf)

applyEvent(pet, event, now) -> { pet, justAte, leveledUp }
  incrémente xp selon xpForEvent
  met à jour lastFedTs si l'event nourrit (xp > 0)
  justAte   = l'event a nourri (déclenche l'anim de bouffe)
  leveledUp = le stade a changé vers le haut (déclenche l'anim de level-up)
  pet inchangé et flags false si xpForEvent == 0

hungerLevel(pet, now) -> 0 | 1 | 2
  temps depuis lastFedTs :
  < 2h  -> 0 (rassasié)
  2-8h  -> 1 (grignoteur)
  > 8h  -> 2 (affamé)
```

Constantes (seuils de stade, seuils de faim, XP par event) exportées et
tunables. Un pet neuf : `{ xp: 0, bornTs: now, lastFedTs: now }`. Le stade
n'est jamais stocké, toujours dérivé de `xp` (pas de redondance).

Rythme visé : première session → éclosion en bébé ; un jour ou deux → ado ;
~une semaine de vrai boulot → adulte. Pas de cap journalier, pas de decay.

### Persistance : `src/petStore.js`

Objet possédé par l'extension (comme `UsageTracker` est possédé par
l'indicator). Garde les pets en mémoire, persiste sur disque de façon
débouncée.

- **Emplacement** : `~/.local/share/gnotchi/pets.json` via
  `GLib.get_user_data_dir()`.
- **Format** :

```json
{
  "version": 1,
  "pets": {
    "/home/sib/src/gnotchi": {
      "xp": 340,
      "bornTs": 1730000000000,
      "lastFedTs": 1730500000000
    }
  }
}
```

- **Chargement** : à l'`enable()`, lecture + parse. Fichier absent ou corrompu
  → map vide, jamais d'exception qui remonte.
- **Écriture débouncée** : chaque event marque le store dirty. Un timer
  (~30s) flush si dirty. Flush aussi au `disable()`. Écriture **atomique**
  (tmp + rename), même pattern que `_ensureHooks`.
- **Cap** : ~200 pets. Au-delà, éviction du `lastFedTs` le plus ancien, pour
  ne pas grossir sans limite chez qui a des centaines de dossiers jetables.
- **API** :
  - `onEvent(cwd, event, data, now)` → `{ stage, justAte, leveledUp }` (ou
    null si cwd vide / feature off). Crée le pet à la volée au premier event.
  - `stageFor(cwd)` → stade courant (pour initialiser une mascotte).
  - `topPets(n)` → liste triée par XP décroissant pour l'affichage popup.
  - `hungerFor(cwd, now)` → niveau de faim (pour l'humeur cosmétique).

Sérialisation/parse extraits en fonctions pures (`serializePets`,
`parsePets`) dans `lib/pet.js`, pour être testables sans I/O. `src/petStore.js`
ne fait que l'I/O disque, le timer de débounce et l'éviction, en s'appuyant
sur ces fonctions pures.

### Rendu : modifications de `Mascot`

Nouvelle méthode `setStage(stage)` :

- **Échelle** sur `icon_size`, facteur par stade :
  - top bar (base 22) : bébé ~14, ado ~18, adulte 22. Variation discrète
    pour ne pas casser la hauteur du panel.
  - popup island (base 48) : bébé ~29, ado ~38, adulte 48. La croissance se
    voit là.
- **Œuf** : un ovale pixel dessiné en St.Widget + CSS (pas de PNG), affiché à
  la place de `_icon` au stade egg.
- **Éclosion** (egg → baby) : l'œuf tremble (oscillation `x` via `ease`),
  puis fond vers le mini-sprite. Réutilise le fondu existant.
- **Bouffe** (`justAte`) : petit « nom », pulse squash sur le sprite + une
  miette qui tombe (une particule, façon confetti simplifié). Débounce ~1s
  pour ne pas spammer pendant une rafale d'outils.
- **Faim** : `hungerLevel` haut → l'humeur idle penche vers `sad` (sprite
  existant), bulle dessinée optionnelle. Se dissipe à la reprise.
- **Level-up** (`leveledUp`) : réutilise `celebrate()` (confettis) sur la
  mascotte concernée + notification GNOME optionnelle.

### Câblage : `extension.js` et `src/indicator.js`

- L'extension possède un `PetStore`, chargé à l'`enable()`, flush au
  `disable()`.
- Dans le handler `feed`, après le routage existant : appeler
  `petStore.onEvent(msg.cwd, msg.event, msg.data, now)`. Si non-null,
  transmettre `{ stage, justAte, leveledUp }` à l'indicator, qui applique aux
  mascottes dont le cwd correspond (top bar + island).
- L'indicator, à l'`addSession`, initialise le stade de la nouvelle mascotte
  via `petStore.stageFor(cwd)` (le cwd peut n'être connu qu'au premier
  message ; fallback stade courant sinon).
- Nouvelle ligne popup « Pets : gnotchi 🧒 340 · autre 🐣 20 », top pets par
  XP, sur le modèle de `_topProjectsRow`.

### Réglages : gschema + prefs

- `evolution-enabled` (bool, défaut true) : toggle maître. Off → aucun pet,
  aucun stade, aucune anim ; mascottes rendues à taille adulte normale.
- `notify-on-levelup` (bool, défaut false) : notification GNOME au changement
  de stade, sur le modèle des `notify-*` existants.
- Toggles ajoutés dans `prefs.js`.

## Tests

- `tests/pet.test.js` (module pur) : `xpForEvent` mapping, `stageForXp`
  seuils exacts et bornes, `applyEvent` transitions (détection `leveledUp`,
  `justAte`, mise à jour `lastFedTs`, no-op si xp 0), `hungerLevel` seuils.
- Sérialisation : round-trip `serializePets`/`parsePets`, entrée corrompue →
  map vide, versioning, éviction au cap.
- Suivre le style existant (gjs `-m`, sans Node, via `tests/harness.js`).

## Hors périmètre (YAGNI)

- Pas de feed/play manuel (c'était le « companion mode » de Nomlings, écarté).
- Pas de skins ni de cosmétiques.
- Pas de decay, de régression, ni de mort.
- Pas de pet global (uniquement par projet).
- Pas de compteur de tokens littéral (l'XP événementiel le remplace ; les
  tokens réels restent l'affichage usage existant).

## Découpage suggéré pour l'implémentation

1. `lib/pet.js` pur + `tests/pet.test.js` (logique, aucun rendu).
2. `src/petStore.js` + sérialisation + tests (persistance, I/O bornée).
3. `Mascot.setStage` : échelle + œuf + éclosion (rendu des stades).
4. Bouffe + faim + level-up (animations tokivore).
5. Câblage extension/indicator + ligne popup.
6. gschema + prefs + doc (README changelog, bump de version).

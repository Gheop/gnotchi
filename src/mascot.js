import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import { spriteFile } from '../lib/spriteMap.js';
import { hash, isMirrored, entryMirrored } from '../lib/mirrorPolicy.js';
import { chooseIdleMood } from '../lib/idleVariant.js';
import { stageIconSize } from '../lib/pet.js';

const SIZE = 22;
const FPS_MS = 100;       // 10 fps, cf. notchi SpriteSheetView
const FADE_MS = 150;      // handoff au changement d'état
const GLOW_UP_MS = 500;   // montée du glow
const GLOW_DOWN_MS = 2100; // descente (total ~2600 = WAVING_DECAY_MS)
const GLOW_HUE_MS = 650;  // cadence du cycle de teintes
const GLOW_PEAK = 130;    // opacité crête du halo (0-255)
// 3 teintes iridescentes (rgba : St ne garantit pas hsla()).
const GLOW_COLORS = [
    'rgba(150, 80, 220, 0.45)',
    'rgba(60, 170, 220, 0.45)',
    'rgba(225, 90, 180, 0.45)',
];

function glowStyle(color) {
    return `border-radius: 999px; background-color: ${color};`;
}

// Cache module-level partagé entre toutes les mascottes : spriteFile -> [Gio.BytesIcon].
// Décodage + découpe une seule fois par fichier. Vidé au disable() via clearSpriteCache().
const _frameCache = new Map();

export function clearSpriteCache() {
    _frameCache.clear();
}

function loadFrames(assetsDir, file) {
    if (_frameCache.has(file))
        return _frameCache.get(file);
    let frames = null;
    try {
        const path = GLib.build_filenamev([assetsDir, 'sprites', file]);
        const sheet = GdkPixbuf.Pixbuf.new_from_file(path);
        const h = sheet.get_height();
        const n = Math.max(1, Math.floor(sheet.get_width() / h));
        frames = [];
        for (let i = 0; i < n; i++) {
            const sub = sheet.new_subpixbuf(i * h, 0, h, h);
            const [ok, buf] = sub.save_to_bufferv('png', [], []);
            if (!ok)
                throw new Error('encode png');
            frames.push(Gio.BytesIcon.new(GLib.Bytes.new(buf)));
        }
    } catch (e) {
        logError(e, `gnotchi: sprite ${file}`);
        frames = null;
    }
    _frameCache.set(file, frames);
    return frames;
}

export const Mascot = GObject.registerClass(
class Mascot extends St.Widget {
    _init(assetsDir, size = SIZE) {
        super._init({
            style_class: 'gnotchi-mascot',
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.BinLayout(),
        });
        this._assetsDir = assetsDir;
        this._size = size;
        this._stage = 'adult';
        this._egg = null;
        this._hatchId = 0;
        this._lastNomSec = 0;

        this._glow = new St.Widget({
            x_expand: true, y_expand: true, opacity: 0,
            style: glowStyle(GLOW_COLORS[0]),
        });
        this.add_child(this._glow);

        this._icon = new St.Icon({ icon_size: size });
        this.add_child(this._icon);

        this._frames = null;
        this._frame = 0;
        this._timerId = 0;
        this._seed = 0;
        this._activity = null;
        this._mood = null;
        this._curFile = null;
        this._entrySeq = 0;
        this._entryMirrored = false;
        this._mirrored = false;
        this._fadeIcon = null;
        this._pendingFrames = null;
        this._pendingFile = null;
        this._glowHueId = 0;
        this._hueIdx = 0;

        this.setState('idle', 'neutral');
    }

    // Désynchronise les mascottes (phase d'animation + miroir).
    setSeed(sessionId) {
        this._seed = hash(String(sessionId));
        if (this._frames && this._frames.length > 0)
            this._frame = this._seed % this._frames.length;
    }

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
        if (!this._egg) {
            this._icon.opacity = 255;
            return;
        }
        const egg = this._egg;
        egg.set_pivot_point(0.5, 0.5);
        let n = 0;
        this._stopHatch();
        this._hatchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 70, () => {
            egg.rotation_angle_z = (n % 2 === 0) ? 12 : -12;
            if (++n >= 6) {
                egg.rotation_angle_z = 0;
                egg.ease({
                    opacity: 0, duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => { egg.hide(); egg.opacity = 255; },
                });
                this._icon.ease({
                    opacity: 255, duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                this._hatchId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopHatch() {
        if (this._hatchId) {
            GLib.source_remove(this._hatchId);
            this._hatchId = 0;
        }
    }

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

    _nowSec() {
        return Math.floor(GLib.get_real_time() / 1e6);
    }

    setState(activity, mood) {
        if (activity === this._activity && mood === this._mood)
            return;
        const prevActivity = this._activity;
        if (activity !== prevActivity) {
            this._entrySeq++;
            this._entryMirrored = entryMirrored(this._seed, activity, this._entrySeq);
        }
        const effectiveMood = activity === 'idle'
            ? chooseIdleMood(mood, this._seed, this._entrySeq) : mood;
        const file = spriteFile(activity, effectiveMood);
        this._activity = activity;
        this._mood = mood;

        if (prevActivity === 'waving' && activity !== 'waving')
            this._stopGlow();

        const enteringWaving = activity === 'waving' && prevActivity !== 'waving';

        if (file === this._curFile) {
            // Même sprite (matrice éparse) : pas de fondu parasite.
            if (enteringWaving)
                this._playGlow();
            return;
        }

        const frames = loadFrames(this._assetsDir, file);
        if (!frames || frames.length === 0) {
            this._finishHandoff();
            this._stopTimer();
            this._frames = null;
            return;
        }

        // Fondu : nouvelle icône par-dessus l'ancienne restée pleine.
        this._finishHandoff();
        this._pendingFrames = frames;
        this._pendingFile = file;
        const fade = new St.Icon({ icon_size: this._size, opacity: 0 });
        fade.set_gicon(frames[this._seed % frames.length]);
        this._applyMirrorTo(fade);
        this.add_child(fade);
        this._fadeIcon = fade;
        fade.ease({
            opacity: 255,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._finishHandoff(),
        });

        if (enteringWaving)
            this._playGlow();
    }

    // Adopte le sprite en attente dans _icon et retire l'icône de fondu.
    // Idempotent : no-op si aucun fondu en cours.
    _finishHandoff() {
        if (!this._fadeIcon)
            return;
        this._fadeIcon.remove_all_transitions();
        this._frames = this._pendingFrames;
        this._curFile = this._pendingFile;
        this._frame = this._seed % this._frames.length;
        this._icon.set_gicon(this._frames[this._frame]);
        this._applyMirrorTo(this._icon);
        this.remove_child(this._fadeIcon);
        this._fadeIcon.destroy();
        this._fadeIcon = null;
        this._pendingFrames = null;
        this._pendingFile = null;
        this._startTimer();
    }

    _applyMirrorTo(icon) {
        icon.set_pivot_point(0.5, 0.5);
        icon.scale_x = this._mirrored ? -1 : 1;
    }

    _refreshMirror() {
        const m = isMirrored(this._activity, this._seed, this._nowSec(), this._entryMirrored);
        if (m === this._mirrored)
            return;
        this._mirrored = m;
        this._applyMirrorTo(this._icon);
        if (this._fadeIcon)
            this._applyMirrorTo(this._fadeIcon);
    }

    _startTimer() {
        this._stopTimer();
        if (!this._frames || this._frames.length <= 1)
            return;
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FPS_MS, () => {
            this._frame = (this._frame + 1) % this._frames.length;
            this._icon.set_gicon(this._frames[this._frame]);
            this._refreshMirror();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _playGlow() {
        this._stopGlow();
        this._hueIdx = 0;
        this._glow.set_style(glowStyle(GLOW_COLORS[0]));
        this._glow.opacity = 0;
        this._glow.ease({
            opacity: GLOW_PEAK,
            duration: GLOW_UP_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._glow.ease({
                    opacity: 0,
                    duration: GLOW_DOWN_MS,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onComplete: () => this._stopGlow(),
                });
            },
        });
        this._glowHueId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, GLOW_HUE_MS, () => {
            this._hueIdx = (this._hueIdx + 1) % GLOW_COLORS.length;
            this._glow.set_style(glowStyle(GLOW_COLORS[this._hueIdx]));
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopGlow() {
        if (this._glowHueId) {
            GLib.source_remove(this._glowHueId);
            this._glowHueId = 0;
        }
        this._glow.remove_all_transitions();
        this._glow.opacity = 0;
    }

    destroy() {
        this._stopTimer();
        this._stopGlow();
        this._stopHatch();
        if (this._fadeIcon) {
            this._fadeIcon.remove_all_transitions();
            this._fadeIcon.destroy();
            this._fadeIcon = null;
        }
        super.destroy();
    }
});

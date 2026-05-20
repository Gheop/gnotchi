import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import {
    initialState, reduce, shouldDecayWorking, shouldDecayWaving, applyDecay, isExpired,
} from '../lib/stateMachine.js';

const TICK_MS = 1000;
// Délai sans événement avant que `working` ne retombe à `idle`.
const WORKING_DECAY_MS = 8000;
// Durée du salut SessionStart (claude_waving_neutral : 25 frames @10fps),
// après quoi la mascotte retombe à idle. Réalise WAVING_DURATION_MS de la spec.
const WAVING_DECAY_MS = 2600;

export const Session = GObject.registerClass({
    Signals: {
        'changed': {},
        'expired': {},
        'ended': {},
    },
}, class Session extends GObject.Object {
    _init(sessionId, idleTimeoutMs) {
        super._init();
        this.sessionId = sessionId;
        this._idleTimeoutMs = idleTimeoutMs;
        this._terminated = false;
        this._state = initialState(this._now());
        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            try {
                this._tick();
            } catch (e) {
                logError(e, `gnotchi: tick session ${this.sessionId}`);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _now() {
        // Millisecondes (cohérent avec WORKING_DECAY_MS et idleTimeoutMs).
        return Math.floor(GLib.get_real_time() / 1e3);
    }

    get state() {
        return this._state;
    }

    handle(msg) {
        if (this._terminated)
            return;
        this._state = reduce(this._state, msg, this._now());
        if (this._state.ended) {
            this._stopTick();
            this.emit('ended');
            return;
        }
        this.emit('changed');
    }

    _tick() {
        const now = this._now();
        if (isExpired(this._state, now, this._idleTimeoutMs)) {
            this._stopTick();
            this.emit('expired');
            return;
        }
        if (shouldDecayWorking(this._state, now, WORKING_DECAY_MS) ||
            shouldDecayWaving(this._state, now, WAVING_DECAY_MS)) {
            this._state = applyDecay(this._state);
            this.emit('changed');
        }
    }

    _stopTick() {
        this._terminated = true;
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = 0;
        }
    }

    destroy() {
        this._stopTick();
    }
});

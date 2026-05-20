import GObject from 'gi://GObject';
import { Session } from './session.js';

export const SessionManager = GObject.registerClass({
    Signals: {
        'session-added': { param_types: [GObject.TYPE_STRING] },
        'session-removed': { param_types: [GObject.TYPE_STRING] },
        'session-changed': { param_types: [GObject.TYPE_STRING] },
        'feed': { param_types: [GObject.TYPE_JSOBJECT] },
    },
}, class SessionManager extends GObject.Object {
    _init(idleTimeoutMs) {
        super._init();
        this._idleTimeoutMs = idleTimeoutMs;
        this._sessions = new Map(); // id -> { session, signalIds }
    }

    get sessions() {
        return this._sessions;
    }

    onMessage(msg) {
        // `feed` est le flux brut : tout message validé, même un SessionEnd
        // pour une session inconnue (ignoré ensuite pour le routage).
        this.emit('feed', msg);
        let entry = this._sessions.get(msg.session_id);
        if (!entry) {
            if (msg.event === 'SessionEnd')
                return;
            entry = this._create(msg.session_id);
        }
        entry.session.handle(msg);
    }

    _create(id) {
        const session = new Session(id, this._idleTimeoutMs);
        const signalIds = [
            session.connect('changed', () => this.emit('session-changed', id)),
            session.connect('expired', () => this._remove(id)),
            session.connect('ended', () => this._remove(id)),
        ];
        const entry = { session, signalIds };
        this._sessions.set(id, entry);
        this.emit('session-added', id);
        return entry;
    }

    // Ordre invariant : disconnect + session.destroy() AVANT delete,
    // delete AVANT emit('session-removed'), pour qu'un consommateur qui
    // relit this.sessions dans le handler voie bien la session disparue.
    _remove(id) {
        const entry = this._sessions.get(id);
        if (!entry)
            return;
        for (const sid of entry.signalIds)
            entry.session.disconnect(sid);
        entry.session.destroy();
        this._sessions.delete(id);
        this.emit('session-removed', id);
    }

    destroy() {
        for (const id of [...this._sessions.keys()])
            this._remove(id);
    }
});

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import { parseQuota, extractToken, isTokenExpired } from '../lib/quota.js';

const API_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';
const DEFAULT_TTL_MS = 300000;
const TIMEOUT_S = 10;

// Récupère le quota d'abonnement (fenêtre 5 h et hebdo) via l'endpoint
// OAuth d'Anthropic, avec le token que Claude Code stocke déjà dans
// ~/.claude/.credentials.json.
//
// Le rafraîchissement est paresseux : il n'a lieu qu'à l'ouverture du
// popup, pas sur un timer de fond, donc aucune requête tant que
// personne ne regarde. Tout échec est silencieux et conserve la dernière
// valeur connue ; `reason` porte le motif pour l'affichage.
export class QuotaTracker {
    // `onUpdate` est appelé quand un refresh aboutit, pour rafraîchir la
    // ligne du popup sans attendre sa réouverture.
    constructor(onUpdate = null, ttlMs = DEFAULT_TTL_MS) {
        this._onUpdate = onUpdate;
        this._ttl = ttlMs;
        this._cache = null;
        this._cacheTs = 0;
        this._reason = null;
        this._busy = false;
        this._enabled = true;
        this._session = new Soup.Session({ timeout: TIMEOUT_S });
        this._cancel = new Gio.Cancellable();
    }

    setEnabled(on) {
        this._enabled = !!on;
        if (!this._enabled) {
            this._cache = null;
            this._cacheTs = 0;
            this._reason = null;
        }
    }

    setTtl(ms) {
        if (Number.isFinite(ms) && ms > 0)
            this._ttl = ms;
    }

    // Dernière valeur connue, sans effet de bord. C'est ce que lit
    // l'affichage, y compris depuis le callback de mise à jour.
    peek() {
        if (!this._enabled)
            return { quota: null, reason: 'disabled' };
        return { quota: this._cache, reason: this._reason };
    }

    // Comme peek(), mais déclenche un refresh si le cache a expiré.
    summary() {
        if (this._enabled && this._session &&
            Date.now() - this._cacheTs >= this._ttl)
            this._refresh().catch(e => logError(e, 'gnotchi: quota'));
        return this.peek();
    }

    async _refresh() {
        if (this._busy)
            return;
        this._busy = true;
        try {
            const token = this._readToken();
            if (!token) {
                this._fail('no-token');
                return;
            }
            const msg = Soup.Message.new('GET', API_URL);
            msg.request_headers.append('Authorization', `Bearer ${token}`);
            msg.request_headers.append('anthropic-beta', OAUTH_BETA);
            const bytes = await new Promise((resolve, reject) => {
                this._session.send_and_read_async(
                    msg, GLib.PRIORITY_DEFAULT, this._cancel, (s, res) => {
                        try {
                            resolve(s.send_and_read_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
            });
            const status = msg.get_status();
            if (status === 401 || status === 403) {
                this._fail('unauthorized');
                return;
            }
            if (status !== 200) {
                this._fail(`http-${status}`);
                return;
            }
            const text = new TextDecoder().decode(bytes.get_data());
            const quota = parseQuota(text);
            if (!quota) {
                this._fail('unparsable');
                return;
            }
            this._cache = quota;
            this._reason = null;
            this._cacheTs = Date.now();
            this._notify();
        } catch (e) {
            // réseau coupé, DNS, timeout : on garde la dernière valeur
            this._fail('offline');
        } finally {
            this._busy = false;
        }
    }

    // Marque l'échec sans purger le cache, et repousse la prochaine
    // tentative d'un TTL pour ne pas marteler l'API.
    _fail(reason) {
        this._reason = reason;
        this._cacheTs = Date.now();
        this._notify();
    }

    _notify() {
        if (!this._onUpdate)
            return;
        try {
            this._onUpdate();
        } catch (e) {
            logError(e, 'gnotchi: quota onUpdate');
        }
    }

    _readToken() {
        const dir = GLib.getenv('CLAUDE_CONFIG_DIR') ||
            GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
        const path = GLib.build_filenamev([dir, '.credentials.json']);
        let text;
        try {
            const [ok, contents] = GLib.file_get_contents(path);
            if (!ok)
                return null;
            text = new TextDecoder().decode(contents);
        } catch {
            return null;
        }
        if (isTokenExpired(text, Date.now()))
            return null;
        return extractToken(text);
    }

    destroy() {
        try {
            this._cancel.cancel();
        } catch { }
        try {
            this._session.abort();
        } catch { }
        this._session = null;
        this._cache = null;
        this._onUpdate = null;
    }
}

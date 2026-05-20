import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { LineFramer, parseLine } from '../lib/protocol.js';

const MAX_CONNECTIONS = 32;

export function socketPath() {
    // get_user_runtime_dir() renvoie toujours une valeur (XDG_RUNTIME_DIR ou repli).
    return GLib.build_filenamev([GLib.get_user_runtime_dir(), 'gnotchi.sock']);
}

export const SocketServer = GObject.registerClass({
    Signals: {
        'message': { param_types: [GObject.TYPE_JSOBJECT] },
        'log': { param_types: [GObject.TYPE_STRING] },
    },
}, class SocketServer extends GObject.Object {
    _init() {
        super._init();
        this._service = null;
        this._incomingId = 0;
        this._cancellable = null;
        this._path = socketPath();
        this._connections = new Set();
    }

    start() {
        if (this._service)
            return;
        try {
            GLib.unlink(this._path); // socket périmé après crash
        } catch { }
        this._cancellable = new Gio.Cancellable();
        this._service = new Gio.SocketService();
        const addr = Gio.UnixSocketAddress.new(this._path);
        this._service.add_address(addr, Gio.SocketType.STREAM,
            Gio.SocketProtocol.DEFAULT, null);
        this._incomingId = this._service.connect('incoming', (_s, conn) => {
            this._onIncoming(conn);
            return false;
        });
        this._service.start();
        this.emit('log', `socket en écoute: ${this._path}`);
    }

    _onIncoming(conn) {
        if (this._connections.size >= MAX_CONNECTIONS) {
            this.emit('log', `connexion refusée: ${MAX_CONNECTIONS} max atteint`);
            try { conn.close(null); } catch { }
            return;
        }
        this._connections.add(conn);
        const framer = new LineFramer();
        const decoder = new TextDecoder();
        const stream = conn.get_input_stream();
        const loop = () => {
            stream.read_bytes_async(8192, GLib.PRIORITY_DEFAULT, this._cancellable, (s, res) => {
                if (this._cancellable === null)
                    return; // serveur arrêté : ne touche plus à rien
                let bytes = null;
                try {
                    bytes = s.read_bytes_finish(res);
                } catch {
                    this._closeConn(conn, stream);
                    return;
                }
                if (!bytes || bytes.get_size() === 0) {
                    this._closeConn(conn, stream);
                    return;
                }
                // JSON du fil = ASCII (json.dumps ensure_ascii) ; pas de séquence multi-octets à recoller. gjs 1.88 n'implémente pas l'option stream.
                const text = decoder.decode(bytes.toArray());
                const now = Math.floor(GLib.get_real_time() / 1e6);
                for (const line of framer.feed(text)) {
                    const r = parseLine(line, now);
                    if (r.ok)
                        this.emit('message', r.msg);
                    else
                        this.emit('log', `rejet: ${r.reason}`);
                }
                loop();
            });
        };
        loop();
    }

    _closeConn(conn, stream) {
        this._connections.delete(conn);
        try { stream.close(null); } catch { }
        try { conn.close(null); } catch { }
    }

    stop() {
        const cancellable = this._cancellable;
        this._cancellable = null;
        if (cancellable)
            cancellable.cancel();
        if (this._service) {
            if (this._incomingId) {
                this._service.disconnect(this._incomingId);
                this._incomingId = 0;
            }
            this._service.stop();
            this._service.close();
            this._service = null;
        }
        for (const c of this._connections) {
            try { c.close(null); } catch { }
        }
        this._connections.clear();
        try { GLib.unlink(this._path); } catch { }
    }
});

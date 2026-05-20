#!/usr/bin/env bash
# Test visuel de gnotchi dans un GNOME Shell imbriqué (GNOME 49+).
#
#   ./tools/dev-test-nested.sh [fixture] [delai_s]
#
# fixture : nom dans tests/fixtures sans extension (defaut: session-basic)
# delai_s : pause entre evenements rejoues (defaut: 1.5)
#
# Le script : (re)build + install l'extension, l'active dans dconf SANS
# ecraser ta liste (restauree a la sortie), lance le shell imbrique
# `gnome-shell --devkit --wayland`, attend le socket, rejoue la fixture.
# Ferme la fenetre imbriquee pour terminer.
set -euo pipefail

UUID="gnotchi@gheop.github"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${1:-session-basic}"
DELAY="${2:-1.5}"
FIXTURE_PATH="$ROOT/tests/fixtures/$FIXTURE.jsonl"
SOCK="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnotchi.sock"

cd "$ROOT"
[ -f "$FIXTURE_PATH" ] || { echo "fixture introuvable : $FIXTURE_PATH" >&2; exit 2; }
command -v gnome-shell >/dev/null || { echo "gnome-shell introuvable" >&2; exit 2; }
# `gnome-shell --devkit` (GNOME 49+) ouvre la fenetre visible via ce binaire.
# Sans lui, le shell tourne sans fenetre : on echoue tot avec un message clair
# plutot que de lancer un shell invisible et laisser l'utilisateur perplexe.
[ -x /usr/libexec/mutter-devkit ] || {
    echo "Visualiseur du shell imbrique absent : /usr/libexec/mutter-devkit" >&2
    echo "Installe-le :  sudo dnf install -y mutter-devkit" >&2
    exit 3
}

echo ">> build + install"
bash tools/package.sh >/dev/null
gnome-extensions install --force "$UUID.zip"

echo ">> activation dans dconf (sauvegarde de ta liste, restauree a la sortie)"
PREV_EXT="$(gsettings get org.gnome.shell enabled-extensions)"
restore() {
    gsettings set org.gnome.shell enabled-extensions "$PREV_EXT" 2>/dev/null || true
    [ -n "${SHELL_PID:-}" ] && kill "$SHELL_PID" 2>/dev/null || true
}
trap restore EXIT INT TERM
python3 - "$UUID" <<'PY'
import ast, subprocess, sys
uuid = sys.argv[1]
cur = subprocess.check_output(
    ['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions']).decode().strip()
lst = ast.literal_eval(cur) if cur.startswith('[') else []
if uuid not in lst:
    lst.append(uuid)
subprocess.run(['gsettings', 'set', 'org.gnome.shell',
                'enabled-extensions', str(lst)], check=True)
print('enabled-extensions =', lst)
PY

echo ">> shell imbrique : dbus-run-session -- gnome-shell --devkit --wayland"
rm -f "$SOCK"
dbus-run-session -- gnome-shell --devkit --wayland &
SHELL_PID=$!

echo ">> attente du socket ($SOCK) ..."
for _ in $(seq 1 30); do
    [ -S "$SOCK" ] && break
    kill -0 "$SHELL_PID" 2>/dev/null || {
        echo "le shell imbrique s'est arrete avant d'ouvrir le socket." >&2
        echo "Sur Fedora il faut souvent : sudo dnf install -y mutter-devkit" >&2
        echo "Diagnostic : journalctl --user -o cat | grep -i gnotchi" >&2
        exit 1
    }
    sleep 0.5
done
[ -S "$SOCK" ] || { echo "socket jamais apparu (extension non chargee ?)" >&2; exit 1; }

echo ">> rejeu de $FIXTURE.jsonl (delai ${DELAY}s)"
sleep 1
"$ROOT/tools/gnotchi-sim" "$FIXTURE_PATH" "$DELAY"

echo
echo ">> fixture rejouee. Observe la fenetre imbriquee."
echo ">> ferme-la (ou Ctrl-C ici) pour terminer ; ta liste d'extensions sera restauree."
wait "$SHELL_PID"

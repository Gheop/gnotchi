#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP"
mkdir -p "$TMP/.claude"
echo '{"model":"opus"}' > "$TMP/.claude/settings.json"

EMIT=/some/path/gnotchi-emit bash ./tools/install-hooks.sh
python3 - "$TMP/.claude/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
assert s["model"] == "opus", "préserve les clés existantes"
h = s["hooks"]
for ev in ["SessionStart","UserPromptSubmit","PreToolUse","PostToolUse","Notification","Stop","PreCompact","SessionEnd"]:
    assert ev in h, ev
    cmd = h[ev][0]["hooks"][0]["command"]
    assert cmd.endswith("gnotchi-emit " + ev) or ("gnotchi-emit" in cmd and ev in cmd), (ev, cmd)
print("ok install")
PY

# Idempotence : relancer ne duplique pas
EMIT=/some/path/gnotchi-emit bash ./tools/install-hooks.sh
python3 - "$TMP/.claude/settings.json" <<'PY'
import json, sys
h = json.load(open(sys.argv[1]))["hooks"]
assert len(h["Stop"]) == 1, h["Stop"]
print("ok idempotent")
PY

bash ./tools/uninstall-hooks.sh
python3 - "$TMP/.claude/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
assert "gnotchi-emit" not in json.dumps(s.get("hooks", {})), s
print("ok uninstall")
PY

# Conf non inscriptible : l'install des hooks ne doit pas échouer
echo '{"model":"opus"}' > "$TMP/.claude/settings.json"
EMIT=/some/path/gnotchi-emit XDG_RUNTIME_DIR=/proc/nonexistent-gnotchi bash ./tools/install-hooks.sh
python3 - "$TMP/.claude/settings.json" <<'PY'
import json, sys
h = json.load(open(sys.argv[1]))["hooks"]
assert "Stop" in h and len(h["Stop"]) == 1, h
print("ok install robuste sans runtime inscriptible")
PY

# Backup non écrasé : après 2 installs, .gnotchi.bak garde la config pré-gnotchi
rm -f "$TMP/.claude/settings.json" "$TMP/.claude/settings.json.gnotchi.bak"
echo '{"model":"opus"}' > "$TMP/.claude/settings.json"
EMIT=/some/path/gnotchi-emit XDG_RUNTIME_DIR="$TMP" bash ./tools/install-hooks.sh
EMIT=/some/path/gnotchi-emit XDG_RUNTIME_DIR="$TMP" bash ./tools/install-hooks.sh
test "$(cat "$TMP/.claude/settings.json.gnotchi.bak")" = '{"model":"opus"}' \
  && echo "ok backup non écrasé"

# Collision : un hook tiers contenant la sous-chaîne gnotchi-emit est préservé
rm -f "$TMP/.claude/settings.json" "$TMP/.claude/settings.json.gnotchi.bak"
cat > "$TMP/.claude/settings.json" <<'JSON'
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"/opt/gnotchi-emitter/run.sh"}]}]}}
JSON
EMIT=/some/path/gnotchi-emit XDG_RUNTIME_DIR="$TMP" bash ./tools/install-hooks.sh
bash ./tools/uninstall-hooks.sh
python3 - "$TMP/.claude/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
cmds = [h["command"] for g in s.get("hooks", {}).get("Stop", []) for h in g["hooks"]]
assert cmds == ["/opt/gnotchi-emitter/run.sh"], cmds
print("ok hook tiers préservé (pas de collision sous-chaîne)")
PY

# JSON invalide : message clair, code != 0, settings.json NON tronqué
rm -f "$TMP/.claude/settings.json" "$TMP/.claude/settings.json.gnotchi.bak"
printf 'pas du json' > "$TMP/.claude/settings.json"
set +e
ERR=$(EMIT=/some/path/gnotchi-emit XDG_RUNTIME_DIR="$TMP" bash ./tools/install-hooks.sh 2>&1); RC=$?
set -e
test "$RC" -ne 0 \
  && echo "$ERR" | grep -q "n'est pas du JSON valide" \
  && ! echo "$ERR" | grep -qi "Traceback" \
  && test "$(cat "$TMP/.claude/settings.json")" = 'pas du json' \
  && echo "ok JSON invalide géré proprement"

# CLAUDE_CONFIG_DIR : si l'env var est posée, install/uninstall ciblent ce path
rm -rf "$TMP/.claude" "$TMP/custom"
mkdir -p "$TMP/custom"
echo '{"model":"opus"}' > "$TMP/custom/settings.json"
CLAUDE_CONFIG_DIR="$TMP/custom" EMIT=/some/path/gnotchi-emit \
  XDG_RUNTIME_DIR="$TMP" bash ./tools/install-hooks.sh >/dev/null
test ! -f "$TMP/.claude/settings.json" \
  || { echo "FAIL: ~/.claude/settings.json créé alors que CLAUDE_CONFIG_DIR posé"; exit 1; }
python3 - "$TMP/custom/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
assert "Stop" in s["hooks"], "hook posé dans CLAUDE_CONFIG_DIR"
PY
CLAUDE_CONFIG_DIR="$TMP/custom" bash ./tools/uninstall-hooks.sh >/dev/null
python3 - "$TMP/custom/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
assert "gnotchi-emit" not in json.dumps(s.get("hooks", {})), "uninstall respecte CLAUDE_CONFIG_DIR"
PY
echo "ok CLAUDE_CONFIG_DIR respecté par install/uninstall"

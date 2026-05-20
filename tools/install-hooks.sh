#!/usr/bin/env bash
# Pose les hooks gnotchi dans ~/.claude/settings.json (idempotent, avec backup).
set -euo pipefail
SETTINGS="${HOME}/.claude/settings.json"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMIT="${EMIT:-$SELF_DIR/gnotchi-emit}"
RUNTIME="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

mkdir -p "${HOME}/.claude"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
[ -f "${SETTINGS}.gnotchi.bak" ] || cp "$SETTINGS" "${SETTINGS}.gnotchi.bak"
{ printf '{"emotion_mode":"local"}\n' > "${RUNTIME}/gnotchi.conf"; } 2>/dev/null || true

EMIT="$EMIT" python3 - "$SETTINGS" <<'PY'
import json, os, re, sys
path = sys.argv[1]
emit = os.environ["EMIT"]
events = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
          "Notification", "Stop", "PreCompact", "SessionEnd"]
GNOTCHI_RE = re.compile(r"(^|/)gnotchi-emit (" + "|".join(events) + r")$")


def is_gnotchi(group):
    for h in group.get("hooks", []):
        if GNOTCHI_RE.search(str(h.get("command", ""))):
            return True
    return False


try:
    with open(path) as f:
        s = json.load(f)
except json.JSONDecodeError as e:
    sys.exit(f"Erreur : {path} n'est pas du JSON valide ({e}). Corrigez-le avant de relancer.")

hooks = s.setdefault("hooks", {})
for ev in events:
    entry = {"hooks": [{"type": "command", "command": f"{emit} {ev}"}]}
    lst = [g for g in hooks.get(ev, []) if not is_gnotchi(g)]
    lst.append(entry)
    hooks[ev] = lst

tmp = path + ".gnotchi.tmp"
with open(tmp, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
print("hooks gnotchi posés dans " + path)
PY

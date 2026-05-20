#!/usr/bin/env bash
set -euo pipefail
SETTINGS="${HOME}/.claude/settings.json"
[ -f "$SETTINGS" ] || { echo "rien à retirer"; exit 0; }
python3 - "$SETTINGS" <<'PY'
import json, os, re, sys
path = sys.argv[1]
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
    sys.exit(f"Erreur : {path} n'est pas du JSON valide ({e}).")

hooks = s.get("hooks", {})
for ev in list(hooks):
    hooks[ev] = [g for g in hooks[ev] if not is_gnotchi(g)]
    if not hooks[ev]:
        del hooks[ev]
if "hooks" in s and not s["hooks"]:
    del s["hooks"]

tmp = path + ".gnotchi.tmp"
with open(tmp, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
print("hooks gnotchi retirés")
PY

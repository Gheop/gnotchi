#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
SOCK="$TMP/gnotchi.sock"
export XDG_RUNTIME_DIR="$TMP"

# Démarre un serveur AF_UNIX one-shot, lance gnotchi-emit, capture la ligne.
emit_capture() {
  local event="$1" payload="$2"
  rm -f "$SOCK" "$TMP/out"
  python3 - "$SOCK" "$TMP/out" <<'PY' &
import socket, sys
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(sys.argv[1]); srv.listen(1)
c, _ = srv.accept()
data = b''
while True:
    b = c.recv(4096)
    if not b: break
    data += b
open(sys.argv[2], 'wb').write(data)
PY
  local spid=$!
  local i
  for i in $(seq 1 50); do
    [ -S "$SOCK" ] && break
    sleep 0.02
  done
  printf '%s' "$payload" | XDG_RUNTIME_DIR="$TMP" ./tools/gnotchi-emit "$event"
  wait "$spid"
}

assert_emotion() {
  local payload="$1" expected="$2" label="$3"
  emit_capture UserPromptSubmit "$payload"
  EXPECTED="$expected" LABEL="$label" python3 - "$TMP/out" <<'PY'
import json, os, sys
m = json.loads(open(sys.argv[1]).read().strip())
exp = os.environ["EXPECTED"]
label = os.environ["LABEL"]
assert m["event"] == "UserPromptSubmit", m
assert m["v"] == 1, m
got = m["data"].get("emotion")
assert got == exp, f"{label}: attendu {exp}, obtenu {got} ({m})"
print(f"ok {label} ({exp})")
PY
}

assert_emotion '{"session_id":"abc","cwd":"/tmp/proj","prompt":"merci"}' \
  happy "merci -> happy"

assert_emotion '{"session_id":"abc","cwd":"/tmp/proj","prompt":"je fais du debugging tranquille"}' \
  neutral "debugging -> neutral"

assert_emotion '{"session_id":"abc","cwd":"/tmp/proj","prompt":"c’est cassé"}' \
  sad "cassé -> sad"

assert_emotion '{"session_id":"abc","cwd":"/tmp/proj","prompt":"bon ça marche"}' \
  happy "ça marche -> happy"

# Socket absent : exit 0, silencieux (exit code explicite)
rm -f "$SOCK"
echo '{"session_id":"x"}' | XDG_RUNTIME_DIR="$TMP" ./tools/gnotchi-emit Stop >"$TMP/o" 2>&1; rc=$?
[ "$rc" -eq 0 ] && [ ! -s "$TMP/o" ] && echo "ok silencieux sans socket"

# stdin invalide : exit 0, silencieux
printf 'not json at all' | XDG_RUNTIME_DIR="$TMP" ./tools/gnotchi-emit Foo >"$TMP/o2" 2>&1; rc=$?
[ "$rc" -eq 0 ] && [ ! -s "$TMP/o2" ] && echo "ok exit 0 sur stdin invalide"

# Capture jusqu'à 2 connexions (send() ouvre une connexion par message).
emit_capture2() {
  local event="$1" payload="$2"; shift 2
  rm -f "$SOCK" "$TMP/out2"
  python3 - "$SOCK" "$TMP/out2" <<'PY' &
import socket, sys
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(sys.argv[1]); srv.listen(2); srv.settimeout(2.5)
out = open(sys.argv[2], 'wb')
n = 0
try:
    while n < 2:
        c, _ = srv.accept()
        while True:
            b = c.recv(4096)
            if not b:
                break
            out.write(b)
        c.close()
        n += 1
        srv.settimeout(0.6)
except socket.timeout:
    pass
out.close()
PY
  local spid=$! i
  for i in $(seq 1 50); do [ -S "$SOCK" ] && break; sleep 0.02; done
  printf '%s' "$payload" | ${@:-env} XDG_RUNTIME_DIR="$TMP" ./tools/gnotchi-emit "$event"
  wait "$spid"
}

reaction_emotion() {
  python3 - "$TMP/out2" <<'PY'
import json, sys
em = ""
for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        m = json.loads(line)
    except Exception:
        continue
    if m.get("event") == "Emotion" and m.get("data", {}).get("source") == "reaction":
        em = m["data"].get("emotion", "")
print(em)
PY
}

printf '{"emotion_mode":"local"}\n' > "$TMP/gnotchi.conf"
emit_capture2 Stop '{"session_id":"s","cwd":"/tmp/p"}'
[ "$(reaction_emotion)" = "happy" ] && echo "ok Stop -> reaction happy" \
  || { echo "FAIL Stop reaction: $(cat "$TMP/out2")"; exit 1; }

emit_capture2 PostToolUse '{"session_id":"s","tool_name":"Bash","tool_response":{"error":"boom"}}'
[ "$(reaction_emotion)" = "sad" ] && echo "ok PostToolUse error -> reaction sad" \
  || { echo "FAIL PostToolUse error: $(cat "$TMP/out2")"; exit 1; }

emit_capture2 PostToolUse '{"session_id":"s","tool_response":{"is_error":true}}'
[ "$(reaction_emotion)" = "sad" ] && echo "ok PostToolUse is_error -> reaction sad" \
  || { echo "FAIL PostToolUse is_error: $(cat "$TMP/out2")"; exit 1; }

emit_capture2 PostToolUse '{"session_id":"s","tool_response":{"stdout":"ok"}}'
[ -z "$(reaction_emotion)" ] && echo "ok PostToolUse succès -> pas de réaction" \
  || { echo "FAIL PostToolUse succès: $(cat "$TMP/out2")"; exit 1; }

printf '{"emotion_mode":"off"}\n' > "$TMP/gnotchi.conf"
emit_capture2 Stop '{"session_id":"s"}'
[ -z "$(reaction_emotion)" ] && echo "ok mode off -> pas de réaction" \
  || { echo "FAIL mode off: $(cat "$TMP/out2")"; exit 1; }
printf '{"emotion_mode":"local"}\n' > "$TMP/gnotchi.conf"

emit_capture2 Stop '{"session_id":"s"}' env GNOTCHI_HEADLESS=1
[ -z "$(reaction_emotion)" ] && [ ! -s "$TMP/out2" ] && echo "ok headless Stop -> rien" \
  || { echo "FAIL headless Stop: $(cat "$TMP/out2")"; exit 1; }

# Garde de réentrance : avec GNOTCHI_HEADLESS=1, gnotchi-emit n'émet rien.
# Sans ce garde, le `claude -p` de classification (mode local-headless)
# rappelle le hook UserPromptSubmit -> récursion non bornée (fork bomb).
guard_no_emit() {
  rm -f "$SOCK" "$TMP/g"
  python3 - "$SOCK" "$TMP/g" <<'PY' &
import socket, sys
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(sys.argv[1]); srv.listen(1)
srv.settimeout(2.0)
try:
    c, _ = srv.accept()
    data = b''
    while True:
        b = c.recv(4096)
        if not b:
            break
        data += b
    open(sys.argv[2], 'wb').write(data)
except socket.timeout:
    pass
PY
  local spid=$!
  local i
  for i in $(seq 1 50); do
    [ -S "$SOCK" ] && break
    sleep 0.02
  done
  printf '%s' '{"session_id":"abc","cwd":"/tmp/p","prompt":"merci"}' \
    | GNOTCHI_HEADLESS=1 XDG_RUNTIME_DIR="$TMP" ./tools/gnotchi-emit UserPromptSubmit
  wait "$spid"
  if [ -s "$TMP/g" ]; then
    echo "FAIL garde réentrance : émission malgré GNOTCHI_HEADLESS=1 ($(cat "$TMP/g"))"
    exit 1
  fi
  echo "ok garde réentrance (GNOTCHI_HEADLESS=1 -> silencieux)"
}
guard_no_emit

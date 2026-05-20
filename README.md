# gnotchi

[![tests](https://github.com/Gheop/gnotchi/actions/workflows/test.yml/badge.svg)](https://github.com/Gheop/gnotchi/actions/workflows/test.yml)
[![license: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

A pixel-art mascot that lives in your GNOME top bar and reacts in real time
to your Claude Code sessions. One mascot per session, driven by Claude Code
hooks over a Unix socket. Inspired by
[sk-ruban/notchi](https://github.com/sk-ruban/notchi) (the macOS notch
companion).

![preview](assets/preview.gif)

States: `idle`, `working`, `waiting`, `sleeping`, `compacting`, `waving`
(startup hello). Moods: `neutral`, `happy`, `elated`, `sad`, `sobbing`.
Click any mascot to open a popup with a grass island, an activity feed,
a rolling activity verb, and a local token-usage estimate for today.

## Requirements

- GNOME Shell 50, Wayland or Xorg
- `python3` (ships by default on most distros)
- [Claude Code](https://docs.anthropic.com/claude-code)

## Install

```bash
UUID=gnotchi@gheop.github
bash tools/package.sh
gnome-extensions install --force "$UUID.zip"
gnome-extensions enable "$UUID"
```

Reload GNOME Shell — Xorg: `Alt+F2`, type `r`. Wayland: log out and back in.

Claude Code hooks are installed automatically when the extension is enabled,
and can be re-installed or removed from the Preferences dialog. For headless
setups or manual control, run `bash tools/install-hooks.sh`.

## Usage

Launch Claude Code. A mascot appears in the top bar for each active session
and follows the session's activity. Click a mascot to jump to its terminal
window (when detected); clicking the panel icon outside a mascot opens the
popup as usual. Hover a mascot for a quick tooltip with the short session id
and current activity.

When a session is busy, the popup header rotates a whimsical verb
(`✻ Cogitating…`, etc.). When a tool fails the mascot looks sad; when the
assistant finishes a turn it looks happy.

The popup shows a local estimate of today's token usage and a 7-day sparkline,
all computed from local Claude Code transcripts in `~/.claude/projects/`. No
network calls, no API keys, no cost numbers.

Optional GNOME notifications can be enabled in Preferences for end-of-turn
(`Stop`) and tool errors.

## Privacy

- `emotion-mode = off`: no mood ever computed.
- `emotion-mode = local` (default): mood is derived from local keyword
  heuristics over your prompts and tool outputs. Nothing leaves the machine.
- `emotion-mode = local-headless`: same heuristics, refined by a short
  `claude -p` classification call. Uses your existing Claude Code login
  (no separate API key) and consumes a small amount of quota.

All modes can be toggled live in the Preferences. Hooks can be removed at
any time via Preferences → "Remove hooks", or `bash tools/uninstall-hooks.sh`.

The today-usage line reads only `~/.claude/projects/**/*.jsonl` transcripts
locally, with bounded I/O (tail of each file, 250 most recent files max,
60-second cache).

## Development & testing

Run the full test suite:

```bash
for t in tests/*.test.js; do gjs -m "$t"; done
for t in tests/*.test.sh; do bash "$t"; done
```

A nested Mutter session script builds, installs, enables, and replays a
fixture without disturbing your live extension list:

```bash
./tools/dev-test-nested.sh                 # session-basic fixture
./tools/dev-test-nested.sh multi-session   # two concurrent sessions
```

Close the nested window to exit. On Fedora the nested shell needs
`mutter-devkit` (`sudo dnf install -y mutter-devkit`). Since GNOME Shell 49
the nested flag is `--devkit` (`--nested` was removed); the script already
uses the right one and fails fast with a clear message if the package is
missing.

## License

gnotchi is released under GPL-3.0 (see `LICENSE`). The sprite assets in
`assets/` come from [notchi](https://github.com/sk-ruban/notchi) by sk-ruban,
also GPL-3.0 (see `assets/NOTICE`).

## Changelog

### v1.13.1 — Discoverable session actions, ptyxis tab (2026-05-20)

- Each entry under "Sessions actives" is now a submenu with three actions:
  Copy ID, Jump to terminal, Open transcript. Items that have no data yet
  (no captured PID, no transcript path) are visible but disabled, so the
  feature is discoverable even before it's available
- `gnotchi-emit` now sends `terminal_pid` on every hook event (not only
  `SessionStart`), so sessions already running when the extension is
  reloaded get their PID captured on the next hook
- "Nouvelle session Claude Code…" now prefers `ptyxis --tab claude`
  (opens a new tab in an existing ptyxis window when available)

### v1.13.0 — Top projects, transcript open, confetti, new session (2026-05-20)

- New popup row "Top projets : X 8k · Y 3k · Z 1k" — daily token usage
  grouped by project (the slug folder under `~/.claude/projects/`)
- Right-click a top-bar mascot to open the session's transcript `.jsonl`
  in your default editor. The hook propagates `transcript_path` from the
  Claude Code payload
- Small confetti animation falls from the panel mascot on `Stop` events.
  Toggleable via the new "Confettis…" preference (default on)
- New popup entry "Nouvelle session Claude Code…" launches `claude` in
  a fresh terminal window (tries ptyxis, gnome-terminal, kgx, ghostty,
  foot, kitty, alacritty, wezterm, konsole, tilix, xterm in order)

### v1.12.0 — Richer hover tooltip (2026-05-20)

- Hover tooltip now shows `${cwd_basename} · ${activity} · ${duration}`
  (falls back to short id when no cwd has been seen yet for that session)
- Duration is the time spent in the current activity (`12s`, `5m`, `2h15m`,
  `3d4h`), tracked from each activity transition

### v1.11.0 — Feed filter, copy session id, CI (2026-05-20)

- New "Sessions actives (N)" submenu in the popup. Each entry copies the
  full session ID to the clipboard and shows a brief notification
- New `feed-filter` preference (`all` / `significant`) — `significant` keeps
  only `SessionStart`, `Stop`, `PreCompact`, `SessionEnd` and tool errors,
  for a cleaner popup feed during working-heavy sessions
- GitHub Actions CI: runs the full gjs + shell test suite on every push and
  PR. Badge in the README

### v1.10.0 — Terminal jump, notifications, 7-day sparkline (2026-05-20)

- Click a top-bar mascot to focus its terminal window. The hook captures the
  terminal PID at `SessionStart` (walks `/proc/<pid>` ancestors until it
  matches a known emulator: gnome-terminal, kitty, foot, alacritty, wezterm,
  konsole, ghostty, ptyxis, terminator, tilix, xterm…). Falls back to the
  usual popup if no PID was captured or the window can't be matched.
- Optional native GNOME notifications on `Stop` (assistant finished a turn)
  and on tool errors. Both default off, toggleable in Preferences →
  Notifications.
- Popup now shows a 7-day token usage sparkline (`▁▂▄▇▄▂▁`) below the
  "today" line, with the day's max in human-readable units.

### v1.9.0 — Three quick wins (2026-05-20)

- New preference "Hide when no session is active": the gnotchi icon vanishes
  from the top bar while no Claude Code session is running and comes back
  the moment one starts
- `$CLAUDE_CONFIG_DIR` is now honored everywhere it matters (auto-install,
  Preferences diagnostic, usage tracker, install/uninstall scripts) — falls
  back to `~/.claude` when unset
- Hover a top-bar mascot to see a tooltip with the short session id and the
  current activity

### v1.8.1 — Popup garden overflow fix (2026-05-20)

- The popup grass island is now tiled at a fixed 64×64 size and clipped to
  its box, so it no longer bleeds onto the message feed below
- Rounded corners on the island so it lines up with the popup

### v1.8.0 — Today's usage in the popup (2026-05-19)

- The popup shows a local estimate of today's token usage (work · cache),
  read from Claude Code transcripts on disk
- 100% local: no API, no key; bounded async reads, no price tag

### v1.7.0 — Error / completion reactions (2026-05-19)

- The mascot looks sad when a tool fails and happy when the assistant
  finishes its turn
- Best-effort detection inside the hook, no model call; respects the
  emotion mode (off → no reactions)

### v1.6.0 — Activity verb in the popup (2026-05-19)

- When at least one session is busy, the popup header cycles a whimsical
  present-participle ("✻ Cogitating…"), notchi-style
- Falls back to `gnotchi · N session(s)` when idle

### v1.5.0 — Auto-installed hooks (2026-05-19)

- The extension installs and repairs its Claude Code hooks on enable
- Preferences gain a Diagnostic section: hook status + install/repair and
  remove buttons
- `tools/install-hooks.sh` stays available for headless / manual setups

### v1.4.0 — Mascot polish (2026-05-19)

- Mascots occasionally mirror left/right with a per-session cadence
- 150 ms cross-fade between states instead of an instant swap
- Iridescent pulsing halo during the startup wave

### v1.3.0 — notchi color sprites (2026-05-19)

- Mascots now use the colored animated sprites from upstream notchi
  (10 fps), in both the top bar and the popup
- New states: animated startup wave, distinct compacting animation
- Popup: mascots sit on a tiled grass island
- License switched to GPL-3.0 to match notchi assets; credit to sk-ruban
- Monochrome symbolic icons removed

### v1.2.1 — local-headless fork bomb fix (2026-05-19)

- In `local-headless` mode, the internal `claude -p` mood classifier was
  inheriting the gnotchi hooks and re-triggering itself, spawning hundreds
  of sessions and mascots and burning CPU + API tokens
- Reentrancy guard: `gnotchi-emit` sets `GNOTCHI_HEADLESS=1` on the child
  `claude -p` process and exits silently if that variable is already set
- Real-session moods are still classified; no more parasitic mascots
- Regression test added (`tests/gnotchi-emit.test.sh`)

### v1.2.0 — Renamed to gnotchi (2026-05-19)

- The project is now **gnotchi** (GNOME + Tamagotchi); `notchi-linux` made
  little sense without a notch
- UUID `gnotchi@gheop.github`, schema `org.gnome.shell.extensions.gnotchi`,
  socket `gnotchi.sock`, tools `gnotchi-emit` / `gnotchi-sim`

### v1.1.0 — Symbolic icon (2026-05-18)

- Monochrome transparent icon recolored by the GNOME theme (top bar and
  popup), matching other extension icons
- `gen-sprites` produced symbolic SVGs instead of PNGs; PNG generation
  dropped
- The previous LCD pixel-art green look was removed (inconsistent next to
  other panel icons)

### v1.0.0 — First release (2026-05-18)

- One pixel-art mascot per Claude Code session in the top bar
- States idle / working / waiting / sleeping driven by hooks over a Unix
  socket
- Local heuristic moods with optional headless refinement
- Grass island popup with activity feed
- Adw/Gtk4 preferences, install / uninstall of hooks

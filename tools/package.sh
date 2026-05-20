#!/usr/bin/env bash
set -euo pipefail
UUID=gnotchi@gheop.github
glib-compile-schemas schemas/
rm -f "${UUID}.zip"
zip -r "${UUID}.zip" metadata.json extension.js prefs.js src lib schemas assets tools README.md LICENSE \
  -x '*.bak' '*.pyc' '*__pycache__*' '*.swp' '*~'
echo "écrit ${UUID}.zip"

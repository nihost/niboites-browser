#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Build NiBoites — package l'extension en .zip pour les stores
#
# Aucun bundling nécessaire : extension Manifest V3 en HTML/CSS/JS
# vanilla, sans dépendances. Ce script :
#   1. valide le manifest + les locales (JSON)
#   2. vérifie la syntaxe de tous les fichiers JS (node --check)
#   3. produit dist/niboites-browser-<version>.zip (manifest.json à la racine)
#
# Usage : ./scripts/build.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
NAME="niboites"
OUT="dist/${NAME}-${VERSION}.zip"

echo "==> Validation du manifest et des locales"
python3 - <<'PY'
import json, glob, sys
m = json.load(open('manifest.json'))
assert m['manifest_version'] == 3, 'manifest_version doit être 3'
for f in sorted(glob.glob('_locales/*/messages.json')):
    json.load(open(f))
    print(f'  ✓ {f}')
print('  ✓ manifest.json')
PY

echo "==> Vérification syntaxique JS"
for f in lib/*.js popup/*.js options/*.js background/*.js; do
  node --check "$f"
  echo "  ✓ $f"
done

echo "==> Packaging → $OUT"
rm -rf dist
mkdir -p dist
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
# Copie propre : exclut .git, dist, scripts et fichiers OS/éditeur
rsync -a \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'scripts' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '*.crx' \
  --exclude '*.zip' \
  ./ "$STAGE"/
(cd "$STAGE" && zip -qr "$OLDPWD/$OUT" .)

echo "==> OK : $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') entrées)"
echo "    Prêt pour Chrome Web Store / Firefox AMO (uploader ce .zip tel quel)."

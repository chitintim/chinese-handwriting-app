#!/usr/bin/env bash
# Uploads the signing secrets to the public repo's GitHub Actions secrets.
# Reads ~/.config/moxie-signing/{moxie.p12,password.txt}. Never prints the password.
# Usage: android/ci/set-secrets.sh        (needs `gh auth login` with repo admin rights)
set -euo pipefail

REPO="${MOXIE_REPO:-chitintim/chinese-handwriting-app}"
DIR="${MOXIE_SIGNING_DIR:-$HOME/.config/moxie-signing}"
ALIAS="moxie"

[ -f "$DIR/moxie.p12" ]     || { echo "missing $DIR/moxie.p12" >&2; exit 1; }
[ -f "$DIR/password.txt" ]  || { echo "missing $DIR/password.txt" >&2; exit 1; }
command -v gh >/dev/null    || { echo "gh CLI not found" >&2; exit 1; }

# base64 without line wraps (portable between macOS and Linux)
base64 < "$DIR/moxie.p12" | tr -d '\n' | gh secret set MOXIE_KEYSTORE_B64 -R "$REPO"
# strip any trailing CR/LF from the password file
tr -d '\r\n' < "$DIR/password.txt" | gh secret set MOXIE_KEYSTORE_PASSWORD -R "$REPO"
printf '%s' "$ALIAS" | gh secret set MOXIE_KEY_ALIAS -R "$REPO"

echo "Secrets set on $REPO: MOXIE_KEYSTORE_B64, MOXIE_KEYSTORE_PASSWORD, MOXIE_KEY_ALIAS"

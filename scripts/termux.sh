#!/usr/bin/env bash
# Alysum — Termux: Firebase Hosting deploy.
#
#   bash scripts/termux.sh install   # first time: Node + Firebase CLI
#   bash scripts/termux.sh deploy    # publish site
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  cat <<'EOF'

  FIRST TIME
    bash scripts/termux.sh install

  LOG IN ONCE
    firebase login --no-localhost

  DEPLOY SITE (from repo folder)
    bash scripts/termux.sh deploy

EOF
}

do_install() {
  echo ">>> INSTALL — Node + Firebase CLI"
  pkg update -y
  pkg install -y git curl openssh openssl || true
  if pkg install -y nodejs-lts 2>/dev/null; then
    :
  elif pkg install -y nodejs 2>/dev/null; then
    :
  else
    echo "Install Node: pkg install nodejs" >&2
    exit 1
  fi
  npm install -g firebase-tools
  echo ""
  echo ">>> Next: firebase login --no-localhost"
  echo ">>> Then:  bash scripts/termux.sh deploy"
}

do_deploy() {
  cd "$ROOT"
  if ! command -v firebase >/dev/null 2>&1; then
    echo "firebase not found. Run: bash scripts/termux.sh install" >&2
    exit 1
  fi
  echo ">>> Firebase Hosting"
  firebase deploy --only hosting
  echo ">>> Done."
}

case "${1:-}" in
  install) do_install ;;
  deploy) do_deploy ;;
  help|-h|--help|"") usage ;;
  *) echo "Unknown: $1"; usage; exit 1 ;;
esac

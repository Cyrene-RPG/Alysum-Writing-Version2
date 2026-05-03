#!/usr/bin/env bash
# Alysum — one script for Termux. From repo root:
#   bash scripts/termux.sh install   # first time only
#   bash scripts/termux.sh deploy    # whenever you want to publish
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  cat <<'EOF'

  FIRST TIME (tools on your phone)
    bash scripts/termux.sh install

  THEN LOG IN ONCE (new Termux tab after install)
    gcloud auth login
    gcloud config set project alysum-web
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=alysum-web
    firebase login --no-localhost

  EVERY DEPLOY
    cd ~/Alysum-Web          # your folder
    bash scripts/termux.sh deploy

EOF
}

source_gcloud() {
  for _gc in "$HOME/google-cloud-sdk/path.bash.inc" "$HOME/google-cloud-sdk/path.inc"; do
    if [[ -f "$_gc" ]]; then
      # shellcheck source=/dev/null
      source "$_gc"
      return 0
    fi
  done
  return 1
}

do_install() {
  echo ">>> INSTALL — packages + Firebase CLI + Google Cloud SDK"
  pkg update -y
  pkg install -y git curl openssh openssl || true
  if pkg install -y nodejs-lts 2>/dev/null; then
    :
  elif pkg install -y nodejs 2>/dev/null; then
    :
  else
    echo "Install Node from Termux: pkg install nodejs" >&2
    exit 1
  fi

  if ! command -v firebase >/dev/null 2>&1; then
    npm install -g firebase-tools
  fi

  GCLOUD_HOME="${HOME}/google-cloud-sdk"
  if command -v gcloud >/dev/null 2>&1; then
    echo "gcloud already available."
  elif [[ -x "${GCLOUD_HOME}/bin/gcloud" ]]; then
    echo "gcloud already installed; add to ~/.bashrc (see below)."
  else
    ARCH="$(uname -m)"
    case "$ARCH" in
      aarch64|arm64) GC_URL="https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-arm.tar.gz" ;;
      x86_64|amd64) GC_URL="https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz" ;;
      *) echo "Unsupported CPU: $ARCH" >&2; exit 1 ;;
    esac
    TMP="$(mktemp)"
    curl -fSL "$GC_URL" -o "$TMP"
    rm -rf "${GCLOUD_HOME}"
    tar -xzf "$TMP" -C "$HOME"
    rm -f "$TMP"
    bash "${GCLOUD_HOME}/install.sh" --quiet --usage-reporting false --path-update true
  fi

  echo ""
  echo ">>> ADD THESE TWO LINES TO ~/.bashrc  (nano ~/.bashrc)"
  echo '    [ -f "$HOME/google-cloud-sdk/path.bash.inc" ] && . "$HOME/google-cloud-sdk/path.bash.inc"'
  echo '    [ -f "$HOME/google-cloud-sdk/completion.bash.inc" ] && . "$HOME/google-cloud-sdk/completion.bash.inc"'
  echo ""
  echo ">>> CLOSE Termux completely, open again, then run the LOGIN lines from:"
  echo "    bash scripts/termux.sh help"
}

do_deploy() {
  cd "$ROOT"
  source_gcloud || true
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "gcloud not found. Run: bash scripts/termux.sh install" >&2
    echo "Then add the two lines to ~/.bashrc and restart Termux." >&2
    exit 1
  fi
  if ! command -v firebase >/dev/null 2>&1; then
    echo "firebase not found. Run: bash scripts/termux.sh install" >&2
    exit 1
  fi
  echo ">>> DEPLOY (1/2) PDF server on Cloud Run"
  bash "$ROOT/scripts/deploy-pdf-exporter.sh"
  echo ">>> DEPLOY (2/2) Website on Firebase Hosting"
  firebase deploy --only hosting
  echo ">>> Finished."
}

case "${1:-}" in
  install) do_install ;;
  deploy) do_deploy ;;
  help|-h|--help|"") usage ;;
  *) echo "Unknown: $1"; usage; exit 1 ;;
esac

#!/usr/bin/env bash
# Deploy PDF exporter to Cloud Run (service name must match firebase.json).
# Works on Linux, macOS, and Termux after: bash scripts/termux.sh install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/exporter"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-exporter}"

# Termux / manual installs often put gcloud here (not on PATH until sourced).
for _gc in "$HOME/google-cloud-sdk/path.bash.inc" "$HOME/google-cloud-sdk/path.inc"; do
  if [[ -f "$_gc" ]]; then
    # shellcheck source=/dev/null
    source "$_gc"
    break
  fi
done

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
PROJECT="${PROJECT//$'\r'/}"
PROJECT="${PROJECT// /}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Set project: gcloud config set project YOUR_PROJECT_ID" >&2
  echo "Or: export GOOGLE_CLOUD_PROJECT=your-project-id" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud not found. On Termux: bash scripts/termux.sh install" >&2
  exit 1
fi

if [[ ! -f "$SOURCE/Dockerfile" ]]; then
  echo "Missing exporter Dockerfile: $SOURCE" >&2
  exit 1
fi

echo "==> Cloud Run deploy: project=$PROJECT region=$REGION service=$SERVICE"
gcloud run deploy "$SERVICE" \
  --source="$SOURCE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --port=8080

echo "==> Next: firebase deploy --only hosting"

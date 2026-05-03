# Deploy the PDF exporter to Cloud Run as `pdf-exporter` (must match firebase.json Hosting rewrite).
# Prerequisites: gcloud CLI, Docker (or use Cloud Build remote), billing enabled, APIs:
#   run.googleapis.com, cloudbuild.googleapis.com, artifactregistry.googleapis.com
#
# Usage (from repo root):
#   .\scripts\deploy-pdf-exporter.ps1
#   .\scripts\deploy-pdf-exporter.ps1 -ProjectId alysum-web

param(
  [string] $ProjectId = "",
  [string] $Region = "us-central1",
  [string] $Service = "pdf-exporter"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Source = Join-Path $RepoRoot "exporter"

if (-not (Test-Path (Join-Path $Source "Dockerfile"))) {
  throw "Exporter folder not found: $Source"
}

if (-not $ProjectId) {
  $ProjectId = (gcloud config get-value project 2>$null).Trim()
}
if (-not $ProjectId) {
  throw "No GCP project. Run: gcloud config set project YOUR_PROJECT_ID or pass -ProjectId."
}

Write-Host "Project: $ProjectId  Region: $Region  Service: $Service  Source: $Source"

gcloud run deploy $Service `
  --source="$Source" `
  --region=$Region `
  --project=$ProjectId `
  --allow-unauthenticated `
  --memory=2Gi `
  --cpu=2 `
  --timeout=300 `
  --max-instances=10 `
  --min-instances=0 `
  --port=8080

Write-Host ""
Write-Host "Done. Deploy Hosting so /api/** routes here:"
Write-Host "  firebase deploy --only hosting"

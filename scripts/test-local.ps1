<#
  Local CI mirror — runs the same test phases as .github/workflows/release.yml
  inside Docker containers, so results match GitHub Actions.

  Containers mount the repo but shadow frontend/node_modules with an anonymous
  volume, so the host's (possibly dev-server-locked) esbuild/rollup binaries are
  never touched and `npm ci` runs cleanly.

  Usage:
    pwsh scripts/test-local.ps1            # run all phases
    pwsh scripts/test-local.ps1 backend    # backend tests only
    pwsh scripts/test-local.ps1 frontend   # frontend unit tests only
    pwsh scripts/test-local.ps1 smoke      # playwright smoke tests only
#>
param([string]$Phase = 'all')

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path "$PSScriptRoot\..").Path
$NodeImg = 'node:22'
$PwImg = 'mcr.microsoft.com/playwright:v1.58.2-jammy'

function Run-Backend {
  Write-Host "`n=== Backend tests (Jest) ===" -ForegroundColor Cyan
  docker run --rm -v "${Repo}:/repo" -w /repo/backend $NodeImg sh -c "npm ci && npm test"
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }
}

function Run-Frontend {
  Write-Host "`n=== Frontend unit tests (Vitest) ===" -ForegroundColor Cyan
  docker run --rm -v "${Repo}:/repo" -v "/repo/frontend/node_modules" -w /repo/frontend $NodeImg sh -c "npm ci && npm test"
  if ($LASTEXITCODE -ne 0) { throw "Frontend unit tests failed" }
}

function Run-Smoke {
  Write-Host "`n=== E2E smoke tests (Playwright) ===" -ForegroundColor Cyan
  docker run --rm -v "${Repo}:/repo" -v "/repo/frontend/node_modules" -w /repo/frontend $PwImg sh -c "npm ci && npm run test:smoke"
  if ($LASTEXITCODE -ne 0) { throw "Smoke tests failed" }
}

switch ($Phase.ToLower()) {
  'backend'  { Run-Backend }
  'frontend' { Run-Frontend }
  'smoke'    { Run-Smoke }
  'all'      { Run-Backend; Run-Frontend; Run-Smoke }
  default    { throw "Unknown phase '$Phase'. Use: all | backend | frontend | smoke" }
}

Write-Host "`nAll requested test phases passed." -ForegroundColor Green

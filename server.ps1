param([ValidateRange(1024, 65535)][int]$Port = 8787)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath 'node_modules/wrangler/bin/wrangler.js')) {
    throw '먼저 pnpm install --frozen-lockfile 을 실행하세요. 자세한 내용은 DEPLOY.md를 확인하세요.'
  }
  # Local preview executes the production Worker. There is no second data provider or API implementation.
  & pnpm dev --ip 127.0.0.1 --port $Port
  if ($LASTEXITCODE -ne 0) { throw "로컬 서버 종료 코드: $LASTEXITCODE" }
} finally {
  Pop-Location
}

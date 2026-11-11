$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath 'E:\Astro-Events-JP\repo' -PathType Container)) { throw 'E drive/project unavailable. Stop; no fallback.' }
node "$PSScriptRoot/preflight.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Path policy rejected this workspace' }
$env:TEMP = 'E:\Astro-Events-JP\temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'E:\Astro-Events-JP\cache\npm'
$env:XDG_CACHE_HOME = 'E:\Astro-Events-JP\cache'
$env:XDG_CONFIG_HOME = 'E:\Astro-Events-JP\tools\config'
$env:WRANGLER_LOG_PATH = 'E:\Astro-Events-JP\logs\wrangler.log'
$env:WRANGLER_SEND_METRICS = 'false'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
foreach ($directory in @($env:TEMP, $env:npm_config_cache, $env:XDG_CONFIG_HOME)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
Write-Output 'Project environment configured on E drive for this PowerShell session.'

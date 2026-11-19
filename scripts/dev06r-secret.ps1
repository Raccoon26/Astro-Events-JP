param(
  [ValidateSet('install','preflight','send','poll','status','reconcile','observe')][string]$Mode = 'preflight',
  [ValidatePattern('^([a-f0-9]{64})?$')][string]$Approval = '',
  [ValidateSet('github-web','email')][string]$Channel,
  [ValidateSet('received','not-received')][string]$Outcome,
  [string]$IssueUrl,
  [string]$ObservedAt
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/environment.ps1"
$parent = 'E:\Astro-Events-JP\tools\config'
$destination = Join-Path $parent 'dev06r-secret.dpapi'
if (Test-Path -LiteralPath $destination) {
  if ((Get-Item -LiteralPath $destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked secret storage refused.' }
}
function Get-PrivateInput([string]$Prompt) {
  $value = Read-Host -Prompt $Prompt -AsSecureString
  try { return [System.Net.NetworkCredential]::new('', $value).Password }
  finally { $value.Dispose() }
}
if ($Mode -eq 'install') {
  if (Test-Path -LiteralPath $destination) { throw 'The designated protected file already exists. Preserve the trial ledger if rotating credentials.' }
  $secrets = @{
    botToken = Get-PrivateInput 'Telegram bot token (hidden)'
    botUsername = Read-Host 'Telegram bot username without @'
    chatId = Get-PrivateInput 'Your private chat ID (hidden)'
    userId = Get-PrivateInput 'Your Telegram user ID (hidden)'
    githubToken = Get-PrivateInput 'Fine-grained Reports-only GitHub token (hidden)'
    reportsIssuesWriteAttested = ((Read-Host 'Type REPORTS-ONLY if this token grants Issues:write on Astro-Events-JP-Reports only') -ceq 'REPORTS-ONLY')
    exclusiveBotPolling = ((Read-Host 'Type DEDICATED only if no other consumer uses the bot update queue. Otherwise press Enter') -ceq 'DEDICATED')
  }
  if (!$secrets.reportsIssuesWriteAttested) { throw 'Use the dedicated Reports-only credential.' }
  $secure = ConvertTo-SecureString -String ($secrets | ConvertTo-Json -Compress) -AsPlainText -Force
  try {
    $file = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
    try {
      $writer = [IO.StreamWriter]::new($file)
      try { $writer.Write(($secure | ConvertFrom-SecureString)) } finally { $writer.Dispose() }
    } finally { $file.Dispose() }
  } finally { $secure.Dispose() }
  Write-Output 'Protected trial credentials installed for the current Windows user.'
  exit 0
}
if (!(Test-Path -LiteralPath $destination -PathType Leaf)) { throw 'PROTECTED_TRIAL_SECRET_NOT_INSTALLED' }
if ((Get-Item -LiteralPath $destination).Length -gt 16384) { throw 'PROTECTED_TRIAL_SECRET_INVALID' }
$secure = Get-Content -LiteralPath $destination -Raw | ConvertTo-SecureString
try {
  $env:ASTRO_DEV06R_SECRET = [System.Net.NetworkCredential]::new('', $secure).Password
  $arguments = @('scripts/dev06r.mjs', $Mode)
  if ($Mode -in @('send','poll')) { $arguments += @('--approve', $Approval) }
  if ($Mode -eq 'observe') { $arguments += @($Channel, $Outcome, $IssueUrl, $ObservedAt) }
  node @arguments
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:ASTRO_DEV06R_SECRET -ErrorAction SilentlyContinue
  $secure.Dispose()
}

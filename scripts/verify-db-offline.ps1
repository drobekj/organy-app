$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ComposeFile = Join-Path $RepoRoot "docker-compose.offline-db.yml"
$BackupDir = Join-Path $RepoRoot ".organy-backups"
$PgwebUrl = "http://127.0.0.1:8080"
$NeonVersion = "4.13.0"
$NeonProductionProjectName = "organy-app-production"
$NeonProductionProjectId = "young-voice-36803445"
$NeonCredentialPaths = @(
  (Join-Path $HOME ".config\neon\credentials.json"),
  (Join-Path $HOME ".config\neonctl\credentials.json")
)
$PreviousLocation = Get-Location
$PreviousDatabaseUrl = $env:DATABASE_URL
$PreviousDatabaseUrlUnpooled = $env:DATABASE_URL_UNPOOLED
$databaseUrl = $null
$DedicatedOperatorRoot = Join-Path $env:LOCALAPPDATA "Organy\verify-db"

function Update-DedicatedOperatorCheckout {
  if ($env:ORGANY_VERIFY_DB_SELF_UPDATED -eq "1") {
    return
  }

  $resolvedDedicatedRoot = [IO.Path]::GetFullPath($DedicatedOperatorRoot).TrimEnd('\')
  $resolvedRepoRoot = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
  if (-not $resolvedRepoRoot.Equals($resolvedDedicatedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    return
  }

  Write-Host "0/7 Updating dedicated Verify DB checkout"
  Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "fetch", "origin", "main") -Quiet
  $currentSha = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "rev-parse", "HEAD") -Capture
  $remoteSha = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "rev-parse", "origin/main") -Capture

  if ($currentSha -eq $remoteSha) {
    return
  }

  $dirty = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "status", "--porcelain") -Capture
  if ($dirty) {
    throw "Dedicated Verify DB checkout contains unexpected local changes. Remove or review them before continuing."
  }

  Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "checkout", "--detach", $remoteSha) -Quiet
  Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "reset", "--hard", $remoteSha) -Quiet

  $env:ORGANY_VERIFY_DB_SELF_UPDATED = "1"
  Write-Host "Verify DB checkout updated; restarting with current main."
  & npm.cmd run db:verify:offline
  exit $LASTEXITCODE
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Quiet,
    [switch]$Capture
  )

  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $oldPreference
  }

  if ($exitCode -ne 0) {
    throw "$FilePath failed with exit code $exitCode."
  }

  if ($Capture) {
    return ($output | Out-String).Trim()
  }

  if (-not $Quiet) {
    $output | ForEach-Object { Write-Host $_ }
  }
}

function Ensure-NeonCliAuthentication {
  $apiKey = if ($null -eq $env:NEON_API_KEY) { "" } else { $env:NEON_API_KEY.Trim() }
  $hasStoredCredentials = $NeonCredentialPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($apiKey -or $hasStoredCredentials) {
    return
  }

  Write-Host "Neon CLI authorization is required once on this computer."
  Write-Host "A browser window will open. Approve the Neon CLI connection, then return here."
  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & npx.cmd --yes "neon@$NeonVersion" auth
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $oldPreference
  }

  if ($exitCode -ne 0) {
    throw "Neon CLI authorization failed."
  }

  $hasStoredCredentials = $NeonCredentialPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $hasStoredCredentials) {
    throw "Neon CLI authorization completed without creating a credential file in either the current or legacy config directory."
  }
}

function Invoke-NeonCli {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & npx.cmd --yes "neon@$NeonVersion" @Arguments 2>$null
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $oldPreference
  }

  if ($exitCode -ne 0) {
    throw "Neon CLI command failed after authentication."
  }

  return ($output | Out-String).Trim()
}

function Test-DockerEngine {
  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & docker info --format "{{.ServerVersion}}" *> $null
    return $LASTEXITCODE -eq 0
  }
  catch {
    return $false
  }
  finally {
    $ErrorActionPreference = $oldPreference
  }
}

function Ensure-DockerEngine {
  if (Test-DockerEngine) {
    return
  }

  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path -LiteralPath $dockerDesktop)) {
    throw "Docker Desktop is required. Install Docker Desktop, then run this command again."
  }

  Write-Host "Starting Docker Desktop..."
  Start-Process -FilePath $dockerDesktop | Out-Null

  for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
    if (Test-DockerEngine) {
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "Docker Desktop started but its engine did not become ready. Open Docker Desktop, resolve the reported problem, then run this command again."
}

function Get-PostgresUrlMatch {
  param([Parameter(Mandatory = $true)][string]$Value)

  $match = [regex]::Match(
    $Value,
    '^(?i:postgres(?:ql)?)://(?:[^@/?#]+@)?(?<host>\[[^\]]+\]|[^:/?#]+)(?::\d+)?(?:[/?#]|$)'
  )

  if (-not $match.Success) {
    throw "Production database source is not a valid PostgreSQL URL."
  }

  return $match
}

function Assert-RemoteProductionDatabase {
  param([Parameter(Mandatory = $true)][string]$Value)

  $match = Get-PostgresUrlMatch -Value $Value
  $hostName = $match.Groups["host"].Value.Trim('[', ']').ToLowerInvariant()
  if (-not $hostName) {
    throw "Production database source does not contain a database host."
  }

  if ($hostName -in @("localhost", "127.0.0.1", "::1")) {
    throw "Production database source unexpectedly points to a local database; refusing to continue."
  }
}

function Resolve-ProductionBackupDatabaseUrl {
  $directUrl = if ($null -eq $env:DATABASE_URL_UNPOOLED) { "" } else { $env:DATABASE_URL_UNPOOLED.Trim() }
  if ($directUrl) {
    Assert-RemoteProductionDatabase -Value $directUrl
    return $directUrl
  }

  $runtimeUrl = if ($null -eq $env:DATABASE_URL) { "" } else { $env:DATABASE_URL.Trim() }
  if (-not $runtimeUrl) {
    return Resolve-NeonProductionBackupDatabaseUrl
  }

  Assert-RemoteProductionDatabase -Value $runtimeUrl

  $match = Get-PostgresUrlMatch -Value $runtimeUrl
  $hostGroup = $match.Groups["host"]
  $rawHost = $hostGroup.Value
  $hostName = $rawHost.Trim('[', ']')
  $normalizedHost = $hostName.ToLowerInvariant()

  if ($normalizedHost.Contains("-pooler")) {
    if (-not $normalizedHost.EndsWith(".neon.tech")) {
      throw "Production DATABASE_URL appears pooled, but its host is not a Neon endpoint; refusing to derive a direct backup URL."
    }

    $directHost = [regex]::Replace($rawHost, '-pooler(?=\.)', '', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($directHost -eq $rawHost) {
      throw "Production Neon pooled endpoint could not be converted to a direct endpoint."
    }

    $runtimeUrl = $runtimeUrl.Substring(0, $hostGroup.Index) + $directHost + $runtimeUrl.Substring($hostGroup.Index + $hostGroup.Length)
  }

  Assert-RemoteProductionDatabase -Value $runtimeUrl
  return $runtimeUrl
}

function Resolve-NeonProductionBackupDatabaseUrl {
  Write-Host "Resolving direct Production database connection through authenticated Neon CLI..."
  Ensure-NeonCliAuthentication

  $projectJson = Invoke-NeonCli -Arguments @(
    "projects",
    "get",
    $NeonProductionProjectId,
    "--output",
    "json",
    "--no-analytics"
  )

  try {
    $project = $projectJson | ConvertFrom-Json
  }
  catch {
    throw "Neon CLI project verification returned invalid JSON."
  }

  $projectRecord = if ($project.PSObject.Properties.Name -contains "project") { $project.project } else { $project }
  if ([string]$projectRecord.id -ne $NeonProductionProjectId -or [string]$projectRecord.name -ne $NeonProductionProjectName) {
    throw "Neon CLI project identity does not match the reviewed Production project; refusing to continue."
  }

  $directUrl = Invoke-NeonCli -Arguments @(
    "connection-string",
    "--project-id",
    $NeonProductionProjectId,
    "--no-analytics"
  )

  $directUrl = $directUrl.Trim()
  Assert-RemoteProductionDatabase -Value $directUrl

  $match = Get-PostgresUrlMatch -Value $directUrl
  $hostName = $match.Groups["host"].Value.Trim('[', ']').ToLowerInvariant()
  if (-not $hostName.EndsWith(".neon.tech")) {
    throw "Neon CLI returned a non-Neon PostgreSQL host; refusing to continue."
  }
  if ($hostName.Contains("-pooler")) {
    throw "Neon CLI returned a pooled endpoint; Verify DB requires the direct Production connection."
  }

  return $directUrl
}

function Wait-ForOfflinePostgres {
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    $status = ""
    try {
      $status = Invoke-Native -FilePath "docker" -Arguments @("inspect", "--format", "{{.State.Health.Status}}", "organy-offline-postgres") -Capture
    }
    catch {
      $status = ""
    }

    if ($status -eq "healthy") {
      return
    }
    if ($status -eq "unhealthy") {
      throw "The disposable offline PostgreSQL container became unhealthy."
    }
    Start-Sleep -Seconds 1
  }

  throw "The disposable offline PostgreSQL container did not become healthy."
}

function Wait-ForPgweb {
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    $status = ""
    try {
      $status = Invoke-Native -FilePath "docker" -Arguments @("inspect", "--format", "{{.State.Health.Status}}", "organy-offline-pgweb") -Capture
    }
    catch {
      $status = ""
    }

    if ($status -eq "healthy") {
      return
    }
    if ($status -eq "unhealthy") {
      throw "The local Pgweb SQL editor became unhealthy."
    }
    Start-Sleep -Seconds 1
  }

  throw "The local Pgweb SQL editor did not become healthy."
}

try {
  Set-Location $RepoRoot
  Update-DedicatedOperatorCheckout

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

  Write-Host "Verify DB offline workspace"
  Write-Host "1/7 Docker preflight"
  Ensure-DockerEngine

  Write-Host "2/7 Resolving Production database configuration"
  $databaseUrl = Resolve-ProductionBackupDatabaseUrl
  $env:DATABASE_URL = $databaseUrl

  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $backupFileName = "organy-production-$stamp.dump"
  $backupPath = Join-Path $BackupDir $backupFileName
  $manifestPath = "$backupPath.sha256"
  if ((Test-Path -LiteralPath $backupPath) -or (Test-Path -LiteralPath $manifestPath)) {
    throw "The selected backup artifact path already exists; refusing to overwrite it."
  }

  Write-Host "3/7 Creating complete Production backup"
  $dumpCommand = "pg_dump --format=custom --no-owner --no-privileges --no-password --file '/backups/$backupFileName' --dbname=" + '"' + '$DATABASE_URL' + '"'
  Invoke-Native -FilePath "docker" -Arguments @(
    "run", "--rm",
    "--env", "DATABASE_URL",
    "--mount", "type=bind,source=$BackupDir,target=/backups",
    "postgres:16-alpine",
    "sh", "-lc", $dumpCommand
  ) -Quiet

  $databaseUrl = $null

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($manifestPath, "$hash  $backupFileName" + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $verifiedHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($verifiedHash -ne $hash) {
    throw "Backup integrity verification failed."
  }

  Write-Host "4/7 Resetting disposable offline database"
  Invoke-Native -FilePath "docker" -Arguments @("compose", "-f", $ComposeFile, "down", "-v", "--remove-orphans") -Quiet
  Invoke-Native -FilePath "docker" -Arguments @("compose", "-f", $ComposeFile, "up", "-d", "offline-postgres") -Quiet
  Wait-ForOfflinePostgres

  Write-Host "5/7 Restoring backup into offline PostgreSQL"
  Invoke-Native -FilePath "docker" -Arguments @(
    "compose", "-f", $ComposeFile, "exec", "-T", "offline-postgres",
    "pg_restore",
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    "-U", "organy_offline",
    "-d", "organy_offline",
    "/backups/$backupFileName"
  ) -Quiet

  Write-Host "6/7 Revoking restored sessions and checking recovery"
  Invoke-Native -FilePath "docker" -Arguments @(
    "compose", "-f", $ComposeFile, "exec", "-T", "offline-postgres",
    "psql",
    "-v", "ON_ERROR_STOP=1",
    "-U", "organy_offline",
    "-d", "organy_offline",
    "-c", "delete from auth_sessions;"
  ) -Quiet

  $recoverySql = @"
select
  (select count(*)::int from service_contexts),
  (select count(*)::int from reference_catalog_songs),
  (select count(*)::int from auth_users),
  (select count(*)::int from protected_account_actor_links),
  (select count(*)::int from app_user_roles),
  (select count(*)::int from auth_sessions);
"@
  $recoverySummary = Invoke-Native -FilePath "docker" -Arguments @(
    "compose", "-f", $ComposeFile, "exec", "-T", "offline-postgres",
    "psql",
    "-v", "ON_ERROR_STOP=1",
    "-A", "-t",
    "-F", "|",
    "-U", "organy_offline",
    "-d", "organy_offline",
    "-c", $recoverySql
  ) -Capture

  $recoveryParts = $recoverySummary.Trim() -split '\|'
  if ($recoveryParts.Count -ne 6) {
    throw "Offline recovery check returned an unexpected result."
  }

  $authSessions = [int]$recoveryParts[5]
  if ($authSessions -ne 0) {
    throw "Restore target still contains protected sessions; recovery must not be accepted."
  }

  Write-Host "PostgreSQL recovery read-only check: PASS"
  Write-Host "Service contexts: $($recoveryParts[0])"
  Write-Host "Reference catalog songs: $($recoveryParts[1])"
  Write-Host "Protected auth users: $($recoveryParts[2])"
  Write-Host "Protected Account/Actor links: $($recoveryParts[3])"
  Write-Host "Authoritative role rows: $($recoveryParts[4])"
  Write-Host "Protected sessions: 0"

  Write-Host "7/7 Starting and opening offline SQL editor"
  Invoke-Native -FilePath "docker" -Arguments @("compose", "-f", $ComposeFile, "up", "-d", "pgweb") -Quiet
  Wait-ForPgweb
  Start-Process $PgwebUrl | Out-Null

  Write-Host ""
  Write-Host "Verify DB offline workspace: READY"
  Write-Host "Backup artifact: $backupPath"
  Write-Host "Integrity manifest: $manifestPath"
  Write-Host "Offline database: organy_offline on 127.0.0.1:5433"
  Write-Host "SQL editor: $PgwebUrl"
  Write-Host "Production database credentials remained process-local and were not written to temporary env files."
}
finally {
  $databaseUrl = $null

  if ($null -eq $PreviousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $PreviousDatabaseUrl }

  if ($null -eq $PreviousDatabaseUrlUnpooled) { Remove-Item Env:DATABASE_URL_UNPOOLED -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL_UNPOOLED = $PreviousDatabaseUrlUnpooled }

  Set-Location $PreviousLocation
}

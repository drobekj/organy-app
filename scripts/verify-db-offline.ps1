param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ComposeFile = Join-Path $RepoRoot "docker-compose.offline-db.yml"
$BackupDir = Join-Path $RepoRoot ".organy-backups"
$OfflineDatabaseUrl = "postgres://organy_offline:organy_offline@127.0.0.1:5433/organy_offline"
$AdminerUrl = "http://127.0.0.1:8080"
$VercelOrgId = "team_axmKyou7kosjiNPHFNaLa86k"
$VercelProjectId = "prj_HaAJloeBq90EcFrMOVVC3kTiJxc0"
$VercelVersion = "59.10.0"
$RunId = [guid]::NewGuid().ToString("N")
$TempVercelEnv = Join-Path ([IO.Path]::GetTempPath()) "organy-production-$RunId.env"
$TempDatabaseEnv = Join-Path ([IO.Path]::GetTempPath()) "organy-production-db-$RunId.env"
$PreviousLocation = Get-Location
$PreviousVercelOrgId = $env:VERCEL_ORG_ID
$PreviousVercelProjectId = $env:VERCEL_PROJECT_ID
$PreviousRestoreUrl = $env:ORGANY_RESTORE_DATABASE_URL
$databaseUrl = $null

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

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $prefix = "$Name="
  $line = Get-Content -LiteralPath $Path | Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) } | Select-Object -Last 1
  if (-not $line) {
    throw "$Name was not found in the pulled Production environment."
  }

  $value = $line.Substring($prefix.Length).Trim()
  if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
    $value = $value.Replace('\"', '"').Replace('\\', '\')
  }

  if (-not $value) {
    throw "$Name is empty in the pulled Production environment."
  }

  return $value
}

function Assert-RemoteProductionDatabase {
  param([Parameter(Mandatory = $true)][string]$Value)

  try {
    $uri = [Uri]$Value
  }
  catch {
    throw "Production DATABASE_URL is not a valid PostgreSQL URL."
  }

  if ($uri.Scheme -notin @("postgres", "postgresql")) {
    throw "Production DATABASE_URL is not PostgreSQL."
  }

  $hostName = $uri.Host.ToLowerInvariant()
  if ($hostName -in @("localhost", "127.0.0.1", "::1")) {
    throw "Production DATABASE_URL unexpectedly points to a local database; refusing to continue."
  }
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

try {
  Set-Location $RepoRoot
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

  Write-Host "Verify DB offline workspace"
  Write-Host "1/7 Docker preflight"
  Ensure-DockerEngine

  Write-Host "2/7 Reading Production database configuration"
  $env:VERCEL_ORG_ID = $VercelOrgId
  $env:VERCEL_PROJECT_ID = $VercelProjectId
  Invoke-Native -FilePath "npx.cmd" -Arguments @("--yes", "vercel@$VercelVersion", "env", "pull", $TempVercelEnv, "--environment=production", "--yes") -Quiet
  $databaseUrl = Read-DotEnvValue -Path $TempVercelEnv -Name "DATABASE_URL"
  Assert-RemoteProductionDatabase -Value $databaseUrl
  [IO.File]::WriteAllText($TempDatabaseEnv, "DATABASE_URL=$databaseUrl" + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

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
    "--env-file", $TempDatabaseEnv,
    "--mount", "type=bind,source=$BackupDir,target=/backups",
    "postgres:16-alpine",
    "sh", "-lc", $dumpCommand
  ) -Quiet

  Remove-Item -LiteralPath $TempDatabaseEnv -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TempVercelEnv -Force -ErrorAction SilentlyContinue
  $databaseUrl = $null

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($manifestPath, "$hash  $backupFileName" + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $verifiedHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($verifiedHash -ne $hash) {
    throw "Backup integrity verification failed."
  }

  Write-Host "4/7 Resetting disposable offline database"
  Invoke-Native -FilePath "docker" -Arguments @("compose", "-f", $ComposeFile, "down", "-v", "--remove-orphans") -Quiet
  Invoke-Native -FilePath "docker" -Arguments @("compose", "-f", $ComposeFile, "up", "-d", "offline-postgres", "adminer") -Quiet
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

  $env:ORGANY_RESTORE_DATABASE_URL = $OfflineDatabaseUrl
  Invoke-Native -FilePath "npx.cmd" -Arguments @("tsx", "scripts/postgres-recovery-check.ts")

  Write-Host "7/7 Opening offline SQL editor"
  Start-Process $AdminerUrl | Out-Null

  Write-Host ""
  Write-Host "Verify DB offline workspace: READY"
  Write-Host "Backup artifact: $backupPath"
  Write-Host "Integrity manifest: $manifestPath"
  Write-Host "Offline database: organy_offline on 127.0.0.1:5433"
  Write-Host "SQL editor: $AdminerUrl"
  Write-Host "Production credentials were removed from temporary files."
}
finally {
  Remove-Item -LiteralPath $TempDatabaseEnv -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TempVercelEnv -Force -ErrorAction SilentlyContinue
  $databaseUrl = $null

  if ($null -eq $PreviousVercelOrgId) { Remove-Item Env:VERCEL_ORG_ID -ErrorAction SilentlyContinue }
  else { $env:VERCEL_ORG_ID = $PreviousVercelOrgId }

  if ($null -eq $PreviousVercelProjectId) { Remove-Item Env:VERCEL_PROJECT_ID -ErrorAction SilentlyContinue }
  else { $env:VERCEL_PROJECT_ID = $PreviousVercelProjectId }

  if ($null -eq $PreviousRestoreUrl) { Remove-Item Env:ORGANY_RESTORE_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:ORGANY_RESTORE_DATABASE_URL = $PreviousRestoreUrl }

  Set-Location $PreviousLocation
}

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const WINDOWS_UPDATE_ENV = Object.freeze({
  oldProcessId: "DAYTRACE_WIN_UPDATE_OLD_PID",
  installerPath: "DAYTRACE_WIN_UPDATE_INSTALLER",
  tarPath: "DAYTRACE_WIN_UPDATE_TAR",
  targetExecutable: "DAYTRACE_WIN_UPDATE_TARGET_EXE",
  installDirectory: "DAYTRACE_WIN_UPDATE_INSTALL_DIR",
  backupDirectory: "DAYTRACE_WIN_UPDATE_BACKUP_DIR",
  failedDirectory: "DAYTRACE_WIN_UPDATE_FAILED_DIR",
  stagingDirectory: "DAYTRACE_WIN_UPDATE_STAGING_DIR",
  updateRoot: "DAYTRACE_WIN_UPDATE_ROOT",
  workDirectory: "DAYTRACE_WIN_UPDATE_WORK_DIR",
  preparedFile: "DAYTRACE_WIN_UPDATE_PREPARED_FILE",
  proceedFile: "DAYTRACE_WIN_UPDATE_PROCEED_FILE",
  readyFile: "DAYTRACE_UPDATE_READY_FILE",
  readyToken: "DAYTRACE_UPDATE_READY_TOKEN",
  expectedVersion: "DAYTRACE_WIN_UPDATE_EXPECTED_VERSION",
  logFile: "DAYTRACE_WIN_UPDATE_LOG_FILE",
  readinessTimeout: "DAYTRACE_WIN_UPDATE_READY_TIMEOUT_MS",
});

const WINDOWS_UPDATE_SCRIPT = String.raw`$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-RequiredEnvironment([string]$Name) {
  $value = [System.Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) { throw "missing-environment-$Name" }
  return $value
}

function Normalize-UpdatePath([string]$Value) {
  return [System.IO.Path]::GetFullPath($Value).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Test-SamePath([string]$Left, [string]$Right) {
  return [System.StringComparer]::OrdinalIgnoreCase.Equals((Normalize-UpdatePath $Left), (Normalize-UpdatePath $Right))
}

$oldProcessId = [int](Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_OLD_PID")
$installerPath = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_INSTALLER")
$tarPath = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_TAR")
$targetExecutable = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_TARGET_EXE")
$installDirectory = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_INSTALL_DIR")
$backupDirectory = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_BACKUP_DIR")
$failedDirectory = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_FAILED_DIR")
$stagingDirectory = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_STAGING_DIR")
$updateRoot = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_ROOT")
$workDirectory = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_WORK_DIR")
$preparedFile = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_PREPARED_FILE")
$proceedFile = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_PROCEED_FILE")
$readyFile = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_UPDATE_READY_FILE")
$readyToken = Get-RequiredEnvironment "DAYTRACE_UPDATE_READY_TOKEN"
$expectedVersion = Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_EXPECTED_VERSION"
$logFile = Normalize-UpdatePath (Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_LOG_FILE")
$readinessTimeout = [int](Get-RequiredEnvironment "DAYTRACE_WIN_UPDATE_READY_TIMEOUT_MS")

function Write-UpdateLog([string]$Message) {
  try {
    $logDirectory = [System.IO.Path]::GetDirectoryName($logFile)
    [System.IO.Directory]::CreateDirectory($logDirectory) | Out-Null
    if ([System.IO.File]::Exists($logFile) -and ([System.IO.FileInfo]$logFile).Length -gt 1048576) {
      $rotated = "$logFile.1"
      if ([System.IO.File]::Exists($rotated)) { [System.IO.File]::Delete($rotated) }
      [System.IO.File]::Move($logFile, $rotated)
    }
    $line = [System.DateTime]::UtcNow.ToString("o") + " " + $Message + [System.Environment]::NewLine
    [System.IO.File]::AppendAllText($logFile, $line, [System.Text.UTF8Encoding]::new($false))
  } catch { }
}

function Remove-UpdateEnvironment([bool]$KeepReady) {
  $names = @(
    "DAYTRACE_WIN_UPDATE_OLD_PID", "DAYTRACE_WIN_UPDATE_INSTALLER", "DAYTRACE_WIN_UPDATE_TAR",
    "DAYTRACE_WIN_UPDATE_TARGET_EXE", "DAYTRACE_WIN_UPDATE_INSTALL_DIR", "DAYTRACE_WIN_UPDATE_BACKUP_DIR",
    "DAYTRACE_WIN_UPDATE_FAILED_DIR", "DAYTRACE_WIN_UPDATE_STAGING_DIR",
    "DAYTRACE_WIN_UPDATE_ROOT", "DAYTRACE_WIN_UPDATE_WORK_DIR", "DAYTRACE_WIN_UPDATE_PREPARED_FILE",
    "DAYTRACE_WIN_UPDATE_PROCEED_FILE", "DAYTRACE_WIN_UPDATE_EXPECTED_VERSION",
    "DAYTRACE_WIN_UPDATE_LOG_FILE", "DAYTRACE_WIN_UPDATE_READY_TIMEOUT_MS"
  )
  if (-not $KeepReady) { $names += @("DAYTRACE_UPDATE_READY_FILE", "DAYTRACE_UPDATE_READY_TOKEN") }
  foreach ($name in $names) { [System.Environment]::SetEnvironmentVariable($name, $null, "Process") }
}

function Stop-TargetProcesses {
  $trackerExecutable = [System.IO.Path]::Combine($installDirectory, "resources", "tracker", "windows", "Daytrace.Tracker.exe")
  $processes = Get-Process -Name @("Daytrace", "Daytrace.Tracker") -ErrorAction SilentlyContinue
  foreach ($candidate in $processes) {
    try {
      if ((Test-SamePath $candidate.Path $targetExecutable) -or (Test-SamePath $candidate.Path $trackerExecutable)) {
        Stop-Process -Id $candidate.Id -Force -ErrorAction SilentlyContinue
      }
    } catch { }
  }
  Start-Sleep -Milliseconds 600
}

function Move-DirectoryWithRetry([string]$Source, [string]$Destination) {
  $lastError = $null
  for ($attempt = 0; $attempt -lt 25; $attempt += 1) {
    try {
      Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds 200
    }
  }
  throw $lastError
}

function Remove-DirectoryBestEffort([string]$Directory) {
  if (-not [System.IO.Directory]::Exists($Directory)) { return }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $Directory -Recurse -Force -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  Write-UpdateLog "cleanup-directory-failed"
}

function Cleanup-HandshakeFiles {
  try { if ([System.IO.File]::Exists($readyFile)) { [System.IO.File]::Delete($readyFile) } } catch { }
  try { if ([System.IO.File]::Exists($preparedFile)) { [System.IO.File]::Delete($preparedFile) } } catch { }
  try { if ([System.IO.File]::Exists($proceedFile)) { [System.IO.File]::Delete($proceedFile) } } catch { }
  try { if ([System.IO.File]::Exists($PSCommandPath)) { [System.IO.File]::Delete($PSCommandPath) } } catch { }
  try { if ([System.IO.Directory]::Exists($workDirectory)) { [System.IO.Directory]::Delete($workDirectory, $false) } } catch { }
  Remove-DirectoryBestEffort $stagingDirectory
}

function Cleanup-UpdateFiles {
  Cleanup-HandshakeFiles
  try { if ([System.IO.File]::Exists($installerPath)) { [System.IO.File]::Delete($installerPath) } } catch { }
}

$pathsValidated = $false
$backupCreated = $false
function Restore-PreviousVersion([string]$Reason) {
  Write-UpdateLog "new-version-not-ready; restoring previous installation; reason=$Reason"
  Remove-UpdateEnvironment $false
  if (-not $backupCreated) {
    Write-UpdateLog "update-aborted-before-backup; original installation was not modified"
    if ($pathsValidated) {
      for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
        if ($null -eq (Get-Process -Id $oldProcessId -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 100
      }
      if ($null -eq (Get-Process -Id $oldProcessId -ErrorAction SilentlyContinue) -and [System.IO.File]::Exists($targetExecutable)) {
        try { Start-Process -FilePath $targetExecutable -ArgumentList @("--update-rollback") -WorkingDirectory $installDirectory | Out-Null } catch { }
      }
      Cleanup-HandshakeFiles
    }
    Write-UpdateLog "original-installation-kept"
    exit 69
  }
  Stop-TargetProcesses
  if ([System.IO.Directory]::Exists($failedDirectory)) { Remove-DirectoryBestEffort $failedDirectory }
  if ([System.IO.Directory]::Exists($installDirectory)) {
    try { Move-DirectoryWithRetry $installDirectory $failedDirectory }
    catch {
      Remove-DirectoryBestEffort $installDirectory
      if ([System.IO.Directory]::Exists($installDirectory)) {
        Write-UpdateLog "rollback-blocked-new-install-locked"
        exit 71
      }
    }
  }
  if ($backupCreated -and [System.IO.Directory]::Exists($backupDirectory)) {
    Move-DirectoryWithRetry $backupDirectory $installDirectory
  }
  if ([System.IO.File]::Exists($targetExecutable)) {
    try { Start-Process -FilePath $targetExecutable -ArgumentList @("--update-rollback") -WorkingDirectory $installDirectory | Out-Null } catch { }
  }
  Remove-DirectoryBestEffort $failedDirectory
  Cleanup-UpdateFiles
  Write-UpdateLog "rollback-complete"
  exit 70
}

try {
  if ($oldProcessId -le 0) { throw "old-process-invalid" }
  if ($readyToken -notmatch "^[a-f0-9]{64}$") { throw "ready-token-invalid" }
  if ($expectedVersion -notmatch "^\d+\.\d+\.\d+$") { throw "expected-version-invalid" }
  if ($readinessTimeout -lt 1000 -or $readinessTimeout -gt 120000) { throw "readiness-timeout-invalid" }
  if (-not (Test-SamePath ([System.IO.Path]::GetDirectoryName($targetExecutable)) $installDirectory)) { throw "target-directory-invalid" }
  if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFileName($targetExecutable), "Daytrace.exe")) { throw "target-name-invalid" }
  if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFileName($tarPath), "tar.exe")) { throw "tar-name-invalid" }
  if (-not [System.IO.File]::Exists($tarPath)) { throw "tar-missing" }
  if (-not (Test-SamePath ([System.IO.Path]::GetDirectoryName($workDirectory)) $updateRoot)) { throw "work-directory-invalid" }
  if (-not [System.IO.Path]::GetFileName($workDirectory).StartsWith("daytrace-win-update-", [System.StringComparison]::OrdinalIgnoreCase)) { throw "work-directory-name-invalid" }
  if (-not (Test-SamePath $preparedFile ([System.IO.Path]::Combine($workDirectory, "helper-prepared")))) { throw "prepared-file-invalid" }
  if (-not (Test-SamePath $proceedFile ([System.IO.Path]::Combine($workDirectory, "parent-proceed")))) { throw "proceed-file-invalid" }
  if (-not (Test-SamePath $readyFile ([System.IO.Path]::Combine($workDirectory, "new-app-ready")))) { throw "ready-file-invalid" }
  if (-not (Test-SamePath ([System.IO.Path]::GetDirectoryName($installerPath)) $updateRoot)) { throw "installer-directory-invalid" }
  if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFileName($installerPath), "Daytrace-Setup-$expectedVersion-x64.exe")) { throw "installer-name-invalid" }
  if (-not [System.IO.File]::Exists($installerPath)) { throw "installer-missing" }
  if (-not [System.IO.File]::Exists($targetExecutable)) { throw "current-executable-missing" }
  $installParent = [System.IO.Path]::GetDirectoryName($installDirectory)
  $installLeaf = [System.IO.Path]::GetFileName($installDirectory)
  $tokenPrefix = $readyToken.Substring(0, 12)
  if (-not (Test-SamePath $backupDirectory ([System.IO.Path]::Combine($installParent, "$installLeaf.daytrace-update-backup-$tokenPrefix")))) { throw "backup-directory-invalid" }
  if (-not (Test-SamePath $failedDirectory ([System.IO.Path]::Combine($installParent, "$installLeaf.daytrace-update-failed-$tokenPrefix")))) { throw "failed-directory-invalid" }
  if (-not (Test-SamePath $stagingDirectory ([System.IO.Path]::Combine($installParent, "$installLeaf.daytrace-update-staging-$tokenPrefix")))) { throw "staging-directory-invalid" }
  if ([System.IO.Directory]::Exists($backupDirectory) -or [System.IO.Directory]::Exists($failedDirectory) -or [System.IO.Directory]::Exists($stagingDirectory)) { throw "transaction-directory-exists" }
  $pathsValidated = $true

  $oldProcess = Get-Process -Id $oldProcessId -ErrorAction SilentlyContinue
  if ($null -ne $oldProcess) {
    try { if (-not (Test-SamePath $oldProcess.Path $targetExecutable)) { throw "old-process-path-invalid" } }
    catch { throw "old-process-path-invalid" }
  }

  $installedFiles = @(Get-ChildItem -LiteralPath $installDirectory -Force -Recurse -File)
  $installedBytes = [long](($installedFiles | Measure-Object -Property Length -Sum).Sum)
  $driveRoot = [System.IO.Path]::GetPathRoot($installParent)
  $availableBytes = ([System.IO.DriveInfo]::new($driveRoot)).AvailableFreeSpace
  $requiredBytes = [System.Math]::Max($installedBytes + 134217728, 536870912)
  if ($availableBytes -lt $requiredBytes) { throw "insufficient-disk-space" }

  $archiveEntries = @(& $tarPath -tf $installerPath)
  if ($LASTEXITCODE -ne 0 -or $archiveEntries.Count -eq 0) { throw "installer-listing-$LASTEXITCODE" }
  foreach ($archiveEntryValue in $archiveEntries) {
    $archiveEntry = ([string]$archiveEntryValue).Replace("\", "/")
    $archiveSegments = @($archiveEntry.Split("/"))
    if ([string]::IsNullOrWhiteSpace($archiveEntry) -or $archiveEntry.StartsWith("/") -or $archiveEntry.Contains(":") -or $archiveSegments.Contains("..")) {
      throw "installer-entry-invalid"
    }
  }

  [System.IO.Directory]::CreateDirectory($stagingDirectory) | Out-Null
  & $tarPath -xf $installerPath -C $stagingDirectory
  if ($LASTEXITCODE -ne 0) { throw "installer-extraction-$LASTEXITCODE" }
  $stagedExecutable = [System.IO.Path]::Combine($stagingDirectory, "Daytrace.exe")
  $stagedAppArchive = [System.IO.Path]::Combine($stagingDirectory, "resources", "app.asar")
  if (-not [System.IO.File]::Exists($stagedExecutable) -or -not [System.IO.File]::Exists($stagedAppArchive)) { throw "staged-application-incomplete" }
  $stagedFiles = @(Get-ChildItem -LiteralPath $stagingDirectory -Force -Recurse -File)
  $stagedBytes = [long](($stagedFiles | Measure-Object -Property Length -Sum).Sum)
  if ($stagedFiles.Count -gt 10000 -or $stagedBytes -gt 1073741824) { throw "staged-application-too-large" }
  $reparsePoint = Get-ChildItem -LiteralPath $stagingDirectory -Force -Recurse | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } | Select-Object -First 1
  if ($null -ne $reparsePoint) { throw "staged-application-reparse-point" }
  $productVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($stagedExecutable).ProductVersion
  $expectedPattern = "^" + [System.Text.RegularExpressions.Regex]::Escape($expectedVersion) + "(?:\.0)?$"
  if ($productVersion -notmatch $expectedPattern) { throw "new-version-mismatch" }
  foreach ($maintenanceName in @("Uninstall Daytrace.exe", "uninstallerIcon.ico")) {
    $maintenanceSource = [System.IO.Path]::Combine($installDirectory, $maintenanceName)
    $maintenanceTarget = [System.IO.Path]::Combine($stagingDirectory, $maintenanceName)
    if ([System.IO.File]::Exists($maintenanceSource)) { [System.IO.File]::Copy($maintenanceSource, $maintenanceTarget, $true) }
  }

  if ([System.IO.File]::Exists($preparedFile) -or [System.IO.File]::Exists($proceedFile)) { throw "helper-handshake-file-exists" }
  [System.IO.File]::WriteAllText($preparedFile, $readyToken, [System.Text.UTF8Encoding]::new($false))
  $authorized = $false
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    if ([System.IO.File]::Exists($proceedFile)) {
      try {
        if ([System.StringComparer]::Ordinal.Equals([System.IO.File]::ReadAllText($proceedFile).Trim(), $readyToken)) { $authorized = $true; break }
      } catch { }
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not $authorized) { throw "parent-authorization-timeout" }

  Write-UpdateLog "update-helper-authorized"
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
    if ($null -eq (Get-Process -Id $oldProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 200
  }
  if ($null -ne (Get-Process -Id $oldProcessId -ErrorAction SilentlyContinue)) {
    Write-UpdateLog "old-version-did-not-exit"
    throw "old-version-did-not-exit"
  }

  Stop-TargetProcesses
  Move-DirectoryWithRetry $installDirectory $backupDirectory
  $backupCreated = $true
  Write-UpdateLog "previous-installation-backed-up"
  Move-DirectoryWithRetry $stagingDirectory $installDirectory
  if (-not [System.IO.File]::Exists($targetExecutable)) { throw "new-executable-missing" }

  Remove-UpdateEnvironment $false
  [System.Environment]::SetEnvironmentVariable("DAYTRACE_UPDATE_READY_FILE", $readyFile, "Process")
  [System.Environment]::SetEnvironmentVariable("DAYTRACE_UPDATE_READY_TOKEN", $readyToken, "Process")
  $newProcess = Start-Process -FilePath $targetExecutable -ArgumentList @("--updated") -WorkingDirectory $installDirectory -PassThru
  $deadline = [System.DateTime]::UtcNow.AddMilliseconds($readinessTimeout)
  $ready = $false
  while ([System.DateTime]::UtcNow -lt $deadline) {
    if ([System.IO.File]::Exists($readyFile)) {
      try {
        if ([System.StringComparer]::Ordinal.Equals([System.IO.File]::ReadAllText($readyFile).Trim(), $readyToken)) { $ready = $true; break }
      } catch { }
    }
    if ($newProcess.HasExited) { break }
    Start-Sleep -Milliseconds 200
    $newProcess.Refresh()
  }
  if (-not $ready) { throw "new-version-not-ready" }
  Start-Sleep -Seconds 2
  $newProcess.Refresh()
  if ($newProcess.HasExited) { throw "new-version-exited-after-ready" }

  Remove-UpdateEnvironment $false
  Write-UpdateLog "new-version-ready"
  Remove-DirectoryBestEffort $backupDirectory
  Cleanup-UpdateFiles
  exit 0
} catch {
  Restore-PreviousVersion $_.Exception.Message
}
`;

function canonicalWindowsExecutable(executablePath, fileSystem = fs) {
  const value = String(executablePath || "").trim();
  if (!path.win32.isAbsolute(value) || path.win32.basename(value).toLowerCase() !== "daytrace.exe") return "";
  try {
    const real = fileSystem.realpathSync(value);
    if (path.win32.basename(real).toLowerCase() !== "daytrace.exe") return "";
    const directory = path.win32.dirname(real);
    if (!directory || directory === path.win32.parse(directory).root) return "";
    return path.win32.normalize(real);
  } catch {
    return "";
  }
}

function getWindowsUpdateReadyRequest({ environment = process.env, updateDir, fileSystem = fs } = {}) {
  const readyFile = String(environment?.[WINDOWS_UPDATE_ENV.readyFile] || "");
  const token = String(environment?.[WINDOWS_UPDATE_ENV.readyToken] || "");
  if (!/^[a-f0-9]{64}$/.test(token) || path.basename(readyFile).toLowerCase() !== "new-app-ready") return null;
  try {
    const realUpdateDir = fileSystem.realpathSync(updateDir);
    const realWorkDir = fileSystem.realpathSync(path.dirname(readyFile));
    if (path.dirname(realWorkDir) !== realUpdateDir || !path.basename(realWorkDir).startsWith("daytrace-win-update-")) return null;
    return { readyFile: path.join(realWorkDir, "new-app-ready"), token };
  } catch {
    return null;
  }
}

function confirmWindowsUpdateReady(request, fileSystem = fs) {
  if (!request?.readyFile || !/^[a-f0-9]{64}$/.test(String(request.token || ""))) throw new Error("windows-update-ready-request-invalid");
  fileSystem.writeFileSync(request.readyFile, request.token, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

async function launchDetached(command, args, options = {}) {
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: "ignore", env: options.env || process.env });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  return child;
}

async function waitForExactToken(filePath, token, timeoutMs, fileSystem = fs, childProcess = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fileSystem.readFileSync(filePath, "utf8").trim() === token) return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (childProcess && (childProcess.exitCode !== null || childProcess.signalCode !== null)) throw new Error("windows-update-helper-exited-before-preparation");
    await delay(50);
  }
  throw new Error("windows-update-helper-not-prepared");
}

function defaultPowerShellPath(environment = process.env, fileSystem = fs) {
  const systemRoot = String(environment.SystemRoot || environment.WINDIR || "");
  if (!systemRoot) return "";
  const candidate = path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return fileSystem.existsSync(candidate) ? candidate : "";
}

function defaultWindowsTarPath(environment = process.env, fileSystem = fs) {
  const systemRoot = String(environment.SystemRoot || environment.WINDIR || "");
  if (!systemRoot) return "";
  const candidate = path.win32.join(systemRoot, "System32", "tar.exe");
  return fileSystem.existsSync(candidate) ? candidate : "";
}

async function prepareWindowsUpdate({
  installerPath,
  currentExecutable,
  expectedVersion,
  tempDir,
  logFile,
  pid = process.pid,
  platform = process.platform,
  readinessTimeoutMs = 90_000,
  preparationTimeoutMs = 120_000,
  fileSystem = fs,
  tokenFactory = () => randomBytes(32).toString("hex"),
  detach = launchDetached,
  environment = process.env,
  powershellPath = defaultPowerShellPath(environment, fileSystem),
  tarPath = defaultWindowsTarPath(environment, fileSystem),
  assertWritable = (directory) => fileSystem.accessSync(directory, fileSystem.constants.W_OK),
}) {
  if (platform !== "win32") throw new Error("windows-update-platform-invalid");
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("windows-update-process-invalid");
  const targetExecutable = canonicalWindowsExecutable(currentExecutable, fileSystem);
  if (!targetExecutable) throw new Error("windows-update-current-executable-invalid");
  if (!/^\d+\.\d+\.\d+$/.test(String(expectedVersion || ""))) throw new Error("windows-update-version-invalid");
  if (!Number.isInteger(readinessTimeoutMs) || readinessTimeoutMs < 1_000 || readinessTimeoutMs > 120_000) throw new Error("windows-update-timeout-invalid");
  if (!Number.isInteger(preparationTimeoutMs) || preparationTimeoutMs < 1_000 || preparationTimeoutMs > 180_000) throw new Error("windows-update-preparation-timeout-invalid");
  if (!powershellPath || !fileSystem.existsSync(powershellPath)) throw new Error("windows-update-powershell-missing");
  if (!tarPath || path.win32.basename(tarPath).toLowerCase() !== "tar.exe" || !fileSystem.existsSync(tarPath)) throw new Error("windows-update-tar-missing");

  let updateRoot;
  let realInstaller;
  try {
    updateRoot = fileSystem.realpathSync(tempDir);
    realInstaller = fileSystem.realpathSync(installerPath);
  } catch {
    throw new Error("windows-update-installer-missing");
  }
  const expectedInstallerName = `Daytrace-Setup-${expectedVersion}-x64.exe`;
  if (path.dirname(realInstaller) !== updateRoot || path.basename(realInstaller) !== expectedInstallerName) throw new Error("windows-update-installer-invalid");

  const installDirectory = path.win32.dirname(targetExecutable);
  const installParent = path.win32.dirname(installDirectory);
  assertWritable(installParent);
  const readyToken = tokenFactory();
  if (!/^[a-f0-9]{64}$/.test(String(readyToken || ""))) throw new Error("windows-update-ready-token-invalid");
  const suffix = readyToken.slice(0, 12);
  const installLeaf = path.win32.basename(installDirectory);
  const backupDirectory = path.win32.join(installParent, `${installLeaf}.daytrace-update-backup-${suffix}`);
  const failedDirectory = path.win32.join(installParent, `${installLeaf}.daytrace-update-failed-${suffix}`);
  const stagingDirectory = path.win32.join(installParent, `${installLeaf}.daytrace-update-staging-${suffix}`);
  if (fileSystem.existsSync(backupDirectory) || fileSystem.existsSync(failedDirectory) || fileSystem.existsSync(stagingDirectory)) throw new Error("windows-update-transaction-path-exists");

  const workDirectory = fileSystem.mkdtempSync(path.join(updateRoot, "daytrace-win-update-"));
  const helperPath = path.join(workDirectory, "install-update.ps1");
  const preparedFile = path.join(workDirectory, "helper-prepared");
  const proceedFile = path.join(workDirectory, "parent-proceed");
  const readyFile = path.join(workDirectory, "new-app-ready");
  try {
    fileSystem.writeFileSync(helperPath, WINDOWS_UPDATE_SCRIPT, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const helperEnvironment = {
      ...environment,
      [WINDOWS_UPDATE_ENV.oldProcessId]: String(pid),
      [WINDOWS_UPDATE_ENV.installerPath]: realInstaller,
      [WINDOWS_UPDATE_ENV.tarPath]: fileSystem.realpathSync(tarPath),
      [WINDOWS_UPDATE_ENV.targetExecutable]: targetExecutable,
      [WINDOWS_UPDATE_ENV.installDirectory]: installDirectory,
      [WINDOWS_UPDATE_ENV.backupDirectory]: backupDirectory,
      [WINDOWS_UPDATE_ENV.failedDirectory]: failedDirectory,
      [WINDOWS_UPDATE_ENV.stagingDirectory]: stagingDirectory,
      [WINDOWS_UPDATE_ENV.updateRoot]: updateRoot,
      [WINDOWS_UPDATE_ENV.workDirectory]: workDirectory,
      [WINDOWS_UPDATE_ENV.preparedFile]: preparedFile,
      [WINDOWS_UPDATE_ENV.proceedFile]: proceedFile,
      [WINDOWS_UPDATE_ENV.readyFile]: readyFile,
      [WINDOWS_UPDATE_ENV.readyToken]: readyToken,
      [WINDOWS_UPDATE_ENV.expectedVersion]: String(expectedVersion),
      [WINDOWS_UPDATE_ENV.logFile]: path.resolve(logFile),
      [WINDOWS_UPDATE_ENV.readinessTimeout]: String(readinessTimeoutMs),
    };
    const helperProcess = await detach(powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath], { env: helperEnvironment });
    await waitForExactToken(preparedFile, readyToken, preparationTimeoutMs, fileSystem, helperProcess);
    fileSystem.writeFileSync(proceedFile, readyToken, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { backupDirectory, preparedFile, proceedFile, readyFile, stagingDirectory, targetExecutable, workDirectory };
  } catch (error) {
    fileSystem.rmSync(workDirectory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  WINDOWS_UPDATE_ENV,
  WINDOWS_UPDATE_SCRIPT,
  canonicalWindowsExecutable,
  confirmWindowsUpdateReady,
  defaultPowerShellPath,
  defaultWindowsTarPath,
  getWindowsUpdateReadyRequest,
  prepareWindowsUpdate,
  waitForExactToken,
};

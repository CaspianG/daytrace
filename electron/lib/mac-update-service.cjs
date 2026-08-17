const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { spawn } = require("node:child_process");

const execFileAsync = promisify(execFile);

const MAC_UPDATE_SCRIPT = `#!/bin/zsh
set -u

old_pid="$1"
source_app="$2"
current_app="$3"
target_app="$4"
mount_point="$5"
work_dir="$6"
target_backup="$target_app.daytrace-update-backup"
duplicate_backup="$current_app.daytrace-duplicate-backup"

case "$target_app" in
  "/Applications/Daytrace.app"|/Users/*/Applications/Daytrace.app) ;;
  *) exit 64 ;;
esac
case "$current_app" in
  "/Applications/Daytrace.app"|/Applications/Daytrace\\ [0-9]*.app|/Users/*/Applications/Daytrace.app|/Users/*/Applications/Daytrace\\ [0-9]*.app) ;;
  *) exit 65 ;;
esac
if [[ "$source_app" != "$mount_point/Daytrace.app" || ! -d "$source_app" ]]; then exit 66; fi

for _ in {1..300}; do
  /bin/kill -0 "$old_pid" 2>/dev/null || break
  /bin/sleep 0.2
done
if /bin/kill -0 "$old_pid" 2>/dev/null; then exit 67; fi

/bin/rm -rf "$target_backup" "$duplicate_backup"
if [[ -e "$target_app" ]]; then /bin/mv "$target_app" "$target_backup" || exit 68; fi
if [[ "$current_app" != "$target_app" && -e "$current_app" ]]; then
  /bin/mv "$current_app" "$duplicate_backup" || {
    [[ -e "$target_backup" ]] && /bin/mv "$target_backup" "$target_app"
    exit 69
  }
fi

if /usr/bin/ditto "$source_app" "$target_app" && /usr/bin/open -n "$target_app" --args --updated; then
  /bin/rm -rf "$target_backup" "$duplicate_backup"
  /usr/bin/hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
  /bin/rm -rf "$work_dir"
  exit 0
fi

/bin/rm -rf "$target_app"
[[ -e "$target_backup" ]] && /bin/mv "$target_backup" "$target_app"
[[ -e "$duplicate_backup" ]] && /bin/mv "$duplicate_backup" "$current_app"
/usr/bin/hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
if [[ -e "$current_app" ]]; then /usr/bin/open -n "$current_app" || true; elif [[ -e "$target_app" ]]; then /usr/bin/open -n "$target_app" || true; fi
/bin/rm -rf "$work_dir"
exit 70
`;

function canonicalMacUpdateTarget(bundlePath) {
  const normalized = String(bundlePath || "").replaceAll("\\", "/");
  if (/^\/Applications\/Daytrace(?: \d+)?\.app$/i.test(normalized)) return "/Applications/Daytrace.app";
  const userApplications = normalized.match(/^(\/Users\/[^/]+\/Applications)\/Daytrace(?: \d+)?\.app$/i);
  return userApplications ? `${userApplications[1]}/Daytrace.app` : "";
}

async function runCommand(command, args) {
  const { stdout = "" } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
  return String(stdout);
}

async function launchDetached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
}

function compareVersions(left, right) {
  const a = String(left || "").split(".").map(Number);
  const b = String(right || "").split(".").map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((part) => !Number.isInteger(part) || part < 0)) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

async function findStaleMacDuplicates({
  currentBundlePath,
  currentVersion,
  command = runCommand,
  fileSystem = fs,
}) {
  const canonicalPath = canonicalMacUpdateTarget(currentBundlePath);
  if (!canonicalPath || canonicalPath !== currentBundlePath || !/^\d+\.\d+\.\d+$/.test(String(currentVersion || ""))) return [];
  const applicationsDir = path.posix.dirname(canonicalPath);
  let entries;
  try { entries = fileSystem.readdirSync(applicationsDir, { withFileTypes: true }); }
  catch { return []; }

  const stale = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^Daytrace \d+\.app$/.test(entry.name)) continue;
    const candidate = path.posix.join(applicationsDir, entry.name);
    const infoPlist = path.posix.join(candidate, "Contents", "Info.plist");
    try {
      const bundleId = (await command("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", infoPlist])).trim();
      const version = (await command("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", infoPlist])).trim();
      const comparison = compareVersions(version, currentVersion);
      if (bundleId === "local.daytrace.desktop" && comparison !== null && comparison <= 0) stale.push(candidate);
    } catch { }
  }
  return stale;
}

async function prepareMacUpdate({
  dmgPath,
  currentBundlePath,
  expectedVersion,
  tempDir,
  pid = process.pid,
  command = runCommand,
  detach = launchDetached,
  fileSystem = fs,
  assertWritable = (directory) => fileSystem.accessSync(directory, fileSystem.constants.W_OK),
}) {
  const targetBundlePath = canonicalMacUpdateTarget(currentBundlePath);
  if (!targetBundlePath) throw new Error("mac-update-requires-applications-copy");
  if (!String(dmgPath || "").toLowerCase().endsWith(".dmg") || !fileSystem.existsSync(dmgPath)) throw new Error("mac-update-dmg-missing");
  if (!/^\d+\.\d+\.\d+$/.test(String(expectedVersion || ""))) throw new Error("mac-update-version-invalid");
  assertWritable(path.posix.dirname(targetBundlePath));

  const workDir = fileSystem.mkdtempSync(path.join(tempDir, "daytrace-mac-update-"));
  const mountPoint = path.join(workDir, "mounted");
  const scriptPath = path.join(workDir, "install-update.zsh");
  fileSystem.mkdirSync(mountPoint);
  let mounted = false;
  try {
    await command("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, dmgPath]);
    mounted = true;
    const sourceApp = path.join(mountPoint, "Daytrace.app");
    const infoPlist = path.join(sourceApp, "Contents", "Info.plist");
    if (!fileSystem.existsSync(sourceApp) || !fileSystem.existsSync(infoPlist)) throw new Error("mac-update-app-missing");
    const version = (await command("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", infoPlist])).trim();
    if (version !== expectedVersion) throw new Error("mac-update-version-mismatch");
    fileSystem.writeFileSync(scriptPath, MAC_UPDATE_SCRIPT, { encoding: "utf8", mode: 0o700 });
    await detach("/bin/zsh", [scriptPath, String(pid), sourceApp, currentBundlePath, targetBundlePath, mountPoint, workDir]);
    return { targetBundlePath, workDir };
  } catch (error) {
    if (mounted) {
      try { await command("/usr/bin/hdiutil", ["detach", mountPoint, "-quiet"]); } catch { }
    }
    fileSystem.rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { MAC_UPDATE_SCRIPT, canonicalMacUpdateTarget, findStaleMacDuplicates, prepareMacUpdate };

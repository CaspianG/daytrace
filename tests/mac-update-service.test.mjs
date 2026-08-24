import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import serviceModule from "../electron/lib/mac-update-service.cjs";

const { MAC_UPDATE_SCRIPT, canonicalMacUpdateTarget, confirmMacUpdateReady, findStaleMacDuplicates, getMacUpdateReadyRequest, prepareMacUpdate } = serviceModule;
const mainSource = fs.readFileSync(path.resolve(import.meta.dirname, "..", "electron", "main.cjs"), "utf8");

test("macOS updater keeps one canonical Applications copy", () => {
  assert.equal(canonicalMacUpdateTarget("/Applications/Daytrace.app"), "/Applications/Daytrace.app");
  assert.equal(canonicalMacUpdateTarget("/Applications/Daytrace 2.app"), "/Applications/Daytrace.app");
  assert.equal(canonicalMacUpdateTarget("/Users/alex/Applications/Daytrace 3.app"), "/Users/alex/Applications/Daytrace.app");
});

test("macOS updater refuses mounted and arbitrary application paths", () => {
  assert.equal(canonicalMacUpdateTarget("/Volumes/Daytrace/Daytrace.app"), "");
  assert.equal(canonicalMacUpdateTarget("/Users/alex/Downloads/Daytrace.app"), "");
  assert.equal(canonicalMacUpdateTarget("/Applications/Other.app"), "");
});

test("canonical app identifies only genuine stale numbered Daytrace copies", async () => {
  const entries = [
    { name: "Daytrace 2.app", isDirectory: () => true },
    { name: "Daytrace 3.app", isDirectory: () => true },
    { name: "Daytrace notes", isDirectory: () => true },
  ];
  const metadata = new Map([
    ["Daytrace 2.app", { id: "local.daytrace.desktop", version: "0.5.3" }],
    ["Daytrace 3.app", { id: "local.daytrace.desktop", version: "0.5.5" }],
  ]);
  const stale = await findStaleMacDuplicates({
    currentBundlePath: "/Applications/Daytrace.app",
    currentVersion: "0.5.4",
    fileSystem: { readdirSync: () => entries },
    async command(_command, args) {
      const name = args.at(-1).split("/").at(-3);
      const value = metadata.get(name);
      return args[1] === "CFBundleIdentifier" ? value.id : value.version;
    },
  });
  assert.deepEqual(stale, ["/Applications/Daytrace 2.app"]);
});

test("duplicate cleanup does nothing when the numbered copy is running", async () => {
  let scanned = false;
  const stale = await findStaleMacDuplicates({
    currentBundlePath: "/Applications/Daytrace 2.app",
    currentVersion: "0.5.4",
    fileSystem: { readdirSync() { scanned = true; return []; } },
  });
  assert.deepEqual(stale, []);
  assert.equal(scanned, false);
});

test("new macOS app can confirm readiness only inside the exact updater work directory", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-ready-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const updateDir = path.join(tempDir, "daytrace-updates");
  fs.mkdirSync(updateDir);
  const workDir = fs.mkdtempSync(path.join(updateDir, "daytrace-mac-update-"));
  const readyFile = path.join(workDir, "new-app-ready");
  const token = "a".repeat(64);
  const request = getMacUpdateReadyRequest({
    argv: ["Daytrace", `--daytrace-update-ready=${readyFile}`, `--daytrace-update-token=${token}`],
    updateDir,
  });

  assert.deepEqual(request, { readyFile: path.join(fs.realpathSync(workDir), "new-app-ready"), token });
  confirmMacUpdateReady(request);
  assert.equal(fs.readFileSync(readyFile, "utf8"), token);
  assert.throws(() => confirmMacUpdateReady(request), /EEXIST/);

  const outside = path.join(tempDir, "new-app-ready");
  assert.equal(getMacUpdateReadyRequest({
    argv: ["Daytrace", `--daytrace-update-ready=${outside}`, `--daytrace-update-token=${token}`],
    updateDir,
  }), null);
  assert.equal(getMacUpdateReadyRequest({
    argv: ["Daytrace", `--daytrace-update-ready=${readyFile}`, "--daytrace-update-token=short"],
    updateDir,
  }), null);
});

test("desktop runtime confirms an update only after the renderer is visible", () => {
  const rendererIndex = mainSource.indexOf("Renderer loaded without visible content");
  const visibleIndex = mainSource.indexOf("window.show(); window.focus();");
  const bridgeIndex = mainSource.indexOf("Renderer could not reach the local Daytrace service");
  const confirmationIndex = mainSource.indexOf("confirmMacUpdateReady(macUpdateReadyRequest)");
  assert.ok(rendererIndex >= 0);
  assert.ok(visibleIndex >= 0);
  assert.ok(bridgeIndex > rendererIndex && bridgeIndex < visibleIndex);
  assert.ok(confirmationIndex > visibleIndex);
});

test("verified macOS update mounts, checks version, and launches detached replacement", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-mac-update-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const dmgPath = path.join(tempDir, "Daytrace-0.5.4-macOS-universal.dmg");
  fs.writeFileSync(dmgPath, "verified-by-caller");
  const commands = [];
  let launched;

  const result = await prepareMacUpdate({
    dmgPath,
    currentBundlePath: "/Applications/Daytrace 2.app",
    expectedVersion: "0.5.4",
    tempDir,
    pid: 4242,
    tokenFactory: () => "b".repeat(64),
    assertWritable() {},
    async command(command, args) {
      commands.push([command, args]);
      if (command.endsWith("hdiutil") && args[0] === "attach") {
        const mountPoint = args[args.indexOf("-mountpoint") + 1];
        fs.mkdirSync(path.join(mountPoint, "Daytrace.app", "Contents"), { recursive: true });
        fs.writeFileSync(path.join(mountPoint, "Daytrace.app", "Contents", "Info.plist"), "plist");
      }
      if (command.endsWith("plutil")) return "0.5.4\n";
      return "";
    },
    async detach(command, args) { launched = [command, args]; },
  });

  assert.equal(result.targetBundlePath, "/Applications/Daytrace.app");
  assert.equal(commands[0][0], "/usr/bin/hdiutil");
  assert.equal(commands[1][0], "/usr/bin/plutil");
  assert.equal(launched[0], "/bin/zsh");
  assert.deepEqual(launched[1].slice(1, 4), ["4242", path.join(result.workDir, "mounted", "Daytrace.app"), "/Applications/Daytrace 2.app"]);
  assert.equal(launched[1][4], "/Applications/Daytrace.app");
  assert.equal(launched[1][7], result.readyFile);
  assert.equal(launched[1][8], "b".repeat(64));
  if (process.platform !== "win32") assert.equal(fs.statSync(launched[1][0]).mode & 0o700, 0o700);
  assert.match(fs.readFileSync(launched[1][0], "utf8"), /daytrace-duplicate-backup/);
});

test("macOS updater unmounts and cleans up when bundle version is wrong", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-mac-update-failure-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const dmgPath = path.join(tempDir, "Daytrace.dmg");
  fs.writeFileSync(dmgPath, "verified-by-caller");
  const commands = [];

  await assert.rejects(prepareMacUpdate({
    dmgPath,
    currentBundlePath: "/Applications/Daytrace.app",
    expectedVersion: "0.5.4",
    tempDir,
    assertWritable() {},
    async command(command, args) {
      commands.push([command, args]);
      if (command.endsWith("hdiutil") && args[0] === "attach") {
        const mountPoint = args[args.indexOf("-mountpoint") + 1];
        fs.mkdirSync(path.join(mountPoint, "Daytrace.app", "Contents"), { recursive: true });
        fs.writeFileSync(path.join(mountPoint, "Daytrace.app", "Contents", "Info.plist"), "plist");
      }
      if (command.endsWith("plutil")) return "9.9.9\n";
      return "";
    },
  }), /mac-update-version-mismatch/);

  assert.equal(commands.at(-1)[1][0], "detach");
  assert.equal(fs.readdirSync(tempDir).some((entry) => entry.startsWith("daytrace-mac-update-")), false);
});

test("replacement helper is restricted and contains rollback and relaunch paths", () => {
  assert.match(MAC_UPDATE_SCRIPT, /\/Applications\/Daytrace\\ \[0-9\]\*\.app/);
  assert.match(MAC_UPDATE_SCRIPT, /target_backup/);
  assert.match(MAC_UPDATE_SCRIPT, /duplicate_backup/);
  assert.match(MAC_UPDATE_SCRIPT, /\/usr\/bin\/open -n "\$target_app"/);
  assert.match(MAC_UPDATE_SCRIPT, /--daytrace-update-ready=\$ready_file/);
  assert.match(MAC_UPDATE_SCRIPT, /grep -Fqx "\$ready_token"/);
  assert.match(MAC_UPDATE_SCRIPT, /new-version-not-ready; restoring previous application/);
  assert.match(MAC_UPDATE_SCRIPT, /pkill -TERM -x Daytrace/);
  assert.ok(MAC_UPDATE_SCRIPT.indexOf("grep -Fqx") < MAC_UPDATE_SCRIPT.indexOf('log_update "new-version-ready"'));
});

test("replacement helper has valid zsh syntax on macOS", { skip: process.platform !== "darwin" }, () => {
  const result = spawnSync("/bin/zsh", ["-n"], { input: MAC_UPDATE_SCRIPT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

function writeFakeMacApp(bundlePath, build, confirmsReady) {
  const contents = path.join(bundlePath, "Contents");
  const executable = path.join(contents, "MacOS", "Daytrace");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(path.join(contents, "Resources"), { recursive: true });
  fs.writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Daytrace</string>
<key>CFBundleIdentifier</key><string>local.daytrace.update-test.${build}</string>
<key>CFBundleName</key><string>Daytrace</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.0.${build === "old" ? "1" : "2"}</string>
<key>CFBundleVersion</key><string>${build === "old" ? "1" : "2"}</string>
<key>LSUIElement</key><true/>
</dict></plist>`);
  fs.writeFileSync(path.join(contents, "Resources", "build.txt"), build);
  const executableLines = ["#!/bin/zsh"];
  if (confirmsReady) executableLines.push(
    'ready_file=""',
    'ready_token=""',
    'for argument in "$@"; do',
    '  case "$argument" in',
    '    --daytrace-update-ready=*) ready_file="${argument#*=}" ;;',
    '    --daytrace-update-token=*) ready_token="${argument#*=}" ;;',
    '  esac',
    'done',
    '[[ -n "$ready_file" && -n "$ready_token" ]] && /bin/echo "$ready_token" > "$ready_file"',
  );
  executableLines.push("exit 0", "");
  fs.writeFileSync(executable, executableLines.join("\n"), { mode: 0o755 });
}

function macHelperFixture(t, confirmsReady) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-helper-integration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetApp = path.join(root, "Daytrace.app");
  const workDir = path.join(root, "daytrace-mac-update-fixture");
  const mountPoint = path.join(workDir, "mounted");
  const sourceApp = path.join(mountPoint, "Daytrace.app");
  const readyFile = path.join(workDir, "new-app-ready");
  const readyToken = "c".repeat(64);
  fs.mkdirSync(mountPoint, { recursive: true });
  writeFakeMacApp(targetApp, "old", false);
  writeFakeMacApp(sourceApp, "new", confirmsReady);
  const script = MAC_UPDATE_SCRIPT
    .replace('  "/Applications/Daytrace.app"|/Users/*/Applications/Daytrace.app) ;;', `  "${targetApp}"|"/Applications/Daytrace.app"|/Users/*/Applications/Daytrace.app) ;;`)
    .replace('  "/Applications/Daytrace.app"|/Applications/Daytrace\\ [0-9]*.app|', `  "${targetApp}"|"/Applications/Daytrace.app"|/Applications/Daytrace\\ [0-9]*.app|`)
    .replace('log_dir="$HOME/Library/Logs/Daytrace"', `log_dir="${path.join(root, "logs")}"`)
    .replace("{1..450}", "{1..10}");
  const scriptPath = path.join(workDir, "install-update.zsh");
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  return { mountPoint, readyFile, readyToken, root, scriptPath, sourceApp, targetApp, workDir };
}

test("macOS helper keeps the new app only after a real ready signal", { skip: process.platform !== "darwin" }, (t) => {
  const fixture = macHelperFixture(t, true);
  const result = spawnSync("/bin/zsh", [fixture.scriptPath, "2000000000", fixture.sourceApp, fixture.targetApp, fixture.targetApp, fixture.mountPoint, fixture.workDir, fixture.readyFile, fixture.readyToken], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(fixture.targetApp, "Contents", "Resources", "build.txt"), "utf8"), "new");
  assert.equal(fs.existsSync(`${fixture.targetApp}.daytrace-update-backup`), false);
});

test("macOS helper restores the previous app when the new app never becomes ready", { skip: process.platform !== "darwin" }, (t) => {
  const fixture = macHelperFixture(t, false);
  const result = spawnSync("/bin/zsh", [fixture.scriptPath, "2000000000", fixture.sourceApp, fixture.targetApp, fixture.targetApp, fixture.mountPoint, fixture.workDir, fixture.readyFile, fixture.readyToken], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 70, result.stderr);
  assert.equal(fs.readFileSync(path.join(fixture.targetApp, "Contents", "Resources", "build.txt"), "utf8"), "old");
  assert.equal(fs.existsSync(`${fixture.targetApp}.daytrace-update-backup`), false);
});

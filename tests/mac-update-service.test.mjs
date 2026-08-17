import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import serviceModule from "../electron/lib/mac-update-service.cjs";

const { MAC_UPDATE_SCRIPT, canonicalMacUpdateTarget, findStaleMacDuplicates, prepareMacUpdate } = serviceModule;

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
});

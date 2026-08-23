import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import storeModule from "../electron/lib/event-store.cjs";
import portability from "../electron/lib/data-portability.cjs";

test("JSON/CSV exports and encrypted backup preserve safe local data", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-portability-"));
  const dataRoot = path.join(root, "source");
  const restoreRoot = path.join(root, "restore");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new storeModule.EventStore(dataRoot);
  store.updateSettings({ retentionHours: 7 * 24, language: "ru" });
  const base = Date.now() - 60_000;
  store.append({ at: new Date(base).toISOString(), kind: "foreground", app: "Google Chrome", title: "GitHub — private local project", context: "browser", domain: "github.com", urlPath: "/CaspianG/daytrace" });
  store.append({ at: new Date(base + 20_000).toISOString(), kind: "foreground", app: "Spreadsheet", title: "=2+2", context: "other" });
  store.append({ at: new Date(base + 40_000).toISOString(), kind: "idle", app: "Google Chrome", title: "GitHub — private local project", context: "browser" });

  const jsonFile = path.join(root, "export.json");
  const csvFile = path.join(root, "export.csv");
  fs.writeFileSync(jsonFile, "previous export");
  await portability.exportJson(store, jsonFile, "0.5.6");
  await portability.exportCsv(store, csvFile);
  const json = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  assert.equal(json.format, "daytrace-export");
  assert.equal(json.events[0].domain, "github.com");
  const csv = fs.readFileSync(csvFile, "utf8");
  assert.match(csv, /github\.com/);
  assert.match(csv, /"'=2\+2"/);
  assert.doesNotMatch(csv, /,"=2\+2",/);

  const backupFile = path.join(root, "history.daytrace");
  await portability.createEncryptedBackup(store, backupFile, "correct horse battery staple", "0.5.6");
  const encrypted = fs.readFileSync(backupFile);
  assert.equal(encrypted.subarray(0, portability.BACKUP_MAGIC.length).toString("ascii"), portability.BACKUP_MAGIC);
  assert.equal(encrypted.includes(Buffer.from("private local project")), false);

  const restored = await portability.restoreEncryptedBackup(restoreRoot, backupFile, "correct horse battery staple");
  assert.equal(restored.restored, true);
  const reopened = new storeModule.EventStore(restoreRoot);
  assert.equal(reopened.settings.language, "ru");
  assert.equal(reopened.loadEvents().some((event) => event.title === "GitHub — private local project"), true);
});

test("wrong backup passphrase fails before replacing existing local history", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-restore-rollback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = new storeModule.EventStore(path.join(root, "source"));
  source.append({ at: new Date().toISOString(), kind: "foreground", app: "Source App", title: "Source context" });
  const backup = path.join(root, "backup.daytrace");
  await portability.createEncryptedBackup(source, backup, "a secure passphrase");
  const targetRoot = path.join(root, "target");
  const target = new storeModule.EventStore(targetRoot);
  target.append({ at: new Date().toISOString(), kind: "foreground", app: "Existing App", title: "Must survive" });
  await assert.rejects(portability.restoreEncryptedBackup(targetRoot, backup, "wrong passphrase"));
  const reopened = new storeModule.EventStore(targetRoot);
  assert.equal(reopened.loadEvents().some((event) => event.title === "Must survive"), true);
  assert.equal(fs.readdirSync(targetRoot).some((name) => name.startsWith(".restore-")), false);
});

test("an incomplete filesystem rollback preserves the original recovery directory", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-restore-recovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = new storeModule.EventStore(path.join(root, "source"));
  source.append({ at: new Date().toISOString(), kind: "foreground", app: "Source App", title: "Replacement" });
  const backup = path.join(root, "backup.daytrace");
  await portability.createEncryptedBackup(source, backup, "a secure passphrase");
  const targetRoot = path.join(root, "target");
  const target = new storeModule.EventStore(targetRoot);
  target.append({ at: new Date().toISOString(), kind: "foreground", app: "Existing App", title: "Must remain recoverable" });

  const injectedRename = (from, to) => {
    const sourcePath = String(from);
    const destinationPath = String(to);
    if (sourcePath.includes(".restore-stage-") && path.basename(sourcePath) === "settings.json" && path.dirname(destinationPath) === targetRoot) throw new Error("simulated swap failure");
    if (sourcePath.includes(".restore-previous-") && path.basename(sourcePath) === "events" && path.dirname(destinationPath) === targetRoot) throw new Error("simulated rollback failure");
    return fs.renameSync(from, to);
  };

  await assert.rejects(
    portability.restoreEncryptedBackup(targetRoot, backup, "a secure passphrase", { renameSync: injectedRename }),
    /recovery data was preserved/i,
  );
  const recovery = fs.readdirSync(targetRoot).find((name) => name.startsWith(".restore-previous-"));
  assert.ok(recovery);
  assert.equal(fs.existsSync(path.join(targetRoot, recovery, "events")), true);
});

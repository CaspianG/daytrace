import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import windowsUpdater from "../electron/lib/windows-update-service.cjs";

const root = path.resolve(import.meta.dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");

function removeFixture(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function getWindowsCompiler() {
  const windowsDirectory = process.env.WINDIR || process.env.SystemRoot || "";
  return [
    path.join(windowsDirectory, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windowsDirectory, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ].find((candidate) => fs.existsSync(candidate));
}

function createFakeUpdateArchive({ compiler, fixture, installerPath, staysReady }) {
  const payloadDirectory = path.join(fixture, `payload-${staysReady ? "ready" : "fail"}`);
  const resourcesDirectory = path.join(payloadDirectory, "resources");
  const sourcePath = path.join(fixture, `FakeDaytrace-${staysReady ? "ready" : "fail"}.cs`);
  fs.mkdirSync(resourcesDirectory, { recursive: true });
  const readyBehavior = staysReady ? `
    string readyFile = Environment.GetEnvironmentVariable("DAYTRACE_UPDATE_READY_FILE");
    string readyToken = Environment.GetEnvironmentVariable("DAYTRACE_UPDATE_READY_TOKEN");
    if (!string.IsNullOrEmpty(readyFile) && !string.IsNullOrEmpty(readyToken)) {
      File.WriteAllText(readyFile, readyToken);
      Thread.Sleep(4000);
    }` : "Thread.Sleep(200);";
  const source = `
using System;
using System.IO;
using System.Reflection;
using System.Threading;
[assembly: AssemblyVersion("9.9.9.0")]
[assembly: AssemblyFileVersion("9.9.9.0")]
[assembly: AssemblyInformationalVersion("9.9.9")]
internal static class FakeDaytrace {
  [STAThread]
  private static int Main() {
    ${readyBehavior}
    return 0;
  }
}`;
  fs.writeFileSync(sourcePath, source);
  const stagedExecutable = path.join(payloadDirectory, "Daytrace.exe");
  const compile = spawnSync(compiler, ["/nologo", "/target:winexe", `/out:${stagedExecutable}`, sourcePath], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  fs.writeFileSync(path.join(resourcesDirectory, "app.asar"), "fake-packaged-renderer");
  fs.writeFileSync(path.join(payloadDirectory, "new-version.txt"), "ready-capable-version");
  const tarPath = windowsUpdater.defaultWindowsTarPath();
  const archive = spawnSync(tarPath, ["-cf", installerPath, "-C", payloadDirectory, "."], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(archive.status, 0, `${archive.stdout}\n${archive.stderr}`);
}

test("Windows readiness accepts only an exact private updater work directory", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-windows-ready-test-"));
  try {
    const updateRoot = path.join(fixture, "daytrace-updates");
    fs.mkdirSync(updateRoot);
    const workDirectory = fs.mkdtempSync(path.join(updateRoot, "daytrace-win-update-"));
    const readyFile = path.join(workDirectory, "new-app-ready");
    const token = "a".repeat(64);
    const environment = {
      [windowsUpdater.WINDOWS_UPDATE_ENV.readyFile]: readyFile,
      [windowsUpdater.WINDOWS_UPDATE_ENV.readyToken]: token,
    };
    const request = windowsUpdater.getWindowsUpdateReadyRequest({ environment, updateDir: updateRoot });
    assert.deepEqual(request, { readyFile: path.join(fs.realpathSync(workDirectory), "new-app-ready"), token });
    windowsUpdater.confirmWindowsUpdateReady(request);
    assert.equal(fs.readFileSync(readyFile, "utf8"), token);
    assert.throws(() => windowsUpdater.confirmWindowsUpdateReady(request), /EEXIST/);

    const outsideDirectory = fs.mkdtempSync(path.join(fixture, "outside-"));
    assert.equal(windowsUpdater.getWindowsUpdateReadyRequest({
      environment: { ...environment, [windowsUpdater.WINDOWS_UPDATE_ENV.readyFile]: path.join(outsideDirectory, "new-app-ready") },
      updateDir: updateRoot,
    }), null);
    assert.equal(windowsUpdater.getWindowsUpdateReadyRequest({
      environment: { ...environment, [windowsUpdater.WINDOWS_UPDATE_ENV.readyToken]: "short" },
      updateDir: updateRoot,
    }), null);
  } finally {
    removeFixture(fixture);
  }
});

test("Windows update helper backs up, verifies readiness, and contains rollback paths", () => {
  const script = windowsUpdater.WINDOWS_UPDATE_SCRIPT;
  assert.match(script, /Move-DirectoryWithRetry \$installDirectory \$backupDirectory/);
  assert.match(script, /& \$tarPath -xf \$installerPath -C \$stagingDirectory/);
  assert.doesNotMatch(script, /Start-Process -FilePath \$installerPath/);
  assert.doesNotMatch(script, /--force-run/);
  assert.match(script, /helper-prepared/);
  assert.match(script, /parent-proceed/);
  assert.match(script, /DAYTRACE_UPDATE_READY_FILE/);
  assert.match(script, /update-aborted-before-backup; original installation was not modified/);
  assert.match(script, /new-version-not-ready; restoring previous installation/);
  assert.match(script, /new-version-exited-after-ready/);
  assert.match(script, /Move-DirectoryWithRetry \$backupDirectory \$installDirectory/);
  assert.ok(script.indexOf("& $tarPath -xf $installerPath -C $stagingDirectory") < script.indexOf("WriteAllText($preparedFile"));
  assert.ok(script.indexOf("WriteAllText($preparedFile") < script.indexOf("Move-DirectoryWithRetry $installDirectory $backupDirectory"));
  assert.ok(script.indexOf("Move-DirectoryWithRetry $installDirectory $backupDirectory") < script.indexOf("Move-DirectoryWithRetry $stagingDirectory $installDirectory"));
  assert.ok(script.indexOf("new-version-ready") < script.indexOf("Remove-DirectoryBestEffort $backupDirectory"));
});

test("desktop confirms Windows update only after renderer, preload, IPC, and visible window", () => {
  const rendererCheck = mainSource.indexOf("Renderer loaded without visible content");
  const bridgeCheck = mainSource.indexOf("Renderer could not reach the local Daytrace service");
  const windowShown = mainSource.indexOf("window.show(); window.focus();");
  const readyConfirmation = mainSource.lastIndexOf("confirmWindowsUpdateReady(windowsUpdateReadyRequest)");
  assert.ok(rendererCheck > 0 && rendererCheck < bridgeCheck);
  assert.ok(bridgeCheck < windowShown);
  assert.ok(windowShown < readyConfirmation);
  assert.match(mainSource, /delete process\.env\[name\]/);
});

test("Windows update preparation passes validated transaction paths through a detached helper", { skip: process.platform !== "win32" }, async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-windows-prepare-test-"));
  try {
    const updateRoot = path.join(fixture, "daytrace-updates");
    const installDirectory = path.join(fixture, "Programs", "Daytrace");
    fs.mkdirSync(updateRoot, { recursive: true });
    fs.mkdirSync(installDirectory, { recursive: true });
    const currentExecutable = path.join(installDirectory, "Daytrace.exe");
    const installerPath = path.join(updateRoot, "Daytrace-Setup-9.9.9-x64.exe");
    fs.writeFileSync(currentExecutable, "old");
    fs.writeFileSync(installerPath, "installer");
    let launch;
    const result = await windowsUpdater.prepareWindowsUpdate({
      installerPath,
      currentExecutable,
      expectedVersion: "9.9.9",
      tempDir: updateRoot,
      logFile: path.join(fixture, "logs", "updater.log"),
      pid: 2147483647,
      tokenFactory: () => "b".repeat(64),
      detach: async (command, args, options) => {
        launch = { command, args, options };
        fs.writeFileSync(
          options.env[windowsUpdater.WINDOWS_UPDATE_ENV.preparedFile],
          options.env[windowsUpdater.WINDOWS_UPDATE_ENV.readyToken],
        );
      },
    });
    assert.equal(path.basename(launch.command).toLowerCase(), "powershell.exe");
    assert.deepEqual(launch.args.slice(0, 6), ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]);
    assert.equal(launch.options.env[windowsUpdater.WINDOWS_UPDATE_ENV.targetExecutable], fs.realpathSync(currentExecutable));
    assert.equal(path.basename(launch.options.env[windowsUpdater.WINDOWS_UPDATE_ENV.tarPath]).toLowerCase(), "tar.exe");
    assert.equal(launch.options.env[windowsUpdater.WINDOWS_UPDATE_ENV.readyToken], "b".repeat(64));
    assert.equal(result.readyFile, launch.options.env[windowsUpdater.WINDOWS_UPDATE_ENV.readyFile]);
    assert.equal(fs.readFileSync(result.proceedFile, "utf8"), "b".repeat(64));
    assert.equal(path.dirname(result.workDirectory), fs.realpathSync(updateRoot));
    assert.equal(path.basename(result.backupDirectory), "Daytrace.daytrace-update-backup-bbbbbbbbbbbb");
    assert.equal(path.basename(result.stagingDirectory), "Daytrace.daytrace-update-staging-bbbbbbbbbbbb");
  } finally {
    removeFixture(fixture);
  }
});

async function runPreparedHelperSynchronously(options) {
  let helperResultPromise;
  let result;
  let preparationError;
  try {
    result = await windowsUpdater.prepareWindowsUpdate({
      ...options,
      pid: 2147483647,
      detach: async (command, args, spawnOptions) => {
        options.beforeHelperStart?.(spawnOptions.env);
        const child = spawn(command, args, {
          env: spawnOptions.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        helperResultPromise = new Promise((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (status, signal) => resolve({
            error: undefined,
            signal,
            status,
            stderr: Buffer.concat(stderr).toString("utf8"),
            stdout: Buffer.concat(stdout).toString("utf8"),
          }));
        });
        await new Promise((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        return child;
      },
    });
  } catch (error) {
    preparationError = error;
  }
  if (!helperResultPromise) throw preparationError || new Error("test-helper-did-not-start");
  return { helperResult: await helperResultPromise, preparationError, result };
}

test("PowerShell preflight failure never moves or deletes the original Windows installation", { skip: process.platform !== "win32" }, async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-windows-preflight-test-"));
  try {
    const updateRoot = path.join(fixture, "daytrace-updates");
    const installDirectory = path.join(fixture, "Programs", "Daytrace");
    const currentExecutable = path.join(installDirectory, "Daytrace.exe");
    const installerPath = path.join(updateRoot, "Daytrace-Setup-9.9.9-x64.exe");
    const logFile = path.join(fixture, "logs", "updater.log");
    fs.mkdirSync(updateRoot, { recursive: true });
    fs.mkdirSync(installDirectory, { recursive: true });
    fs.writeFileSync(currentExecutable, "known-old-version");
    fs.writeFileSync(installerPath, "not-used");
    const { helperResult, preparationError } = await runPreparedHelperSynchronously({
      installerPath,
      currentExecutable,
      expectedVersion: "9.9.9",
      tempDir: updateRoot,
      logFile,
      preparationTimeoutMs: 1_000,
      tokenFactory: () => "e".repeat(64),
      beforeHelperStart: (helperEnvironment) => fs.mkdirSync(helperEnvironment[windowsUpdater.WINDOWS_UPDATE_ENV.backupDirectory]),
    });
    assert.match(preparationError?.message || "", /windows-update-helper-(?:not-prepared|exited-before-preparation)/);
    assert.equal(helperResult.status, 69, helperResult.stderr);
    assert.equal(fs.readFileSync(currentExecutable, "utf8"), "known-old-version");
    assert.match(fs.readFileSync(logFile, "utf8"), /original installation was not modified/);
  } finally {
    removeFixture(fixture);
  }
});

test("PowerShell rollback restores the previous Windows installation when the extracted app is not ready", { skip: process.platform !== "win32" }, async (t) => {
  const compiler = getWindowsCompiler();
  if (!compiler) return t.skip("Windows C# compiler is unavailable");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-windows-rollback-test-"));
  try {
    const updateRoot = path.join(fixture, "daytrace-updates");
    const installDirectory = path.join(fixture, "Programs", "Daytrace");
    const currentExecutable = path.join(installDirectory, "Daytrace.exe");
    const installerPath = path.join(updateRoot, "Daytrace-Setup-9.9.9-x64.exe");
    const logFile = path.join(fixture, "logs", "updater.log");
    fs.mkdirSync(updateRoot, { recursive: true });
    fs.mkdirSync(installDirectory, { recursive: true });
    fs.writeFileSync(currentExecutable, "known-old-version");
    createFakeUpdateArchive({ compiler, fixture, installerPath, staysReady: false });
    const { helperResult } = await runPreparedHelperSynchronously({
      installerPath,
      currentExecutable,
      expectedVersion: "9.9.9",
      tempDir: updateRoot,
      logFile,
      readinessTimeoutMs: 1_000,
      tokenFactory: () => "c".repeat(64),
    });
    assert.equal(helperResult.error, undefined);
    assert.equal(helperResult.status, 70, helperResult.stderr);
    assert.equal(fs.readFileSync(currentExecutable, "utf8"), "known-old-version");
    assert.match(fs.readFileSync(logFile, "utf8"), /rollback-complete/);
    assert.equal(fs.existsSync(path.join(fixture, "Programs", "Daytrace.daytrace-update-backup-cccccccccccc")), false);
  } finally {
    removeFixture(fixture);
  }
});

test("PowerShell helper keeps a new Windows installation only after a real readiness signal", { skip: process.platform !== "win32" }, async (t) => {
  const compiler = getWindowsCompiler();
  if (!compiler) return t.skip("Windows C# compiler is unavailable");

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daytrace-windows-success-test-"));
  try {
    const updateRoot = path.join(fixture, "daytrace-updates");
    const installDirectory = path.join(fixture, "Programs With Spaces", "Daytrace");
    const currentExecutable = path.join(installDirectory, "Daytrace.exe");
    const installerPath = path.join(updateRoot, "Daytrace-Setup-9.9.9-x64.exe");
    const logFile = path.join(fixture, "logs", "updater.log");
    fs.mkdirSync(updateRoot, { recursive: true });
    fs.mkdirSync(installDirectory, { recursive: true });
    fs.writeFileSync(currentExecutable, "known-old-version");
    fs.writeFileSync(path.join(installDirectory, "Uninstall Daytrace.exe"), "existing-uninstaller");
    fs.writeFileSync(path.join(installDirectory, "uninstallerIcon.ico"), "existing-uninstaller-icon");
    createFakeUpdateArchive({ compiler, fixture, installerPath, staysReady: true });

    const { helperResult } = await runPreparedHelperSynchronously({
      installerPath,
      currentExecutable,
      expectedVersion: "9.9.9",
      tempDir: updateRoot,
      logFile,
      readinessTimeoutMs: 8_000,
      tokenFactory: () => "d".repeat(64),
    });
    assert.equal(helperResult.error, undefined);
    assert.equal(helperResult.status, 0, helperResult.stderr);
    assert.equal(fs.readFileSync(path.join(installDirectory, "new-version.txt"), "utf8"), "ready-capable-version");
    assert.equal(fs.readFileSync(path.join(installDirectory, "Uninstall Daytrace.exe"), "utf8"), "existing-uninstaller");
    assert.equal(fs.readFileSync(path.join(installDirectory, "uninstallerIcon.ico"), "utf8"), "existing-uninstaller-icon");
    assert.match(fs.readFileSync(logFile, "utf8"), /new-version-ready/);
    assert.equal(fs.existsSync(path.join(fixture, "Programs With Spaces", "Daytrace.daytrace-update-backup-dddddddddddd")), false);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  } finally {
    removeFixture(fixture);
  }
});

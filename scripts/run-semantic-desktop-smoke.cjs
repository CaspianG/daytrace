const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const tempRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(tempRoot, "daytrace-desktop-smoke-semantic-"));

try {
  const electron = require("electron");
  const result = spawnSync(electron, [projectRoot, "--daytrace-semantic-smoke-test", "--background", `--daytrace-smoke-user-data=${userData}`], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  const logPath = path.join(userData, "startup.log");
  const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (result.error) throw result.error;
  if (result.status !== 0 || !/semantic-desktop-smoke-passed/.test(startupLog)) {
    throw new Error(`Semantic desktop smoke failed with exit ${result.status}.\n${result.stderr || ""}\n${startupLog}`);
  }
  const measurement = startupLog.match(/semantic-desktop-smoke-passed[^\n]*/)?.[0] || "semantic-desktop-smoke-passed";
  process.stdout.write(`Short-lived, one-thread RU/EN semantic analysis passed inside the Electron renderer (${measurement}).\n`);
} finally {
  const resolved = fs.realpathSync(userData);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("daytrace-desktop-smoke-semantic-")) throw new Error(`Refusing unsafe semantic smoke cleanup: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

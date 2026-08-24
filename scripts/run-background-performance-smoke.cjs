const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const tempRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(tempRoot, "daytrace-desktop-smoke-background-"));

try {
  const electron = require("electron");
  const result = spawnSync(electron, [
    projectRoot,
    "--background",
    "--daytrace-background-performance-smoke-test",
    `--daytrace-smoke-user-data=${userData}`,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
  });
  const logPath = path.join(userData, "startup.log");
  const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (result.error) throw result.error;
  const measurement = startupLog.match(/background-performance-smoke-passed[^\n]*/)?.[0] || "";
  if (result.status !== 0 || !measurement) {
    throw new Error(`Background performance smoke failed with exit ${result.status}.\n${result.stderr || ""}\n${startupLog}`);
  }
  process.stdout.write(`Low-load background runtime passed (${measurement}).\n`);
} finally {
  const resolved = fs.realpathSync(userData);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("daytrace-desktop-smoke-background-")) throw new Error(`Refusing unsafe performance-smoke cleanup: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

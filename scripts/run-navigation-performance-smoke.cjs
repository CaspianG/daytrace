const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const tempRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(tempRoot, "daytrace-desktop-smoke-"));
const startupTimeoutMs = process.env.CI ? 90_000 : 45_000;

try {
  const electron = require("electron");
  const result = spawnSync(electron, [projectRoot, "--daytrace-navigation-performance-smoke-test", `--daytrace-smoke-user-data=${userData}`], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: startupTimeoutMs,
    windowsHide: true,
  });
  const logPath = path.join(userData, "startup.log");
  const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (result.error) throw new Error(`Navigation performance smoke could not finish within ${startupTimeoutMs} ms: ${result.error.message}.\n${startupLog}`);
  const match = startupLog.match(/navigation-performance-smoke-passed (\{[^\n]+\})/);
  if (result.status !== 0 || !match) throw new Error(`Navigation performance smoke failed with exit ${result.status}.\n${result.stderr || ""}\n${startupLog}`);
  const metrics = JSON.parse(match[1]);
  process.stdout.write(`History navigation stayed stable with ${metrics.initialSessions} sessions: ${metrics.navigationMs} ms, ${metrics.maxLongTaskMs} ms longest task, ${metrics.stateBytes} state bytes, ${metrics.finalActivities} rendered activity rows.\n`);
} finally {
  const resolved = fs.realpathSync(userData);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("daytrace-desktop-smoke-")) throw new Error(`Refusing unsafe smoke cleanup: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

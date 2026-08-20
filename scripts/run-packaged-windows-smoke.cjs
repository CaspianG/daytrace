const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") throw new Error("The packaged Windows smoke test must run on Windows.");

const projectRoot = path.resolve(__dirname, "..");
const executable = path.join(projectRoot, "release", "win-unpacked", "Daytrace.exe");
if (!fs.existsSync(executable)) throw new Error(`Packaged executable is missing: ${executable}`);

const tempRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(tempRoot, "daytrace-desktop-smoke-"));

try {
  const result = spawnSync(executable, ["--daytrace-smoke-test", `--daytrace-smoke-user-data=${userData}`], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
  });
  const logPath = path.join(userData, "startup.log");
  const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (result.error) throw result.error;
  if (result.status !== 0 || !/desktop-smoke-passed/.test(startupLog)) {
    throw new Error(`Packaged desktop smoke failed with exit ${result.status}.\n${result.stderr || ""}\n${startupLog}`);
  }
  process.stdout.write("Packaged Windows renderer, preload, IPC, and local state smoke passed.\n");
} finally {
  const resolved = fs.realpathSync(userData);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("daytrace-desktop-smoke-")) throw new Error(`Refusing unsafe smoke cleanup: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

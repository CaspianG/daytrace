const path = require("node:path");
const { spawnMacCollectorBundle } = require("../electron/lib/mac-collector-runtime.cjs");

const executable = path.resolve(String(process.argv[2] || ""));
if (!executable) throw new Error("Collector executable path is required");

const child = spawnMacCollectorBundle({
  platform: "darwin",
  executablePath: executable,
  collectTitles: false,
  collectInput: false,
  log: (...values) => process.stderr.write(`${values.map(String).join(" ")}\n`),
});
let settled = false;
const finish = (error = null) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  child.kill();
  if (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  } else process.stdout.write("Verified LaunchServices collector runtime and authenticated local stream.\n");
};
child.stdout.once("data", () => finish());
child.once("exit", (code) => {
  if (code === 77) finish();
  else if (!settled) finish(new Error(`Collector runtime exited before readiness with code ${code}`));
});
child.once("error", finish);
const timer = setTimeout(() => finish(new Error("Collector runtime verification timed out")), 15_000);
timer.unref?.();

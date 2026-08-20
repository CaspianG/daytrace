const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputParent = path.join(projectRoot, "native", "windows-tracker", "bin", "Release");
const output = path.join(outputParent, "daytrace-win-x64");
if (path.dirname(output) !== outputParent || path.basename(output) !== "daytrace-win-x64" || !output.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error(`Refusing unsafe tracker output cleanup: ${output}`);
}
fs.rmSync(output, { recursive: true, force: true });

const result = spawnSync("dotnet", [
  "publish", "native/windows-tracker/Daytrace.Tracker.csproj",
  "-c", "Release",
  "-r", "win-x64",
  "--self-contained", "true",
  "-p:PublishSingleFile=false",
  "-p:PublishReadyToRun=true",
  "-p:DebugType=None",
  "-p:DebugSymbols=false",
  // The collector emits language-neutral JSON; the Electron UI owns EN/RU text.
  "-p:SatelliteResourceLanguages=en",
  "-o", output,
], { cwd: projectRoot, stdio: "inherit", windowsHide: true });

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

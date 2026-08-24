const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);
let preparation;

async function prepareUnsignedUniversalCollector(event) {
  const outputRoot = path.resolve(path.dirname(event.file));
  const appPath = path.resolve(outputRoot, "mac-universal", "Daytrace.app");
  const collectorApp = path.resolve(appPath, "Contents", "Helpers", "Daytrace Collector.app");
  const expectedPrefix = `${outputRoot}${path.sep}`;
  if (!collectorApp.startsWith(expectedPrefix) || !fs.existsSync(collectorApp)) {
    throw new Error(`Merged Daytrace Collector was not found under the release output: ${collectorApp}`);
  }

  // @electron/universal rewrites the merged helper bundle after the source
  // helper was ad-hoc signed. Re-seal that exact final helper before either the
  // ZIP or DMG starts reading Daytrace.app. Developer-ID builds deliberately do
  // not set DAYTRACE_COMMUNITY_MAC_BUILD and keep electron-builder's signature.
  await run("codesign", [
    "--force",
    "--sign", "-",
    "--options", "runtime",
    "--identifier", "local.daytrace.desktop.collector",
    collectorApp,
  ]);
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", collectorApp]);
  process.stdout.write("Prepared final universal Daytrace Collector ad-hoc signature before artifact creation.\n");
}

module.exports = async function artifactBuildStarted(event) {
  if (process.platform !== "darwin" || process.env.DAYTRACE_COMMUNITY_MAC_BUILD !== "1") return;
  if (!event?.file || !String(event.targetPresentableName || "").match(/(?:DMG|macOS zip)/i)) return;
  if (!preparation) preparation = prepareUnsignedUniversalCollector(event);
  return preparation;
};

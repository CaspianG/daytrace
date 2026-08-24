const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);
let preparation;

async function prepareUnsignedUniversalCollector(event) {
  const outputRoot = path.resolve(path.dirname(event.file));
  const appPath = path.resolve(outputRoot, "mac-universal", "Daytrace.app");
  const collectorApp = path.resolve(appPath, "Contents", "Helpers", "Daytrace Activity Collector.app");
  const collectorInfo = path.resolve(collectorApp, "Contents", "Info.plist");
  const entitlements = path.resolve(__dirname, "..", "build", "entitlements.mac.plist");
  const signingIdentity = String(process.env.DAYTRACE_COMMUNITY_SIGNING_IDENTITY || "-").trim() || "-";
  const expectedPrefix = `${outputRoot}${path.sep}`;
  if (!collectorApp.startsWith(expectedPrefix) || !fs.existsSync(collectorApp)) {
    throw new Error(`Merged Daytrace Activity Collector was not found under the release output: ${collectorApp}`);
  }

  // @electron/universal injects the parent ElectronAsarIntegrity value into
  // nested app plists. That value changes on every Daytrace release and made
  // the collector's TCC identity change even when its code did not. The helper
  // has its own fixed ABI version and never contains the parent ASAR.
  await run("plutil", ["-remove", "ElectronAsarIntegrity", collectorInfo]).catch((error) => {
    if (!String(error?.stderr || error?.message || error).includes("Could not modify plist")) throw error;
  });
  await run("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleShortVersionString 1.0.0", collectorInfo]);
  await run("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleVersion 1.0.0", collectorInfo]);

  // electron-builder's extraFiles can leave plain documentation executable in
  // Contents. codesign then treats those text files as nested code and refuses
  // to re-seal the parent after the collector changed. They are data, so make
  // that explicit before signing the final bundle.
  for (const fileName of ["LICENSE", "README.md", "README_RU.md"]) {
    const dataFile = path.resolve(appPath, "Contents", fileName);
    if (!fs.existsSync(dataFile)) continue;
    await run("codesign", ["--remove-signature", dataFile]).catch((error) => {
      const detail = String(error?.stderr || error?.message || error);
      if (!detail.includes("code object is not signed at all")) throw error;
    });
    await fs.promises.chmod(dataFile, 0o644);
  }

  // Re-seal the exact final helper, then the parent app that contains it. The
  // optional community identity is a stable non-Apple code-signing identity:
  // it does not bypass Gatekeeper, but it prevents TCC from seeing a new
  // collector after every update. Developer-ID builds use the strict path and
  // deliberately skip this community hook.
  await run("codesign", [
    "--force",
    "--sign", signingIdentity,
    "--timestamp=none",
    "--options", "runtime",
    "--identifier", "io.github.caspiang.daytrace.collector",
    collectorApp,
  ]);
  await run("codesign", [
    "--force",
    "--sign", signingIdentity,
    "--timestamp=none",
    "--options", "runtime",
    "--entitlements", entitlements,
    appPath,
  ]);
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", collectorApp]);
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  process.stdout.write(`Prepared final universal Daytrace Activity Collector and parent app with ${signingIdentity === "-" ? "ad-hoc" : "stable community"} signatures.\n`);
}

module.exports = async function artifactBuildStarted(event) {
  if (process.platform !== "darwin" || process.env.DAYTRACE_COMMUNITY_MAC_BUILD !== "1") return;
  if (!event?.file || !String(event.targetPresentableName || "").match(/(?:DMG|macOS zip)/i)) return;
  if (!preparation) preparation = prepareUnsignedUniversalCollector(event);
  return preparation;
};

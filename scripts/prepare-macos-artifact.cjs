const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { signAsync } = require("@electron/osx-sign");

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

  // Re-seal every executable component from the deepest Electron helper up to
  // the parent app. Signing only the collector and outer bundle leaves the
  // standard GPU/Renderer helpers unsigned and produces an app macOS refuses
  // to validate. The collector receives no JIT entitlement; its bundle ID from
  // the fixed Info.plist becomes its stable designated requirement.
  await signAsync({
    app: appPath,
    identity: signingIdentity,
    identityValidation: false,
    platform: "darwin",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    optionsForFile(filePath) {
      const options = { timestamp: "none" };
      if (filePath === appPath) options.entitlements = entitlements;
      if (filePath === collectorApp || filePath.startsWith(`${collectorApp}${path.sep}`)) {
        options.entitlements = [];
      }
      return options;
    },
  });
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

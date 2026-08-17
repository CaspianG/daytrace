const path = require("node:path");

function getMacInstallInfo({ platform = process.platform, packaged = false, execPath = process.execPath } = {}) {
  if (platform !== "darwin") return { appName: "Daytrace", bundlePath: "", issue: "" };

  const normalized = String(execPath || "").replaceAll("\\", "/");
  const marker = ".app/Contents/MacOS/";
  const markerIndex = normalized.toLowerCase().indexOf(marker.toLowerCase());
  const bundlePath = markerIndex >= 0 ? normalized.slice(0, markerIndex + 4) : "";
  const appName = bundlePath ? path.posix.basename(bundlePath, ".app") : "Daytrace";

  if (!packaged) return { appName, bundlePath, issue: "" };
  if (!bundlePath) return { appName, bundlePath, issue: "unknown-location" };
  if (bundlePath.toLowerCase().startsWith("/volumes/")) return { appName, bundlePath, issue: "disk-image" };
  if (appName.toLowerCase() !== "daytrace") return { appName, bundlePath, issue: "duplicate-copy" };
  if (!/^\/Applications\//i.test(bundlePath) && !/^\/Users\/[^/]+\/Applications\//i.test(bundlePath)) {
    return { appName, bundlePath, issue: "outside-applications" };
  }
  return { appName, bundlePath, issue: "" };
}

module.exports = { getMacInstallInfo };

const MAX_RELEASE_JSON_BYTES = 1_000_000;
const MAX_UPDATE_BYTES = 350 * 1024 * 1024;

function versionParts(value) {
  const cleaned = String(value || "").trim().replace(/^v/i, "").split("-")[0];
  if (!/^\d+\.\d+\.\d+$/.test(cleaned)) return null;
  return cleaned.split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function expectedAssetName(version, platform) {
  if (platform === "win32") return `Daytrace-Setup-${version}-x64.exe`;
  if (platform === "darwin") return `Daytrace-${version}-macOS-universal.dmg`;
  return null;
}

function isGitHubUrl(value, pathPrefix = "/") {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && parsed.hostname === "github.com" && parsed.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

function normalizeRelease(payload, platform, currentVersion) {
  if (!payload || payload.draft || payload.prerelease) return null;
  const version = String(payload.tag_name || "").replace(/^v/i, "");
  if (!versionParts(version)) return null;
  const expected = expectedAssetName(version, platform);
  const asset = expected && Array.isArray(payload.assets) ? payload.assets.find((item) => item?.name === expected) : null;
  const downloadUrl = String(asset?.browser_download_url || "");
  const releasePath = `/CaspianG/daytrace/releases/`;
  if (asset && !isGitHubUrl(downloadUrl, releasePath)) return null;
  const digest = String(asset?.digest || "").toLowerCase();
  return {
    version,
    available: compareVersions(version, currentVersion) > 0,
    releaseUrl: isGitHubUrl(payload.html_url, releasePath) ? String(payload.html_url) : "https://github.com/CaspianG/daytrace/releases/latest",
    asset: asset ? {
      name: asset.name,
      downloadUrl,
      digest: /^sha256:[a-f0-9]{64}$/.test(digest) ? digest.slice(7) : "",
      size: Math.max(0, Number(asset.size || 0)),
    } : null,
  };
}

module.exports = { MAX_RELEASE_JSON_BYTES, MAX_UPDATE_BYTES, compareVersions, expectedAssetName, isGitHubUrl, normalizeRelease, versionParts };

import test from "node:test";
import assert from "node:assert/strict";
import updater from "../electron/lib/update-service.cjs";

test("semantic release versions compare numerically", () => {
  assert.equal(updater.compareVersions("0.4.10", "0.4.9"), 1);
  assert.equal(updater.compareVersions("v0.4.0", "0.4.0"), 0);
  assert.equal(updater.compareVersions("0.3.9", "0.4.0"), -1);
  assert.equal(updater.compareVersions("not-a-version", "0.4.0"), 0);
});

test("release metadata selects the exact platform artifact", () => {
  const payload = {
    tag_name: "v0.4.1",
    html_url: "https://github.com/CaspianG/daytrace/releases/tag/v0.4.1",
    assets: [
      { name: "Daytrace-Setup-0.4.1-x64.exe", browser_download_url: "https://github.com/CaspianG/daytrace/releases/download/v0.4.1/Daytrace-Setup-0.4.1-x64.exe", digest: `sha256:${"a".repeat(64)}`, size: 150_000_000 },
      { name: "Daytrace-0.4.1-macOS-universal.dmg", browser_download_url: "https://github.com/CaspianG/daytrace/releases/download/v0.4.1/Daytrace-0.4.1-macOS-universal.dmg", digest: `sha256:${"b".repeat(64)}`, size: 220_000_000 },
    ],
  };
  const windows = updater.normalizeRelease(payload, "win32", "0.4.0");
  const mac = updater.normalizeRelease(payload, "darwin", "0.4.0");
  assert.equal(windows.available, true);
  assert.equal(windows.asset.name, "Daytrace-Setup-0.4.1-x64.exe");
  assert.equal(windows.asset.digest, "a".repeat(64));
  assert.equal(mac.asset.name, "Daytrace-0.4.1-macOS-universal.dmg");
});

test("unsafe release and asset URLs are rejected", () => {
  const unsafe = updater.normalizeRelease({
    tag_name: "v9.9.9",
    html_url: "https://example.com/fake",
    assets: [{ name: "Daytrace-Setup-9.9.9-x64.exe", browser_download_url: "https://example.com/payload.exe" }],
  }, "win32", "0.4.0");
  assert.equal(unsafe, null);
  assert.equal(updater.isGitHubUrl("https://github.com.evil.example/CaspianG/daytrace/releases/download/payload.exe", "/CaspianG/daytrace/releases/"), false);
});

test("drafts, prereleases and non-newer releases cannot become updates", () => {
  assert.equal(updater.normalizeRelease({ tag_name: "v0.4.2", draft: true }, "win32", "0.4.1"), null);
  assert.equal(updater.normalizeRelease({ tag_name: "v0.4.2", prerelease: true }, "win32", "0.4.1"), null);
  const current = updater.normalizeRelease({ tag_name: "v0.4.1", assets: [] }, "win32", "0.4.1");
  const older = updater.normalizeRelease({ tag_name: "v0.4.0", assets: [] }, "darwin", "0.4.1");
  assert.equal(current.available, false);
  assert.equal(older.available, false);
});

test("rate-limit fallback accepts only an official tag and exact checksum entry", () => {
  const checksums = `${"c".repeat(64)}  Daytrace-Setup-0.4.2-x64.exe\n${"d".repeat(64)}  unrelated.exe\n`;
  const release = updater.normalizeChecksumRelease("https://github.com/CaspianG/daytrace/releases/tag/v0.4.2", checksums, "win32", "0.4.1");
  assert.equal(release.available, true);
  assert.equal(release.asset.digest, "c".repeat(64));
  assert.equal(release.asset.downloadUrl, "https://github.com/CaspianG/daytrace/releases/download/v0.4.2/Daytrace-Setup-0.4.2-x64.exe");
  assert.equal(updater.normalizeChecksumRelease("https://github.com.evil.example/CaspianG/daytrace/releases/tag/v0.4.2", checksums, "win32", "0.4.1"), null);
  assert.equal(updater.normalizeChecksumRelease("https://github.com/CaspianG/daytrace/releases/tag/v0.4.2", `${"c".repeat(64)}  other.exe`, "win32", "0.4.1"), null);
});

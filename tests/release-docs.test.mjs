import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const readmeRu = fs.readFileSync(path.join(root, "README_RU.md"), "utf8");
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");

test("release metadata and both READMEs name the same current version", () => {
  const version = pkg.version;
  assert.equal(lock.version, version);
  assert.equal(lock.packages[""].version, version);
  assert.match(readme, new RegExp(`Current release: v${version.replaceAll(".", "\\.")}`));
  assert.match(readme, new RegExp(`current-v${version.replaceAll(".", "\\.")}`));
  assert.match(readmeRu, new RegExp(`Текущий релиз: v${version.replaceAll(".", "\\.")}`));
  assert.match(readmeRu, new RegExp(`current-v${version.replaceAll(".", "\\.")}`));
  assert.match(changelog, new RegExp(`## \\[${version.replaceAll(".", "\\.")}\\]`));
});

test("both READMEs document Windows, macOS, and measured system load", () => {
  for (const document of [readme, readmeRu]) {
    assert.match(document, /Windows/);
    assert.match(document, /macOS/);
    assert.match(document, /0[,.]039%/);
    assert.match(document, /199 (?:MiB|МиБ)/);
  }
});

test("macOS tagged releases require signing, notarization, and local verification", () => {
  assert.match(releaseWorkflow, /MAC_CSC_LINK/);
  assert.match(releaseWorkflow, /APPLE_API_KEY/);
  assert.match(releaseWorkflow, /dist:mac:release/);
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.mac.notarize, true);
  assert.match(pkg.scripts["dist:mac:release"], /forceCodeSigning=true/);
  assert.match(pkg.scripts["dist:mac:release"], /verify-macos-release\.sh/);
});

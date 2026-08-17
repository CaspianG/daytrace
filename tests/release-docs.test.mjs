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
const releaseBody = fs.readFileSync(path.join(root, ".github", "RELEASE_BODY.md"), "utf8");
const macGuide = fs.readFileSync(path.join(root, "docs", "MACOS_INSTALL.md"), "utf8");
const macGuideRu = fs.readFileSync(path.join(root, "docs", "MACOS_INSTALL_RU.md"), "utf8");
const bundledMacGuide = fs.readFileSync(path.join(root, "MACOS_INSTALL.txt"), "utf8");

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

test("macOS tagged releases remain publishable without unavailable Apple credentials", () => {
  assert.match(releaseWorkflow, /npm run dist:mac/);
  assert.doesNotMatch(releaseWorkflow, /secrets\.MAC_CSC_LINK/);
  assert.match(releaseWorkflow, /MACOS_INSTALL\.txt/);
  assert.match(releaseWorkflow, /body_path: \.github\/RELEASE_BODY\.md/);
  assert.match(pkg.scripts["dist:mac"], /mac\.identity=null/);
  assert.match(pkg.scripts["dist:mac"], /mac\.notarize=false/);
  assert.equal(pkg.build.dmg.contents.some((item) => item.path === "MACOS_INSTALL.txt"), true);
});

test("strict signed and notarized macOS build remains available for future credentials", () => {
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.mac.notarize, true);
  assert.match(pkg.scripts["dist:mac:release"], /forceCodeSigning=true/);
  assert.match(pkg.scripts["dist:mac:release"], /verify-macos-release\.sh/);
});

test("macOS downloaders see safe bilingual Gatekeeper instructions before and inside the package", () => {
  assert.match(readme, /docs\/MACOS_INSTALL\.md/);
  assert.match(readmeRu, /docs\/MACOS_INSTALL_RU\.md/);

  for (const document of [releaseBody, macGuide, macGuideRu, bundledMacGuide]) {
    assert.match(document, /Gatekeeper/);
    assert.match(document, /SHA256SUMS\.txt/);
    assert.doesNotMatch(document, /spctl\s+--master-disable/);
  }

  assert.match(macGuide, /Control-click/);
  assert.match(macGuide, /Open Anyway/);
  assert.match(macGuideRu, /Всё равно открыть/);
  assert.match(bundledMacGuide, /READ BEFORE INSTALLING/);
  assert.match(bundledMacGuide, /ПРОЧИТАЙТЕ ПЕРЕД УСТАНОВКОЙ/);
});

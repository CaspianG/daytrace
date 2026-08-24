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
const ciWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const securityWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "security.yml"), "utf8");
const dependabot = fs.readFileSync(path.join(root, ".github", "dependabot.yml"), "utf8");
const releaseBody = fs.readFileSync(path.join(root, ".github", "RELEASE_BODY.md"), "utf8");
const macGuide = fs.readFileSync(path.join(root, "docs", "MACOS_INSTALL.md"), "utf8");
const macGuideRu = fs.readFileSync(path.join(root, "docs", "MACOS_INSTALL_RU.md"), "utf8");
const bundledMacGuide = fs.readFileSync(path.join(root, "MACOS_INSTALL.txt"), "utf8");
const bundleMacGuideScript = fs.readFileSync(path.join(root, "scripts", "bundle-macos-install-guide.sh"), "utf8");
const macTrackerBuild = fs.readFileSync(path.join(root, "scripts", "build-macos-tracker.sh"), "utf8");
const verifyMacPackageScript = fs.readFileSync(path.join(root, "scripts", "verify-macos-package.sh"), "utf8");
const verifyMacReleaseScript = fs.readFileSync(path.join(root, "scripts", "verify-macos-release.sh"), "utf8");
const electronMain = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const windowsTrackerBuild = fs.readFileSync(path.join(root, "scripts", "build-windows-tracker.cjs"), "utf8");
const windowsUpdateService = fs.readFileSync(path.join(root, "electron", "lib", "windows-update-service.cjs"), "utf8");
const packagedWindowsSmoke = fs.readFileSync(path.join(root, "scripts", "run-packaged-windows-smoke.cjs"), "utf8");
const windowsInstallerInclude = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf8");
const viteConfig = fs.readFileSync(path.join(root, "vite.config.mjs"), "utf8");

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
    assert.match(document, /0[,.]032%/);
    assert.match(document, /125[,.]6 (?:MiB|МиБ)/);
    assert.match(document, /(?:499 ms|499 мс)/);
    assert.match(document, /(?:backoff|экспоненциальн)/i);
    assert.match(document, /(?:physical-Mac|физическом Mac)/i);
  }
  assert.match(pkg.scripts["test:stability"], /run-runtime-recovery-smoke/);
  assert.match(pkg.scripts["test:performance"], /run-background-performance-smoke/);
});

test("Windows native collector remains self-contained with a lean fast-start publish", () => {
  assert.equal(pkg.scripts["build:tracker:win"], "node scripts/build-windows-tracker.cjs");
  assert.match(windowsTrackerBuild, /"--self-contained", "true"/);
  assert.match(windowsTrackerBuild, /PublishSingleFile=false/);
  assert.match(windowsTrackerBuild, /PublishReadyToRun=true/);
  assert.match(windowsTrackerBuild, /DebugSymbols=false/);
  assert.match(windowsTrackerBuild, /SatelliteResourceLanguages=en/);
  assert.match(windowsTrackerBuild, /Refusing unsafe tracker output cleanup/);
  assert.equal(pkg.build.win.extraResources[0].from, "native/windows-tracker/bin/Release/daytrace-win-x64/");
  assert.deepEqual(pkg.build.electronLanguages, ["en-US", "ru"]);
  assert.match(pkg.scripts["dist:win"], /electron-builder[\s\S]*npm run test:packaged:win/);
});

test("local preview cannot lock generated desktop packaging folders", () => {
  assert.match(viteConfig, /watch:\s*\{/);
  assert.match(viteConfig, /\*\*\/release\/\*\*/);
  assert.match(viteConfig, /\*\*\/dist\/\*\*/);
  assert.match(viteConfig, /\*\*\/native\/\*\*\/bin\/\*\*/);
});

test("Windows installer offers the documented Desktop shortcut choice and cleans native-host registration", () => {
  assert.equal(pkg.build.nsis.include, "build/installer.nsh");
  assert.equal(pkg.build.nsis.createDesktopShortcut, false);
  assert.match(windowsInstallerInclude, /DaytraceShortcutCheckboxText/);
  assert.match(windowsInstallerInclude, /CreateShortCut/);
  assert.match(windowsInstallerInclude, /DeleteRegKey HKCU "Software\\Google\\Chrome\\NativeMessagingHosts\\com\.daytrace\.browser"/);
  assert.match(windowsInstallerInclude, /DeleteRegKey HKCU "Software\\Daytrace\\BrowserHost"/);
});

test("Windows releases document and verify readiness-confirmed transactional rollback", () => {
  assert.match(readme, /v0\.5\.6 crash-safe Windows updates/);
  assert.match(readmeRu, /Безопасные Windows-обновления v0\.5\.6/);
  assert.match(releaseBody, /Windows updates also keep the previous installation/);
  assert.match(windowsUpdateService, /DAYTRACE_UPDATE_READY_TOKEN/);
  assert.match(windowsUpdateService, /Move-DirectoryWithRetry \$backupDirectory \$installDirectory/);
  assert.match(packagedWindowsSmoke, /installer-payload/);
  assert.match(packagedWindowsSmoke, /sha256\(extractedExecutable\) !== sha256\(executable\)/);
  assert.match(packagedWindowsSmoke, /sha256\(extractedNativeHost\) !== sha256\(packagedNativeHost\)/);
  assert.match(packagedWindowsSmoke, /Packaged one-shot browser native host smoke passed/);
  assert.match(pkg.scripts.test, /windows-update-service\.test\.mjs/);
});

test("macOS tagged releases remain publishable without unavailable Apple credentials", () => {
  assert.match(releaseWorkflow, /npm run dist:mac/);
  assert.doesNotMatch(releaseWorkflow, /secrets\.MAC_CSC_LINK/);
  assert.match(releaseWorkflow, /cp MACOS_INSTALL\.txt release\/MACOS_INSTALL\.txt/);
  assert.match(releaseWorkflow, /release\/MACOS_INSTALL\.txt/);
  assert.match(releaseWorkflow, /body_path: \.github\/RELEASE_BODY\.md/);
  assert.match(pkg.scripts["dist:mac"], /mac\.identity=null/);
  assert.match(pkg.scripts["dist:mac"], /mac\.notarize=false/);
  assert.match(pkg.scripts["dist:mac"], /verify-macos-package\.sh/);
  assert.match(pkg.scripts["dist:mac"], /bundle-macos-install-guide\.sh/);
  assert.equal(pkg.build.dmg.contents.some((item) => item.path === "MACOS_INSTALL.txt"), true);
  assert.equal(pkg.build.dmg.contents.some((item) => item.name === "IF MAC BLOCKS DAYTRACE - OPEN THIS.txt"), true);
  assert.match(bundleMacGuideScript, /IF MAC BLOCKS DAYTRACE - OPEN THIS\.txt/);
  assert.match(bundleMacGuideScript, /unzip -tq/);
});

test("macOS packages and checks a named Accessibility collector with its own exact TCC identity", () => {
  assert.deepEqual(pkg.build.mac.binaries, ["Contents/Helpers/Daytrace Collector.app/Contents/MacOS/Daytrace Collector"]);
  assert.equal(pkg.build.mac.extraFiles.some((item) => item.to === "Helpers/Daytrace Collector.app"), true);
  assert.match(macTrackerBuild, /CFBundleIdentifier<\/key><string>local\.daytrace\.desktop\.collector/);
  assert.match(macTrackerBuild, /codesign --force --sign - --options runtime --identifier local\.daytrace\.desktop\.collector/);
  assert.match(verifyMacReleaseScript, /Contents\/Helpers\/Daytrace Collector\.app/);
  assert.match(verifyMacPackageScript, /CFBundleIdentifier/);
  assert.match(verifyMacPackageScript, /lipo -archs/);
  assert.match(verifyMacPackageScript, /--check-accessibility/);
  assert.match(verifyMacPackageScript, /--daytrace-smoke-test/);
  assert.match(electronMain, /"Helpers", "Daytrace Collector\.app", "Contents", "MacOS", "Daytrace Collector"/);
  assert.match(electronMain, /--check-accessibility/);
  assert.match(electronMain, /probeTrusted: process\.platform === "darwin" \? probeTrackerAccessibility : null/);
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

test("repository automation uses least privilege and continuous security checks", () => {
  for (const workflow of [ciWorkflow, releaseWorkflow, securityWorkflow]) {
    for (const action of workflow.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)) assert.match(action[1], /^[a-f0-9]{40}$/);
  }
  assert.match(releaseWorkflow, /permissions:\s*\n\s+contents: read/);
  assert.match(releaseWorkflow, /publish:[\s\S]*?permissions:\s*\n\s+contents: write/);
  assert.match(securityWorkflow, /github\/codeql-action\/init@[a-f0-9]{40}/);
  assert.match(securityWorkflow, /javascript-typescript/);
  assert.match(securityWorkflow, /csharp/);
  assert.match(ciWorkflow, /npx --yes npm@11\.6\.2 audit --audit-level=high/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});

test("optional semantic weights are separate checksum-pinned release assets", () => {
  assert.equal(pkg.build.files.some((entry) => String(entry).includes("models/semantic")), false);
  assert.equal(pkg.build.extraResources.some((entry) => String(entry.from || "").includes("models/semantic")), false);
  for (const name of [
    "daytrace-semantic-ru-config.json",
    "daytrace-semantic-ru-tokenizer.json",
    "daytrace-semantic-ru-tokenizer-config.json",
    "daytrace-semantic-ru-special-tokens.json",
    "daytrace-semantic-ru-int8.onnx",
    "daytrace-semantic-ru-LICENSE.txt",
    "daytrace-semantic-en-config.json",
    "daytrace-semantic-en-tokenizer.json",
    "daytrace-semantic-en-tokenizer-config.json",
    "daytrace-semantic-en-special-tokens.json",
    "daytrace-semantic-en-int8.onnx",
    "daytrace-semantic-en-LICENSE.txt",
  ]) assert.match(releaseWorkflow, new RegExp(name.replaceAll(".", "\\.")));
  assert.match(releaseWorkflow, /sha256sum Daytrace-\* daytrace-\*/);
  assert.match(pkg.scripts.test, /semantic-model\.test\.mjs/);
  assert.match(pkg.scripts["test:desktop"], /run-semantic-desktop-smoke\.cjs/);
});

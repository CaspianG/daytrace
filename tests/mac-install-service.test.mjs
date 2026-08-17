import test from "node:test";
import assert from "node:assert/strict";
import serviceModule from "../electron/lib/mac-install-service.cjs";

const { getMacInstallInfo } = serviceModule;

test("macOS identifies the canonical Applications copy", () => {
  assert.deepEqual(getMacInstallInfo({ platform: "darwin", packaged: true, execPath: "/Applications/Daytrace.app/Contents/MacOS/Daytrace" }), {
    appName: "Daytrace", bundlePath: "/Applications/Daytrace.app", issue: "",
  });
});

test("macOS detects duplicate and mounted DMG copies", () => {
  assert.equal(getMacInstallInfo({ platform: "darwin", packaged: true, execPath: "/Applications/Daytrace 2.app/Contents/MacOS/Daytrace" }).issue, "duplicate-copy");
  assert.equal(getMacInstallInfo({ platform: "darwin", packaged: true, execPath: "/Volumes/Daytrace/Daytrace.app/Contents/MacOS/Daytrace" }).issue, "disk-image");
  assert.equal(getMacInstallInfo({ platform: "darwin", packaged: true, execPath: "/Users/test/Downloads/Daytrace.app/Contents/MacOS/Daytrace" }).issue, "outside-applications");
});

test("non-macOS platforms do not report a macOS install issue", () => {
  assert.deepEqual(getMacInstallInfo({ platform: "win32", packaged: true, execPath: "C:\\Program Files\\Daytrace\\Daytrace.exe" }), {
    appName: "Daytrace", bundlePath: "", issue: "",
  });
});

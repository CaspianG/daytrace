import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const windowsCollector = fs.readFileSync(path.join(root, "native", "windows-tracker", "Program.cs"), "utf8");
const macCollector = fs.readFileSync(path.join(root, "native", "macos-tracker", "main.swift"), "utf8");

test("Windows generic browser titles close the previous specific context", () => {
  assert.doesNotMatch(windowsCollector, /IsGenericTitle/);
  assert.match(windowsCollector, /snapshot\.Process == previous\.Process && snapshot\.Title == previous\.Title/);
});

test("native collectors expose aggregate activity but no typed values or pointer coordinates", () => {
  for (const source of [windowsCollector, macCollector]) {
    assert.doesNotMatch(source, /clipboard|pasteboard|GetClipboardData|NSEvent\.mouseLocation/i);
    assert.doesNotMatch(source, /kCGKeyboardEventUnicodeString|ToUnicodeEx|GetKeyboardState/i);
  }
  assert.match(macCollector, /options: \.listenOnly/);
  assert.match(windowsCollector, /GetLastInputInfo/);
});

test("macOS collector exposes a permission probe for its own TCC identity", () => {
  assert.match(macCollector, /--check-accessibility/);
  assert.match(macCollector, /--request-accessibility/);
  assert.match(macCollector, /AXIsProcessTrustedWithOptions/);
  assert.match(macCollector, /exit\(\(trusted \|\| AXIsProcessTrusted\(\)\) \? 0 : 77\)/);
});

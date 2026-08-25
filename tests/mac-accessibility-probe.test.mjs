import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import probeModule from "../electron/lib/mac-accessibility-probe.cjs";

const { collectorBundlePath, createMacAccessibilityProbe } = probeModule;
const executable = "/Applications/Daytrace.app/Contents/Helpers/Daytrace Activity Collector.app/Contents/MacOS/Daytrace Activity Collector";

function childThatExits(code, stderr = "") {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("exit", null, "SIGTERM");
  setImmediate(() => {
    if (stderr) child.stderr.write(stderr);
    child.stderr.end();
    child.emit("exit", code, null);
  });
  return child;
}

test("collector bundle path resolves the exact nested app", () => {
  assert.match(collectorBundlePath(executable).replaceAll("\\", "/"), /Daytrace Activity Collector\.app$/);
  assert.equal(collectorBundlePath("/tmp/daytrace-tracker"), "");
});

test("registration launches the collector app through LaunchServices then verifies its own TCC result", async () => {
  const launches = [];
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: (command, args) => {
      launches.push({ command, args });
      return childThatExits(0);
    },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(true), true);
  assert.equal(launches.length, 2);
  assert.equal(launches[0].command, "/usr/bin/open");
  assert.deepEqual(launches[0].args.slice(0, 2), ["-n", "-W"]);
  assert.match(launches[0].args[2].replaceAll("\\", "/"), /Daytrace Activity Collector\.app$/);
  assert.deepEqual(launches[0].args.slice(-2), ["--args", "--request-accessibility"]);
  assert.match(launches[1].command.replaceAll("\\", "/"), /Contents\/MacOS\/Daytrace Activity Collector$/);
  assert.deepEqual(launches[1].args, ["--check-accessibility"]);
  assert.deepEqual(diagnostics.map((item) => item.phase), ["registering", "trusted"]);
});

test("a successful LaunchServices open is never confused with a denied Accessibility grant", async () => {
  let launch = 0;
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: () => childThatExits(launch++ === 0 ? 0 : 77, "permission required"),
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(true), false);
  assert.equal(diagnostics.at(-1).phase, "denied");
  assert.equal(diagnostics.at(-1).code, 77);
});

test("collector launch failures remain visible as diagnostics instead of a silent false result", async () => {
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: () => { throw new Error("launch denied"); },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(true), false);
  assert.equal(diagnostics.at(-1).phase, "error");
  assert.match(diagnostics.at(-1).error, /launch denied/);
});

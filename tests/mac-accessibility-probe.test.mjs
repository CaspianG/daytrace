import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import net from "node:net";
import probeModule from "../electron/lib/mac-accessibility-probe.cjs";

const { COLLECTOR_BUNDLE_ID, collectorBundlePath, createMacAccessibilityProbe } = probeModule;
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

function respondToBundleProbe(args, trusted) {
  const port = Number(args[args.indexOf("--callback-port") + 1]);
  const token = args[args.indexOf("--callback-token") + 1];
  setImmediate(() => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.end(`${JSON.stringify({ type: "probe", token, trusted, pid: 42, error: trusted ? "" : "permission-required" })}\n`);
    });
  });
}

test("collector bundle path resolves the exact nested app", () => {
  assert.match(collectorBundlePath(executable).replaceAll("\\", "/"), /Daytrace Activity Collector\.app$/);
  assert.equal(collectorBundlePath("/tmp/daytrace-tracker"), "");
});

test("a denied direct preflight is confirmed through the real LaunchServices app identity", async () => {
  const launches = [];
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    randomBytes: () => Buffer.alloc(32, 7),
    spawn: (command, args) => {
      launches.push({ command, args });
      if (command === executable) return childThatExits(77, "permission required");
      respondToBundleProbe(args, true);
      return childThatExits(0);
    },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(false), true);
  assert.equal(launches.length, 2);
  assert.equal(launches[0].command, executable);
  assert.deepEqual(launches[0].args, ["--check-accessibility"]);
  assert.equal(launches[1].command, "/usr/bin/open");
  assert.deepEqual(launches[1].args.slice(0, 2), ["-n", "-g"]);
  assert.match(launches[1].args[2].replaceAll("\\", "/"), /\/Applications\/Daytrace\.app\/Contents\/Helpers\/Daytrace Activity Collector\.app$/);
  assert.equal(launches[1].args.includes("-W"), false);
  assert.equal(diagnostics.at(-1).phase, "trusted");
  assert.equal(diagnostics.at(-1).transport, "launch-services-callback");
  assert.equal(diagnostics.at(-1).bundleIdentifier, COLLECTOR_BUNDLE_ID);
});

test("registration waits for the collector callback instead of trusting the open command", async () => {
  const launches = [];
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: (command, args) => {
      launches.push({ command, args });
      respondToBundleProbe(args, false);
      return childThatExits(0);
    },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(true), false);
  assert.equal(launches.length, 1);
  assert.equal(launches[0].command, "/usr/bin/open");
  assert.equal(launches[0].args.includes("--request-accessibility"), true);
  assert.equal(diagnostics.at(-1).phase, "denied");
  assert.equal(diagnostics.at(-1).code, 77);
  assert.equal(diagnostics.at(-1).denialCount, 1);
});

test("a trusted direct preflight avoids an extra LaunchServices process", async () => {
  const launches = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: (command, args) => { launches.push({ command, args }); return childThatExits(0); },
  });

  assert.equal(await service.probe(false), true);
  assert.deepEqual(launches, [{ command: executable, args: ["--check-accessibility"] }]);
});

test("repair resets only the Daytrace collector Accessibility record", async () => {
  const launches = [];
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: (command, args) => { launches.push({ command, args }); return childThatExits(0); },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.reset(), true);
  assert.deepEqual(launches, [{ command: "/usr/bin/tccutil", args: ["reset", "Accessibility", COLLECTOR_BUNDLE_ID] }]);
  assert.deepEqual(diagnostics.map((item) => item.phase), ["repairing", "reset"]);
});

test("collector launch failures remain visible as diagnostics", async () => {
  const diagnostics = [];
  const service = createMacAccessibilityProbe({
    platform: "darwin",
    executablePath: () => executable,
    existsSync: () => true,
    spawn: (command) => {
      if (command === executable) return childThatExits(77);
      throw new Error("launch denied");
    },
    onDiagnostic: (value) => diagnostics.push(value),
  });

  assert.equal(await service.probe(false), false);
  assert.equal(diagnostics.at(-1).phase, "error");
  assert.match(diagnostics.at(-1).error, /launch denied/);
});

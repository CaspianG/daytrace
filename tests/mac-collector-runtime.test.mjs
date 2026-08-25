import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import net from "node:net";
import runtimeModule from "../electron/lib/mac-collector-runtime.cjs";

const { spawnMacCollectorBundle } = runtimeModule;
const executable = "/Applications/Daytrace.app/Contents/Helpers/Daytrace Activity Collector.app/Contents/MacOS/Daytrace Activity Collector";

function launcherThatExits(code = 0) {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("exit", null, "SIGTERM");
  setImmediate(() => child.emit("exit", code, null));
  return child;
}

function launchAndConnect(args, messages) {
  const port = Number(args[args.indexOf("--callback-port") + 1]);
  const token = args[args.indexOf("--callback-token") + 1];
  setImmediate(() => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      for (const message of messages(token)) socket.write(`${JSON.stringify(message)}\n`);
    });
  });
}

test("macOS runtime launches the collector app through LaunchServices and forwards authenticated events", async () => {
  const launches = [];
  let clientSocket;
  const child = spawnMacCollectorBundle({
    platform: "darwin",
    executablePath: executable,
    collectTitles: false,
    collectInput: true,
    randomBytes: () => Buffer.alloc(32, 3),
    spawn: (command, args) => {
      launches.push({ command, args });
      const port = Number(args[args.indexOf("--callback-port") + 1]);
      const token = args[args.indexOf("--callback-token") + 1];
      setImmediate(() => {
        clientSocket = net.createConnection({ host: "127.0.0.1", port }, () => {
          clientSocket.write(`${JSON.stringify({ type: "ready", token, pid: 314 })}\n`);
          clientSocket.write(`${JSON.stringify({ at: new Date().toISOString(), kind: "foreground", count: 1, app: "Safari", title: "Docs", context: "browser" })}\n`);
        });
      });
      return launcherThatExits();
    },
  });

  const [chunk] = await once(child.stdout, "data");
  const event = JSON.parse(String(chunk).trim());
  assert.equal(event.kind, "foreground");
  assert.equal(event.app, "Safari");
  assert.equal(launches[0].command, "/usr/bin/open");
  assert.equal(launches[0].args.includes("--stream-events"), true);
  assert.deepEqual(launches[0].args.slice(-4), ["--collect-titles", "0", "--collect-input", "1"]);
  clientSocket.destroy();
  child.kill();
});

test("macOS runtime rejects unauthenticated local clients", async () => {
  const child = spawnMacCollectorBundle({
    platform: "darwin",
    executablePath: executable,
    randomBytes: () => Buffer.alloc(32, 4),
    spawn: (_command, args) => {
      launchAndConnect(args, () => [{ type: "ready", token: "wrong-token", pid: 1 }]);
      return launcherThatExits();
    },
  });

  const [code] = await once(child, "exit");
  assert.equal(code, 70);
});

test("macOS runtime preserves the collector's permission-required exit", async () => {
  const child = spawnMacCollectorBundle({
    platform: "darwin",
    executablePath: executable,
    randomBytes: () => Buffer.alloc(32, 5),
    spawn: (_command, args) => {
      launchAndConnect(args, (token) => [{ type: "status", token, code: 77, error: "permission-required" }]);
      return launcherThatExits();
    },
  });

  const [code] = await once(child, "exit");
  assert.equal(code, 77);
});

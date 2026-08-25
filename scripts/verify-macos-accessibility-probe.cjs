const path = require("node:path");
const { createMacAccessibilityProbe } = require("../electron/lib/mac-accessibility-probe.cjs");

const executable = path.resolve(String(process.argv[2] || ""));
if (!executable) throw new Error("Collector executable path is required");

let diagnostic = null;
const probe = createMacAccessibilityProbe({
  platform: "darwin",
  executablePath: () => executable,
  onDiagnostic: (value) => { diagnostic = value; },
  log: (...values) => process.stderr.write(`${values.map(String).join(" ")}\n`),
});

probe.probe(false).then(() => {
  probe.stop();
  if (!diagnostic || !["trusted", "denied"].includes(diagnostic.phase) || diagnostic.transport !== "launch-services-callback") {
    throw new Error(`Collector Accessibility callback probe failed: ${JSON.stringify(diagnostic)}`);
  }
  process.stdout.write(`Verified collector Accessibility identity through ${diagnostic.transport}: ${diagnostic.phase}.\n`);
}).catch((error) => {
  probe.stop();
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});

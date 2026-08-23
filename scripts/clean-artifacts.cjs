const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const targets = [
  "dist",
  "release",
  "coverage",
  "test-results",
  path.join("node_modules", ".vite"),
  path.join("native", "windows-tracker", "bin"),
  path.join("native", "windows-tracker", "obj"),
  path.join("native", "macos-tracker", "build"),
];

for (const relative of targets) {
  const target = path.resolve(root, relative);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe clean target: ${target}`);
  if (!fs.existsSync(target)) continue;
  if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
  process.stdout.write(`${dryRun ? "Would remove" : "Removed"} ${path.relative(root, target)}\n`);
}

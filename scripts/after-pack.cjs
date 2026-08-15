const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const root = context.packager.projectDir;
  const executable = path.join(context.appOutDir, "Daytrace.exe");
  const icon = path.join(root, "build", "icon.ico");
  const rcedit = path.join(root, "node_modules", "rcedit", "bin", "rcedit-x64.exe");
  const version = context.packager.appInfo.version;

  await run(rcedit, [
    executable,
    "--set-icon", icon,
    "--set-file-version", version,
    "--set-product-version", version,
    "--set-version-string", "ProductName", "Daytrace",
    "--set-version-string", "FileDescription", "Daytrace — local activity history",
    "--set-version-string", "CompanyName", "Daytrace contributors",
    "--set-version-string", "LegalCopyright", "Copyright © Daytrace contributors",
  ]);
};

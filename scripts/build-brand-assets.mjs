import fs from "node:fs/promises";
import path from "node:path";
import pngToIco from "png-to-ico";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "build", "icon.png");
const destination = path.join(root, "build", "icon.ico");

await fs.writeFile(destination, await pngToIco(source));
console.log(`Wrote ${destination}`);

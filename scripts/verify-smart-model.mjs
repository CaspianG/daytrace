import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const model = path.join(root, "models", "daytrace-smart-v1.json");
const checksumFile = `${model}.sha256`;
const expected = fs.readFileSync(checksumFile, "utf8").match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase();
const actual = crypto.createHash("sha256").update(fs.readFileSync(model)).digest("hex");
if (!expected || expected !== actual) throw new Error(`Smart model checksum mismatch: expected ${expected || "missing"}, got ${actual}`);
const parsed = JSON.parse(fs.readFileSync(model, "utf8"));
if (parsed.format !== "daytrace-smart-model" || !parsed.version || Object.keys(parsed.weights || {}).length < 4) throw new Error("Smart model schema is invalid");
process.stdout.write(`Smart model ${parsed.version} verified: ${actual}\n`);

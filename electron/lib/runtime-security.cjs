const path = require("node:path");
const { fileURLToPath } = require("node:url");

function isTrustedRendererUrl(value, { packaged = false, rendererFile = "", devOrigin = "http://127.0.0.1:5173" } = {}) {
  try {
    const parsed = new URL(String(value || ""));
    if (!packaged) {
      const expected = new URL(devOrigin);
      return parsed.protocol === "http:" && parsed.origin === expected.origin;
    }
    if (parsed.protocol !== "file:" || !rendererFile) return false;
    return path.resolve(fileURLToPath(parsed)) === path.resolve(rendererFile);
  } catch {
    return false;
  }
}

function isSafeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname === "github.com") return parsed.pathname === "/CaspianG/daytrace" || parsed.pathname.startsWith("/CaspianG/daytrace/");
    if (parsed.hostname === "www.virustotal.com") return /^\/gui\/file\/[a-f0-9]{64}(?:\/|$)/i.test(parsed.pathname);
    return false;
  } catch {
    return false;
  }
}

function assertTrustedIpcSender(event, { expectedWebContents, packaged, rendererFile, devOrigin } = {}) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
  if (!expectedWebContents || event?.sender !== expectedWebContents || !isTrustedRendererUrl(senderUrl, { packaged, rendererFile, devOrigin })) {
    throw new Error("Untrusted IPC sender");
  }
}

module.exports = { assertTrustedIpcSender, isSafeExternalUrl, isTrustedRendererUrl };

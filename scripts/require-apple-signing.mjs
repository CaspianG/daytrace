const requiredSigning = ["CSC_LINK", "CSC_KEY_PASSWORD"];
const apiKeyAuth = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"];
const appleIdAuth = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

const missingSigning = requiredSigning.filter((name) => !process.env[name]);
const hasApiKeyAuth = apiKeyAuth.every((name) => process.env[name]);
const hasAppleIdAuth = appleIdAuth.every((name) => process.env[name]);

if (missingSigning.length || (!hasApiKeyAuth && !hasAppleIdAuth)) {
  const details = [
    missingSigning.length ? `missing ${missingSigning.join(", ")}` : "",
    !hasApiKeyAuth && !hasAppleIdAuth ? "missing a complete Apple notarization credential set" : "",
  ].filter(Boolean).join("; ");
  throw new Error(`Refusing to publish an unsigned or unnotarized macOS release: ${details}`);
}

console.log("Apple signing and notarization credentials are configured.");

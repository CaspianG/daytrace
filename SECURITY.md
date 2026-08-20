# Security policy

Daytrace observes foreground application metadata and aggregate input activity, so privacy regressions are treated as security issues.

## Supported versions

Security fixes are provided for the latest published release.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose user activity or bypass exclusions. Use GitHub's **Report a vulnerability** flow in the Security tab of this repository.

Include:

- the affected Daytrace version;
- Windows version and browser/application involved;
- reproduction steps with synthetic, non-sensitive data;
- the expected and observed privacy boundary.

Please do not include real window titles, event journals, passwords, or personal screenshots.

## Security boundary

Daytrace must never persist screenshots, audio, clipboard contents, mouse coordinates, key identities, typed text, form values, or passwords. Active application names and window titles are sensitive metadata and must remain local.

On macOS, Daytrace creates journals, settings, generated workflow drafts, and updater logs with owner-only permissions. The packaged Electron window rejects remote navigation and webviews, uses a restrictive Content Security Policy, and accepts privileged IPC calls only from the exact local renderer webContents and URL.

Private-mode detection is title-based and best-effort. Excluding the entire browser or application is the stronger control for sensitive workflows.

Local data relies on operating-system account permissions and is not independently encrypted at rest. Full-disk encryption such as BitLocker or FileVault is recommended for protection while the device is powered off.

## Update integrity and network boundary

Installed builds normally check `api.github.com/repos/CaspianG/daytrace/releases/latest`. If GitHub rate-limits that anonymous endpoint, Daytrace reads the public Releases feed and that release's `SHA256SUMS.txt`. The request contains a standard GitHub media type and a `Daytrace/<installed version>` user agent; activity journals, window titles, questions, rules, and settings are never transmitted.

Only stable releases and exact platform artifact names from `github.com/CaspianG/daytrace/releases/` are accepted. Before an installer is opened, its size and GitHub-published SHA-256 digest are verified. Daytrace refuses automatic installation when the digest is missing or does not match.

Repository automation uses commit-pinned GitHub Actions, least-privilege release permissions, weekly CodeQL analysis, and Dependabot update monitoring. These controls reduce supply-chain risk but do not replace platform code signing; current public Windows and macOS artifacts remain unsigned.

The macOS updater retains the previous bundle until the new renderer and IPC bridge confirm readiness, then automatically rolls back on failure. The Windows NSIS path verifies the downloaded digest and requests a relaunch but does not yet provide the same post-launch rollback handshake.

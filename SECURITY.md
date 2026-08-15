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

Private-mode detection is title-based and best-effort. Excluding the entire browser or application is the stronger control for sensitive workflows.

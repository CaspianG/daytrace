# Daytrace Browser Companion

This optional unpacked extension sends only the foreground tab title, domain and URL path to the Daytrace native-messaging host on the same computer. It checks that the browser window itself is focused, so a background tab update cannot be recorded as active work.

- Query strings, fragments, credentials and page contents are never sent.
- Incognito/private use is disabled by the manifest and rejected again by Daytrace.
- The extension does not use a network API. Its only connection is Chromium native messaging to Daytrace.

Install the native host from **Daytrace → Settings → Browser companion**, then open the extension folder from the same screen and load it as an unpacked extension in Chrome, Edge, Brave or Vivaldi.

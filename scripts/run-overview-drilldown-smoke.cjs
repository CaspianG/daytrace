const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const entry = path.join(__dirname, "..", "dist", "client", "index.html");
  const window = new BrowserWindow({
    width: 1040,
    height: 820,
    show: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#fbfaf7",
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  const rendererErrors = [];
  window.webContents.on("console-message", (details) => { if (details.level === "error") rendererErrors.push(details.message); });

  for (const [language, expectedPurpose, expectedNewest] of [["en", "Personal", "Newest first"], ["ru", "Личное", "Сначала новое"]]) {
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=dark`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady && document.querySelector('.ranked-row-button[data-intent=personal]') ? resolve() : Date.now() >= deadline ? reject(new Error('Purpose breakdown controls did not render')) : setTimeout(check, 25); check(); })");
    const opened = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('.ranked-row-button[data-intent="personal"]').click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const dialog = document.querySelector('.intent-details-dialog');
      const rect = dialog?.getBoundingClientRect();
      return {
        title: dialog?.querySelector('h2')?.textContent?.trim() || '',
        newest: dialog?.querySelector('.intent-details-heading small')?.textContent?.trim() || '',
        activities: dialog?.querySelectorAll('.intent-details-list article').length || 0,
        telegram: dialog?.textContent?.includes('Telegram Desktop') || false,
        dark: document.documentElement.dataset.theme === 'dark',
        inside: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
        bounds: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight } : null,
        overflow: dialog ? dialog.scrollWidth - dialog.clientWidth : 999,
      };
    })()`);
    if (opened.title !== expectedPurpose || opened.newest !== expectedNewest || opened.activities < 1 || !opened.telegram || !opened.dark || !opened.inside || opened.overflow > 1) throw new Error(`Purpose breakdown failed in ${language}: ${JSON.stringify(opened)}`);
    if (process.argv.includes("--capture") && language === "ru") {
      const screenshotPath = path.join(os.tmpdir(), "daytrace-purpose-breakdown-ru.png");
      window.setPosition(-10000, -10000, false);
      window.showInactive();
      window.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 220));
      fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
      process.stdout.write(`Purpose breakdown preview: ${screenshotPath}\n`);
    }
    await window.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); new Promise((resolve) => setTimeout(resolve, 30))");
    if (await window.webContents.executeJavaScript("Boolean(document.querySelector('.intent-details-dialog'))")) throw new Error(`Purpose breakdown did not close with Escape in ${language}`);
  }
  if (rendererErrors.length) throw new Error(`Purpose breakdown renderer errors:\n${rendererErrors.join("\n")}`);
  window.destroy();
  process.stdout.write("Purpose rows open exact local activity details in English and Russian, including dark mode and Escape close.\n");
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

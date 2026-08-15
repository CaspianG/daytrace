const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "docs", "assets", "screenshots");
  const entry = path.join(__dirname, "..", "dist", "client", "index.html");
  fs.mkdirSync(output, { recursive: true });

  const window = new BrowserWindow({
    width: 1488,
    height: 1058,
    show: false,
    backgroundColor: "#fbfaf7",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  for (const language of ["en", "ru"]) {
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}`);
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `timeline-${language}.png`), image.toPNG());
  }
  window.destroy();
  app.quit();
});

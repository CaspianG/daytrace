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
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(1)').click(); new Promise(resolve => setTimeout(resolve, 250))");
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `timeline-${language}.png`), image.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.app-main').scrollTo({ top: 790, behavior: 'instant' }); new Promise(resolve => setTimeout(resolve, 250))");
    const purpose = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `purpose-${language}.png`), purpose.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); document.querySelector('.app-main').scrollTop = 0; new Promise(resolve => setTimeout(resolve, 250))");
    const settings = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `settings-${language}.png`), settings.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.intent-rule-editor').scrollIntoView({ block: 'center' }); new Promise(resolve => setTimeout(resolve, 250))");
    const rules = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `rules-${language}.png`), rules.toPNG());
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&update=available`);
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); new Promise(resolve => setTimeout(resolve, 250))");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250))");
    const updates = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `updates-${language}.png`), updates.toPNG());
  }
  window.destroy();
  app.quit();
});

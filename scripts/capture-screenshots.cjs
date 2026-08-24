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
  const consoleErrors = [];
  window.webContents.on("console-message", (details) => { if (details.level === "error") consoleErrors.push(details.message); });
  for (const language of ["en", "ru"]) {
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(1)').click(); new Promise(resolve => setTimeout(resolve, 250))");
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `timeline-${language}.png`), image.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.day-nav > button:first-child').click(); new Promise(resolve => setTimeout(resolve, 220))");
    const selectedDateState = await window.webContents.executeJavaScript("({ heading: document.querySelector('.date-copy h1').textContent, button: document.querySelector('.date-picker-button span').textContent })");
    if (/today|сегодня/i.test(`${selectedDateState.heading} ${selectedDateState.button}`)) throw new Error(`Selected date did not replace Today in ${language}`);
    await window.webContents.executeJavaScript("document.querySelector('.date-picker-button').click(); new Promise(resolve => setTimeout(resolve, 220))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.calendar-popover [aria-pressed=true]'))")) throw new Error(`Calendar selection is missing in ${language}`);
    const calendar = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `calendar-${language}.png`), calendar.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.calendar-popover footer button').click(); new Promise(resolve => setTimeout(resolve, 120))");
    await window.webContents.executeJavaScript("document.querySelector('.rhythm-card').scrollIntoView({ block: 'center' }); document.querySelectorAll('.rhythm-hour')[1].click(); new Promise(resolve => setTimeout(resolve, 120))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.rhythm-detail .rhythm-apps'))")) throw new Error(`Activity rhythm details are missing in ${language}`);
    const rhythm = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `rhythm-${language}.png`), rhythm.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.app-main').scrollTo({ top: 790, behavior: 'instant' }); new Promise(resolve => setTimeout(resolve, 250))");
    const purpose = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `purpose-${language}.png`), purpose.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); document.querySelector('.app-main').scrollTop = 0; new Promise(resolve => setTimeout(resolve, 250))");
    const settings = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `settings-${language}.png`), settings.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.retention-settings').scrollIntoView({ block: 'center' }); new Promise(resolve => setTimeout(resolve, 250))");
    if (await window.webContents.executeJavaScript("document.querySelectorAll('.retention-options button').length") !== 5) throw new Error(`Retention presets are incomplete in ${language}`);
    const retention = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `retention-${language}.png`), retention.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.intent-rule-editor').scrollIntoView({ block: 'center' }); new Promise(resolve => setTimeout(resolve, 250))");
    const rules = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `rules-${language}.png`), rules.toPNG());
    for (const [selector, name] of [[".smart-analysis-section", "smart-analysis"], [".browser-companion-section", "browser-companion"], [".system-section", "diagnostics"], [".data-section", "data-portability"]]) {
      if (!await window.webContents.executeJavaScript(`Boolean(document.querySelector('${selector}'))`)) throw new Error(`${name} section is missing in ${language}`);
      await window.webContents.executeJavaScript(`document.querySelector('${selector}').scrollIntoView({ block: 'center' }); new Promise(resolve => setTimeout(resolve, 250))`);
      if (name === "diagnostics") await window.webContents.executeJavaScript("document.querySelector('.diagnostics-settings button').click(); new Promise(resolve => setTimeout(resolve, 250))");
      const section = await window.webContents.capturePage();
      fs.writeFileSync(path.join(output, `${name}-${language}.png`), section.toPNG());
    }
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&update=downloading`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace update preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); new Promise(resolve => setTimeout(resolve, 250))");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250))");
    const updates = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `updates-${language}.png`), updates.toPNG());
  }
  if (consoleErrors.length) throw new Error(`Renderer console errors:\n${consoleErrors.join("\n")}`);
  window.destroy();
  // capturePage may leave Chromium utility processes alive on Windows after
  // app.quit(); this script is a one-shot build tool, so exit explicitly once
  // every localized file has been flushed to disk.
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

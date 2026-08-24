const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "docs", "assets", "screenshots");
  const entry = path.join(__dirname, "..", "dist", "client", "index.html");
  const requestedLanguage = process.argv[2];
  if (requestedLanguage && !["en", "ru"].includes(requestedLanguage)) throw new Error(`Unsupported screenshot language: ${requestedLanguage}`);
  const languages = requestedLanguage ? [requestedLanguage] : ["en", "ru"];
  fs.mkdirSync(output, { recursive: true });

  const consoleErrors = [];
  const createCaptureWindow = () => {
    const captureWindow = new BrowserWindow({
      width: 1487,
      height: 1058,
      useContentSize: true,
      show: false,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      backgroundColor: "#fbfaf7",
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    captureWindow.webContents.on("console-message", (details) => { if (details.level === "error") consoleErrors.push(details.message); });
    return captureWindow;
  };
  const assertQuickTourLayout = async (captureWindow, label) => {
    const layout = await captureWindow.webContents.executeJavaScript("(() => { const card = document.querySelector('.quick-tour-card'); const spotlight = document.querySelector('.quick-tour-spotlight'); if (!card) return null; const rect = card.getBoundingClientRect(); return { cardInside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, cardOverflow: card.scrollHeight - card.clientHeight, spotlightVisible: Boolean(spotlight && spotlight.getBoundingClientRect().width > 2), heading: document.querySelector('#quick-tour-title')?.textContent || '' }; })()");
    if (!layout?.cardInside || layout.cardOverflow > 1 || !layout.spotlightVisible || !layout.heading) throw new Error(`Quick tour layout failed in ${label}: ${JSON.stringify(layout)}`);
  };
  let window = createCaptureWindow();
  for (const [languageIndex, language] of languages.entries()) {
    if (languageIndex > 0) {
      const previousWindow = window;
      window = createCaptureWindow();
      previousWindow.destroy();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=mac-permission&theme=light`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace macOS permission preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 1250))");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.permission-onboarding-card .permission-close'))")) throw new Error(`Dismissible macOS permission dialog is missing in ${language}`);
    await window.webContents.executeJavaScript("document.querySelector('.permission-onboarding-card').scrollTop = 0; const repaint = [...document.querySelectorAll('.permission-close, .permission-onboarding-card > .onboarding-logo')]; repaint.forEach((node) => { node.style.visibility = 'hidden'; }); void document.body.offsetHeight; new Promise(resolve => requestAnimationFrame(() => { repaint.forEach((node) => { node.style.visibility = 'visible'; }); requestAnimationFrame(() => setTimeout(resolve, 650)); }))");
    const permissionChromeReady = await window.webContents.executeJavaScript("[...document.querySelectorAll('.permission-close, .permission-onboarding-card > .onboarding-logo')].every((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility === 'visible' && style.opacity === '1' && rect.width > 0 && rect.height > 0; })");
    if (!permissionChromeReady) throw new Error(`macOS permission dialog chrome did not render in ${language}`);
    window.setPosition(-10000, -10000, false);
    window.showInactive();
    window.webContents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await window.webContents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const macPermission = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `mac-permission-${language}.png`), macPermission.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.permission-close').click(); new Promise(resolve => setTimeout(resolve, 120))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.app-shell')) && !document.querySelector('.permission-onboarding-card')")) throw new Error(`macOS permission dialog still blocks the application in ${language}`);
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); new Promise(resolve => setTimeout(resolve, 120))");
    const permissionSettingsLayout = await window.webContents.executeJavaScript("(() => { const card = document.querySelector('.permission-card'); const copy = document.querySelector('.permission-copy'); const buttons = [...document.querySelectorAll('.permission-actions button')]; if (!card || !copy || buttons.length !== 3) return null; const cardRect = card.getBoundingClientRect(); const inside = buttons.every((button) => { const rect = button.getBoundingClientRect(); return rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1; }); return { inside, copyWidth: copy.getBoundingClientRect().width, overflow: card.scrollWidth - card.clientWidth }; })()");
    if (!permissionSettingsLayout?.inside || permissionSettingsLayout.copyWidth < 300 || permissionSettingsLayout.overflow > 1) throw new Error(`macOS permission settings layout overflowed in ${language}: ${JSON.stringify(permissionSettingsLayout)}`);

    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=light&onboarding=1&tourStep=2`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace onboarding preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 650))");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.onboarding-model-grid'))")) throw new Error(`Model onboarding is missing in ${language}`);
    const onboarding = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `onboarding-${language}.png`), onboarding.toPNG());

    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=light&tour=1`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace quick tour preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 650)))");
    await assertQuickTourLayout(window, `${language} light`);
    const quickTour = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `quick-tour-${language}.png`), quickTour.toPNG());
    window.setContentSize(820, 700, false);
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250))");
    await assertQuickTourLayout(window, `${language} compact`);
    const compactQuickTour = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `quick-tour-compact-${language}.png`), compactQuickTour.toPNG());
    window.setContentSize(1487, 1058, false);
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250))");
    for (let guideStep = 0; guideStep < 3; guideStep += 1) await window.webContents.executeJavaScript("document.querySelector('.quick-tour-next').click(); new Promise(resolve => setTimeout(resolve, 450))");
    await assertQuickTourLayout(window, `${language} analysis step`);
    if (!await window.webContents.executeJavaScript("document.querySelector('[data-tour=analysis]')?.getBoundingClientRect().height > 2")) throw new Error(`Analysis target is hidden in ${language} quick tour`);
    const quickTourAnalysis = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `quick-tour-analysis-${language}.png`), quickTourAnalysis.toPNG());

    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=light`);
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
      if (name === "smart-analysis") {
        await window.webContents.executeJavaScript("document.querySelectorAll('.analysis-mode-card')[2].click(); new Promise(resolve => setTimeout(resolve, 220))");
        if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.engine-quality-panel'))")) throw new Error(`Engine quality comparison is missing in ${language}`);
        const analysisQuality = await window.webContents.capturePage();
        fs.writeFileSync(path.join(output, `analysis-quality-${language}.png`), analysisQuality.toPNG());
      }
    }
    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=light&update=downloading`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace update preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); new Promise(resolve => setTimeout(resolve, 250))");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250))");
    const updates = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `updates-${language}.png`), updates.toPNG());

    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=light&review=1`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace review preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 1250)))");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.review-coach'))")) throw new Error(`Review coach is missing in ${language}`);
    const reviewCoach = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `review-coach-${language}.png`), reviewCoach.toPNG());

    await window.loadURL(`${pathToFileURL(entry).href}?lang=${language}&capture=desktop&theme=dark`);
    await window.webContents.executeJavaScript("new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => window.__daytraceAppReady ? resolve() : Date.now() >= deadline ? reject(new Error('Daytrace dark appearance preview did not become ready')) : setTimeout(check, 25); check(); })");
    await window.webContents.executeJavaScript("document.documentElement.classList.add('capture'); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await window.webContents.executeJavaScript("document.querySelector('.main-nav button:nth-child(3)').click(); new Promise((resolve, reject) => { const deadline = Date.now() + 3000; const check = () => { const section = document.querySelector('.appearance-section'); if (section) { document.querySelector('.app-main').scrollTop = 0; resolve(); } else if (Date.now() >= deadline) reject(new Error('Appearance settings did not open')); else setTimeout(check, 25); }; check(); })");
    await window.webContents.executeJavaScript("new Promise(resolve => setTimeout(resolve, 250)).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    if (await window.webContents.executeJavaScript("document.querySelectorAll('.theme-options button').length") !== 3) throw new Error(`Theme choices are incomplete in ${language}`);
    if (!await window.webContents.executeJavaScript("document.documentElement.dataset.theme === 'dark'")) throw new Error(`Dark theme did not apply in ${language}`);
    const darkAppearance = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `appearance-dark-${language}.png`), darkAppearance.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.smart-analysis-section').scrollIntoView({ block: 'center' }); new Promise(resolve => setTimeout(resolve, 250))");
    await window.webContents.executeJavaScript("document.querySelectorAll('.analysis-mode-card')[2].click(); new Promise(resolve => setTimeout(resolve, 220))");
    if (!await window.webContents.executeJavaScript("document.documentElement.dataset.theme === 'dark' && Boolean(document.querySelector('.engine-quality-panel'))")) throw new Error(`Dark engine quality comparison is missing in ${language}`);
    const darkAnalysisQuality = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `analysis-quality-dark-${language}.png`), darkAnalysisQuality.toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.sidebar-tour-button').click(); new Promise(resolve => setTimeout(resolve, 650))");
    await assertQuickTourLayout(window, `${language} dark`);
    const darkQuickTour = await window.webContents.capturePage();
    fs.writeFileSync(path.join(output, `quick-tour-dark-${language}.png`), darkQuickTour.toPNG());
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

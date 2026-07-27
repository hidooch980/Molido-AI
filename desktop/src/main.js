'use strict';

/**
 * فرایند اصلی Electron.
 *
 * ترتیب راه‌اندازی:
 *   splash → بررسی پورت‌ها → PostgreSQL → اسکیما → seed → بک‌اند → وب → پنجره اصلی
 */

const path = require('node:path');
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');

// قفل تک‌نمونه باید پیش از هر کار سنگینی گرفته شود.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const { paths, verifyResources } = require('./paths');
const { PORTS } = require('./config');
const log = require('./log');
const postgres = require('./postgres');
const services = require('./services');

let splashWindow = null;
let mainWindow = null;
let shuttingDown = false;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 380,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function status(text) {
  log.info(text);

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status', text);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Molido AI',
    webPreferences: {
      // داشبورد یک برنامه وب محلی است و به هیچ API داخلی Electron نیاز ندارد.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://127.0.0.1:${PORTS.web}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
  });

  // لینک‌های بیرونی در مرورگر پیش‌فرض باز شوند، نه داخل برنامه.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return { action: 'allow' };
    }

    shell.openExternal(url);

    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** نمایش خطا روی splash و سپس دیالوگ، بعد خروج. */
function fail(error) {
  const message = error && error.message ? error.message : String(error);

  log.error(message);

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('failed', message);
  }

  dialog.showErrorBox(
    'راه‌اندازی Molido AI ناموفق بود',
    `${message}\n\nفایل لاگ:\n${log.file}`,
  );

  shutdown(1);
}

async function boot() {
  createSplash();

  status('بررسی منابع برنامه…');
  verifyResources();

  status('بررسی پورت‌ها…');
  await services.assertPortFree(PORTS.postgres, 'دیتابیس');
  await services.assertPortFree(PORTS.api, 'بک‌اند');
  await services.assertPortFree(PORTS.web, 'رابط وب');

  status('راه‌اندازی دیتابیس…');
  await postgres.start();

  status('همگام‌سازی ساختار دیتابیس…');
  await services.applySchema();

  status('آماده‌سازی داده اولیه…');
  await services.seedIfNeeded();

  status('راه‌اندازی بک‌اند…');
  await services.startBackend();

  status('راه‌اندازی رابط کاربری…');
  await services.startWeb();

  status('آماده');
  createMainWindow();
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  services.stopAll();
  await postgres.stop();

  app.exit(exitCode);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  boot().catch(fail);
});

app.on('window-all-closed', () => {
  shutdown(0);
});

// خاموشی تمیز: پنجره‌ها بسته می‌شوند ولی قبل از خروج باید دیتابیس متوقف شود.
app.on('before-quit', (event) => {
  if (!shuttingDown) {
    event.preventDefault();
    shutdown(0);
  }
});

process.on('uncaughtException', (error) => {
  log.error(`خطای مدیریت‌نشده: ${error.stack || error.message}`);
});

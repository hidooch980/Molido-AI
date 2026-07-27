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
const backup = require('./backup');

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

  Menu.setApplicationMenu(buildMenu());

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

/**
 * منوی برنامه — پشتیبان‌گیری و بازیابی دستی.
 *
 * پشتیبان‌گیری نیازمند توقف دیتابیس است، بنابراین هر دو عملیات کل
 * سرویس‌ها را متوقف و دوباره راه‌اندازی می‌کنند.
 */
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'پشتیبان‌گیری',
      submenu: [
        {
          label: 'گرفتن پشتیبان هم‌اکنون…',
          click: () => void manualBackup(),
        },
        {
          label: 'بازیابی از پشتیبان…',
          click: () => void manualRestore(),
        },
        { type: 'separator' },
        {
          label: 'باز کردن پوشه پشتیبان‌ها',
          click: () => void shell.openPath(backup.BACKUP_DIR),
        },
      ],
    },
    {
      label: 'راهنما',
      submenu: [
        {
          label: 'نمایش فایل لاگ',
          click: () => void shell.openPath(log.file),
        },
        {
          label: 'درباره',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Molido AI',
              message: `Molido AI نسخه ${app.getVersion()}`,
              detail:
                `پشتیبان خودکار: هر ${backup.INTERVAL_HOURS} ساعت هنگام خروج\n` +
                `تعداد نسخه نگهداری‌شده: ${backup.KEEP}\n\n` +
                `پوشه داده:\n${paths.userData}`,
            }),
        },
      ],
    },
  ]);
}

/** توقف سرویس‌ها، اجرای کار، سپس راه‌اندازی مجدد. */
async function withServicesStopped(label, action) {
  services.stopAll();
  await postgres.stop();

  try {
    return await action();
  } finally {
    try {
      await postgres.start();
      await services.startBackend();
      await services.startWeb();

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    } catch (error) {
      log.error(`راه‌اندازی مجدد پس از ${label} ناموفق بود: ${error.message}`);
      dialog.showErrorBox(
        'خطا',
        `پس از ${label} راه‌اندازی مجدد ناموفق بود.\n\n${error.message}\n\n` +
          'لطفاً برنامه را ببندید و دوباره باز کنید.',
      );
    }
  }
}

async function manualBackup() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['گرفتن پشتیبان', 'انصراف'],
    defaultId: 0,
    cancelId: 1,
    title: 'پشتیبان‌گیری',
    message: 'برای پشتیبان‌گیری، برنامه چند لحظه متوقف می‌شود.',
    detail: 'پس از پایان، به‌طور خودکار دوباره راه‌اندازی می‌شود.',
  });

  if (response !== 0) return;

  const file = await withServicesStopped('پشتیبان‌گیری', async () =>
    backup.create(),
  );

  if (file) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'پشتیبان‌گیری',
      message: 'پشتیبان با موفقیت ساخته شد.',
      detail: file,
    });
  } else {
    dialog.showErrorBox('پشتیبان‌گیری', `ناموفق بود — جزئیات در ${log.file}`);
  }
}

async function manualRestore() {
  const backups = backup.list();

  if (backups.length === 0) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'بازیابی',
      message: 'هیچ پشتیبانی موجود نیست.',
    });

    return;
  }

  const labels = backups.map(
    (b) =>
      `${b.name}  (${(b.size / 1048576).toFixed(1)}MB — ` +
      `${new Date(b.mtime).toLocaleString('fa-IR')})`,
  );

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: [...labels, 'انصراف'],
    cancelId: labels.length,
    title: 'بازیابی از پشتیبان',
    message: 'کدام پشتیبان بازیابی شود؟',
    detail:
      'داده فعلی با محتوای پشتیبان جایگزین می‌شود.\n' +
      'نسخه فعلی پیش از جایگزینی کنار گذاشته می‌شود و از بین نمی‌رود.',
  });

  if (response >= labels.length) return;

  const chosen = backups[response];

  try {
    const result = await withServicesStopped('بازیابی', async () =>
      backup.restore(chosen.path),
    );

    await dialog.showMessageBox({
      type: 'info',
      title: 'بازیابی',
      message: 'بازیابی با موفقیت انجام شد.',
      detail:
        `${result.fileCount} فایل بازیابی شد.\n` +
        `نسخه قبلی در این مسیر نگهداری شد:\n${result.previous}`,
    });
  } catch (error) {
    dialog.showErrorBox('بازیابی', `ناموفق بود:\n\n${error.message}`);
  }
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

  // پشتیبان‌گیری فقط پس از توقف کامل دیتابیس معنا دارد؛ همین‌جا امن‌ترین
  // نقطه است چون کلاستر تازه به صورت تمیز بسته شده است.
  try {
    backup.createIfDue();
  } catch (error) {
    log.warn(`پشتیبان‌گیری هنگام خروج ناموفق بود: ${error.message}`);
  }

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

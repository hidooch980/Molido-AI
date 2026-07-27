'use strict';

/**
 * پل امن بین صفحه splash و فرایند اصلی.
 * فقط دو رویداد یک‌طرفه بیرون داده می‌شود — نه دسترسی کامل به ipcRenderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('molidoSplash', {
  onStatus: (callback) =>
    ipcRenderer.on('status', (_event, text) => callback(String(text))),
  onFailed: (callback) =>
    ipcRenderer.on('failed', (_event, message) => callback(String(message))),
});

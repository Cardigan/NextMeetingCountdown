'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('countdownAPI', {
  onTick: (callback) => {
    ipcRenderer.on('tick', (_event, payload) => callback(payload));
  },
  onSettings: (callback) => {
    ipcRenderer.on('countdown-settings', (_event, payload) => callback(payload));
  },
  quit: () => ipcRenderer.send('quit-app'),
  openEditor: () => ipcRenderer.send('open-editor'),
  openSettings: () => ipcRenderer.send('open-settings'),
  showContextMenu: (key) => ipcRenderer.send('countdown:context-menu', key),
  getPosition: () => ipcRenderer.invoke('countdown:get-position'),
  moveTo: (x, y) => ipcRenderer.send('countdown:move-to', x, y),
});

contextBridge.exposeInMainWorld('flashAPI', {
  onFlash: (callback) => {
    ipcRenderer.on('flash', (_event, payload) => callback(payload));
  },
  onSettings: (callback) => {
    ipcRenderer.on('flash-settings', (_event, payload) => callback(payload));
  },
});

contextBridge.exposeInMainWorld('editorAPI', {
  getMeetings: () => ipcRenderer.invoke('meetings:get'),
  saveMeetings: (config) => ipcRenderer.invoke('meetings:save', config),
  close: () => ipcRenderer.send('close-editor'),
});

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  testFlash: () => ipcRenderer.send('test-flash'),
  close: () => ipcRenderer.send('close-settings'),
  getMeetingsPath: () => ipcRenderer.invoke('meetings:get-path'),
  chooseMeetingsPath: () => ipcRenderer.invoke('meetings:choose-path'),
  resetMeetingsPath: () => ipcRenderer.invoke('meetings:reset-path'),
});

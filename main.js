'use strict';

const { app, BrowserWindow, ipcMain, screen, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { getNextMeeting, formatRemaining } = require('./lib/schedule');

// Fixed app name so userData paths are stable & predictable regardless of
// how package.json's "name"/"productName" are set.
app.setName('CalendarTimer');

// This app has no GPU-heavy rendering, so skip the GPU shader disk cache
// entirely. On machines with real-time antivirus scanning, Chromium's cache
// rename-on-startup can hit a transient file lock and spam harmless
// "Unable to move the cache: Access is denied" errors to stderr; disabling
// the cache avoids that startup rename altogether.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Only one instance may run at a time. Without this, auto-start-at-login
// plus a manual launch (or a double-click) can race on the same userData
// disk/GPU cache, producing "Unable to move the cache: Access is denied"
// Chromium errors. If another instance already holds the lock, quit
// immediately instead of competing for the same files.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const AUTOSTART_ARG = '--autostart';
const APP_STATE_FILE = path.join(app.getPath('userData'), 'app-state.json');
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const TICK_MS = 1000;
const FLASH_DURATION_MS = 1000; // flashes must fit within 1 second total

// User-configurable app behavior/appearance. Persisted to settings.json in
// userData (not gitignored-sensitive -- just display/behavior prefs).
const DEFAULT_SETTINGS = {
  flashColor: '#ffffff',
  flashOpacity: 0.55,
  flashCount: 2,
  soundEnabled: false,
  flashAt5Min: true,
  flashAt1Min: true,
  flashAtStart: true,
  secondsDisplay: 'auto',
  countdownColor: '#181a20',
  countdownOpacity: 0.88,
  countdownSize: 'medium',
  // Empty string = use the auto-resolved default location (dev project
  // folder, or userData once packaged). Non-empty = user-chosen custom path.
  meetingsPath: '',
};

const COUNTDOWN_SIZE_PRESETS = {
  small: { width: 190, height: 80, scale: 0.82 },
  medium: { width: 230, height: 94, scale: 1 },
  large: { width: 290, height: 116, scale: 1.3 },
};

function getCountdownSizePreset() {
  return COUNTDOWN_SIZE_PRESETS[appSettings.countdownSize] || COUNTDOWN_SIZE_PRESETS.medium;
}

let countdownWindow = null;
let flashWindow = null;
let editorWindow = null;
let settingsWindow = null;
let meetingsConfig = {};
let appSettings = { ...DEFAULT_SETTINGS };
let MEETINGS_FILE;
let isFirstRunMeetings = false;

// --- Meetings config loading (with hot-reload on manual edits) ---

// In dev (unpackaged) we read/watch the project's meetings.json directly.
// Once packaged, the app's own files live read-only inside app.asar, so we
// copy the seed meetings.json out to userData on first run and use that
// copy from then on — this is the file the user edits going forward.
//
// meetings.json is gitignored (it's personal data), so a fresh clone or a
// from-source build won't have one yet — fall back to the committed
// meetings.example.json template in that case.
function seedFilePath() {
  const real = path.join(__dirname, 'meetings.json');
  if (fs.existsSync(real)) return real;
  return path.join(__dirname, 'meetings.example.json');
}

// Resolves the auto-managed default location (ignores any user-chosen
// custom path override) — dev project folder, or userData once packaged.
function resolveDefaultMeetingsFilePath() {
  if (!app.isPackaged) {
    const devPath = path.join(__dirname, 'meetings.json');
    if (!fs.existsSync(devPath)) {
      isFirstRunMeetings = true;
      try {
        fs.copyFileSync(seedFilePath(), devPath);
      } catch (err) {
        console.error('Failed to seed meetings.json from example:', err.message);
      }
    }
    return devPath;
  }
  const userPath = path.join(app.getPath('userData'), 'meetings.json');
  if (!fs.existsSync(userPath)) {
    isFirstRunMeetings = true;
    try {
      fs.mkdirSync(path.dirname(userPath), { recursive: true });
      fs.copyFileSync(seedFilePath(), userPath);
    } catch (err) {
      console.error('Failed to seed meetings.json into userData:', err.message);
    }
  }
  return userPath;
}

// Seeds a brand-new file at an arbitrary custom path (chosen by the user
// via Settings) from the current in-memory meetings, falling back to the
// example template if nothing's loaded yet.
function ensureCustomMeetingsFileExists(filePath) {
  if (fs.existsSync(filePath)) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const seedSource = hasAnyMeetings()
      ? JSON.stringify(meetingsConfig, null, 2)
      : fs.readFileSync(seedFilePath(), 'utf-8');
    fs.writeFileSync(filePath, seedSource);
  } catch (err) {
    console.error('Failed to seed meetings.json at custom path:', err.message);
  }
}

function resolveMeetingsFilePath() {
  const overridePath = (appSettings.meetingsPath || '').trim();
  if (overridePath) {
    ensureCustomMeetingsFileExists(overridePath);
    return overridePath;
  }
  return resolveDefaultMeetingsFilePath();
}

function loadMeetings() {
  try {
    const raw = fs.readFileSync(MEETINGS_FILE, 'utf-8');
    meetingsConfig = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load meetings.json:', err.message);
    meetingsConfig = meetingsConfig || {};
  }
}

const STALE_ONE_TIME_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// One-time ("Never" repeat) meetings never fire again after their date, so
// they're harmless clutter — but we clean them out of meetings.json once
// they're well past (60 days), rather than letting the file grow forever.
function pruneStaleOneTimeMeetings() {
  const cutoff = Date.now() - STALE_ONE_TIME_MS;
  let changed = false;

  for (const day of Object.keys(meetingsConfig)) {
    const list = meetingsConfig[day];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((m) => {
      if (m.recurrence !== 'once') return true;
      const dateStr = m.date || m.anchor;
      if (!dateStr) return true;
      const eventTime = new Date(`${dateStr}T00:00:00`).getTime();
      return eventTime >= cutoff;
    });
    if (kept.length !== list.length) {
      meetingsConfig[day] = kept;
      changed = true;
    }
  }

  if (changed) {
    try {
      fs.writeFileSync(MEETINGS_FILE, JSON.stringify(meetingsConfig, null, 2));
    } catch (err) {
      console.error('Failed to prune stale one-time meetings:', err.message);
    }
  }
}

function hasAnyMeetings() {
  return Object.values(meetingsConfig || {}).some(
    (day) => Array.isArray(day) && day.length > 0
  );
}

let meetingsWatcher = null;

function watchMeetings() {
  if (meetingsWatcher) {
    try {
      meetingsWatcher.close();
    } catch (err) {
      // ignore — watcher may already be closed/invalid
    }
    meetingsWatcher = null;
  }
  meetingsWatcher = fs.watch(MEETINGS_FILE, { persistent: false }, (eventType) => {
    if (eventType === 'change') {
      // Small debounce — editors often write in multiple steps.
      setTimeout(loadMeetings, 150);
    }
  });
}

// --- App state (remembers an intentional quit so auto-start skips once) ---

function loadAppState() {
  try {
    return JSON.parse(fs.readFileSync(APP_STATE_FILE, 'utf-8'));
  } catch {
    return { userClosed: false };
  }
}

function saveAppState(state) {
  try {
    fs.mkdirSync(path.dirname(APP_STATE_FILE), { recursive: true });
    fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save app state:', err.message);
  }
}

// --- App settings (flash appearance/timing, sound, seconds display) ---

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    appSettings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(newSettings) {
  appSettings = { ...DEFAULT_SETTINGS, ...newSettings };
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2));
  } catch (err) {
    console.error('Failed to save settings:', err.message);
  }
}

function getFlashThresholds() {
  const thresholds = [];
  if (appSettings.flashAt5Min) thresholds.push(300);
  if (appSettings.flashAt1Min) thresholds.push(60);
  if (appSettings.flashAtStart) thresholds.push(0);
  return thresholds;
}

function pushFlashSettings() {
  if (flashWindow && !flashWindow.webContents.isDestroyed()) {
    flashWindow.webContents.send('flash-settings', {
      color: appSettings.flashColor,
      opacity: appSettings.flashOpacity,
      count: appSettings.flashCount,
      soundEnabled: appSettings.soundEnabled,
    });
  }
}

function pushCountdownSettings() {
  if (countdownWindow && !countdownWindow.webContents.isDestroyed()) {
    const preset = getCountdownSizePreset();
    countdownWindow.webContents.send('countdown-settings', {
      color: appSettings.countdownColor,
      opacity: appSettings.countdownOpacity,
      scale: preset.scale,
      size: appSettings.countdownSize,
    });
  }
}

function applyCountdownWindowSize() {
  if (!countdownWindow) return;
  const preset = getCountdownSizePreset();
  const [currentWidth, currentHeight] = countdownWindow.getSize();
  if (currentWidth !== preset.width || currentHeight !== preset.height) {
    // Some Windows builds ignore setSize() on non-resizable frameless/
    // transparent windows unless resizable is briefly toggled on.
    countdownWindow.setResizable(true);
    countdownWindow.setSize(preset.width, preset.height);
    countdownWindow.setResizable(false);
  }
}

// --- Auto-start registration (Windows Run key via Electron's login items) ---

function configureAutoLaunch() {
  if (!app.isPackaged) return; // only meaningful once installed to a stable path
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [AUTOSTART_ARG],
  });
}

// --- Window position persistence ---

function loadWindowState() {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveWindowState() {
  if (!countdownWindow) return;
  const bounds = countdownWindow.getBounds();
  try {
    fs.mkdirSync(path.dirname(WINDOW_STATE_FILE), { recursive: true });
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify({ x: bounds.x, y: bounds.y }));
  } catch (err) {
    console.error('Failed to save window position:', err.message);
  }
}

// --- Windows ---

function createCountdownWindow() {
  const state = loadWindowState();
  const defaults = getCountdownSizePreset();

  countdownWindow = new BrowserWindow({
    width: defaults.width,
    height: defaults.height,
    x: state ? state.x : undefined,
    y: state ? state.y : undefined,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  countdownWindow.setAlwaysOnTop(true, 'screen-saver');
  countdownWindow.loadFile(path.join(__dirname, 'renderer', 'countdown.html'));
  countdownWindow.webContents.once('did-finish-load', pushCountdownSettings);

  let saveTimer = null;
  countdownWindow.on('moved', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 300);
  });
  countdownWindow.on('closed', () => {
    countdownWindow = null;
  });
}

function createFlashWindow() {
  const primary = screen.getPrimaryDisplay();
  flashWindow = new BrowserWindow({
    ...primary.bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  flashWindow.setIgnoreMouseEvents(true);
  flashWindow.setAlwaysOnTop(true, 'screen-saver');
  flashWindow.loadFile(path.join(__dirname, 'renderer', 'flash.html'));
  flashWindow.webContents.once('did-finish-load', pushFlashSettings);
  flashWindow.on('closed', () => {
    flashWindow = null;
  });
}

function createEditorWindow() {
  if (editorWindow) {
    editorWindow.focus();
    return;
  }
  editorWindow = new BrowserWindow({
    width: 880,
    height: 480,
    title: 'CalendarTimer — Edit Meetings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  editorWindow.loadFile(path.join(__dirname, 'renderer', 'editor.html'));
  editorWindow.on('closed', () => {
    editorWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 560,
    title: 'CalendarTimer — Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function triggerFlash() {
  if (!flashWindow) return;
  flashWindow.webContents.send('flash');
  flashWindow.showInactive();
  setTimeout(() => {
    if (flashWindow) flashWindow.hide();
  }, FLASH_DURATION_MS);
}

// --- Timer loop ---

let trackedMeetingKey = null;
let trackedMeetingDateTime = null;
let prevRemainingSeconds = null;
let firedThresholds = new Set();

// Per-occurrence overrides from the countdown card's right-click menu.
// Keyed by schedule.js's occurrence key (raw scheduled time + title), so a
// recurring meeting's *other* occurrences are unaffected. In-memory only
// (not persisted) — resets on app restart.
const skippedOccurrences = new Set();
const snoozeMsByOccurrence = new Map();
const OVERRIDE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function pruneExpiredOverrides(now) {
  const cutoff = now.getTime() - OVERRIDE_MAX_AGE_MS;
  for (const key of skippedOccurrences) {
    const ts = Number(key.split('|')[0]);
    if (Number.isFinite(ts) && ts < cutoff) skippedOccurrences.delete(key);
  }
  for (const key of snoozeMsByOccurrence.keys()) {
    const ts = Number(key.split('|')[0]);
    if (Number.isFinite(ts) && ts < cutoff) snoozeMsByOccurrence.delete(key);
  }
}

function tick() {
  const now = new Date();
  pruneExpiredOverrides(now);
  const next = getNextMeeting(meetingsConfig, now, {
    isSkipped: (key) => skippedOccurrences.has(key),
    getSnoozeMs: (key) => snoozeMsByOccurrence.get(key) || 0,
  });

  if (next) {
    const remainingMs = next.dateTime.getTime() - now.getTime();
    const remainingSeconds = Math.round(remainingMs / 1000);
    const key = next.key;

    if (key !== trackedMeetingKey) {
      // getNextMeeting() stops returning a meeting the instant it's in the
      // past, so on a slow tick it's possible to jump straight from
      // "a few hundred ms away" to "already over" between two ticks,
      // silently skipping the T-0 (meeting start) threshold. If the meeting
      // we were tracking has now started and we never fired its 0-threshold,
      // catch it up here before switching to the new one.
      if (
        trackedMeetingDateTime !== null &&
        trackedMeetingDateTime <= now.getTime() &&
        !firedThresholds.has(0)
      ) {
        triggerFlash();
      }
      trackedMeetingKey = key;
      trackedMeetingDateTime = next.dateTime.getTime();
      prevRemainingSeconds = null;
      firedThresholds = new Set();
    }

    if (prevRemainingSeconds !== null) {
      for (const threshold of getFlashThresholds()) {
        if (
          prevRemainingSeconds > threshold &&
          remainingSeconds <= threshold &&
          !firedThresholds.has(threshold)
        ) {
          firedThresholds.add(threshold);
          triggerFlash();
        }
      }
    }
    prevRemainingSeconds = remainingSeconds;

    if (countdownWindow) {
      const remaining = formatRemaining(remainingMs, appSettings.secondsDisplay);
      countdownWindow.webContents.send('tick', {
        hasMeeting: true,
        title: next.title,
        time: next.time,
        remainingText: remaining.text,
        imminent: remaining.imminent,
        key,
      });
    }
  } else {
    trackedMeetingKey = null;
    trackedMeetingDateTime = null;
    prevRemainingSeconds = null;
    if (countdownWindow) {
      countdownWindow.webContents.send('tick', { hasMeeting: false, isEmpty: !hasAnyMeetings() });
    }
  }
}

// --- Skip / snooze actions (from the countdown card's right-click menu) ---

function skipOccurrence(key) {
  if (!key) return;
  skippedOccurrences.add(key);
  tick(); // getNextMeeting() will now move on to the following occurrence
}

function snoozeOccurrence(key, minutes = 5) {
  if (!key) return;
  const addedMs = minutes * 60 * 1000;
  snoozeMsByOccurrence.set(key, (snoozeMsByOccurrence.get(key) || 0) + addedMs);
  if (key === trackedMeetingKey) {
    // Let already-fired thresholds (e.g. "5 min before") fire again once
    // the countdown counts back down through them after the snooze delay.
    firedThresholds = new Set();
    prevRemainingSeconds = null;
  }
  tick();
}

function showCountdownContextMenu(key) {
  if (!countdownWindow) return;
  const template = [
    {
      label: 'Snooze 5 minutes',
      enabled: !!key,
      click: () => snoozeOccurrence(key, 5),
    },
    {
      label: 'Skip this meeting',
      enabled: !!key,
      click: () => skipOccurrence(key),
    },
  ];
  Menu.buildFromTemplate(template).popup({ window: countdownWindow });
}

// --- App lifecycle ---

// A second launch attempt (e.g. double-clicking the shortcut while already
// running) hits this instead of creating a competing window set.
app.on('second-instance', () => {
  if (countdownWindow) {
    if (countdownWindow.isMinimized()) countdownWindow.restore();
    countdownWindow.show();
    countdownWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    return;
  }

  configureAutoLaunch();

  const launchedViaAutostart = process.argv.includes(AUTOSTART_ARG);
  const state = loadAppState();

  if (launchedViaAutostart && state.userClosed) {
    // User explicitly quit last time — honor that and skip this auto-launch.
    app.quit();
    return;
  }

  if (!launchedViaAutostart) {
    // A manual launch (shortcut/double-click) re-arms future auto-starts.
    saveAppState({ userClosed: false });
  }

  loadSettings();
  MEETINGS_FILE = resolveMeetingsFilePath();
  loadMeetings();
  pruneStaleOneTimeMeetings();
  watchMeetings();
  createCountdownWindow();
  createFlashWindow();
  tick();
  setInterval(tick, TICK_MS);

  if (isFirstRunMeetings) {
    // Fresh install/clone — open the editor straight away so the user edits
    // the seeded example meetings instead of hunting for meetings.json.
    createEditorWindow();
  }
});

ipcMain.on('quit-app', () => {
  saveAppState({ userClosed: true });
  app.quit();
});

ipcMain.on('open-editor', () => {
  createEditorWindow();
});

ipcMain.on('close-editor', () => {
  if (editorWindow) editorWindow.close();
});

ipcMain.handle('meetings:get', () => meetingsConfig);

ipcMain.handle('meetings:save', (_event, newConfig) => {
  fs.writeFileSync(MEETINGS_FILE, JSON.stringify(newConfig, null, 2));
  meetingsConfig = newConfig;
  tick(); // refresh countdown + re-evaluate flash tracking immediately
  return { ok: true };
});

ipcMain.handle('meetings:get-path', () => MEETINGS_FILE);

ipcMain.handle('meetings:choose-path', async () => {
  const parentWindow = settingsWindow || countdownWindow || undefined;
  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Choose meetings.json location',
    defaultPath: MEETINGS_FILE,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['createDirectory'],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, path: MEETINGS_FILE };
  }

  const newPath = result.filePath;
  if (path.resolve(newPath) === path.resolve(MEETINGS_FILE)) {
    return { canceled: false, path: MEETINGS_FILE, changed: false };
  }

  if (!fs.existsSync(newPath)) {
    // Brand-new location — carry the current meetings over so nothing is
    // lost. If it already exists (e.g. a synced copy from another machine),
    // leave it alone and load its existing contents instead.
    try {
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.writeFileSync(newPath, JSON.stringify(meetingsConfig, null, 2));
    } catch (err) {
      return { canceled: false, error: err.message, path: MEETINGS_FILE };
    }
  }

  appSettings.meetingsPath = newPath;
  saveSettings(appSettings);
  MEETINGS_FILE = newPath;
  loadMeetings();
  pruneStaleOneTimeMeetings();
  watchMeetings();
  tick();
  return { canceled: false, path: MEETINGS_FILE, changed: true };
});

ipcMain.handle('meetings:reset-path', async () => {
  if (!appSettings.meetingsPath) {
    return { path: MEETINGS_FILE, changed: false };
  }
  appSettings.meetingsPath = '';
  saveSettings(appSettings);
  MEETINGS_FILE = resolveMeetingsFilePath();
  loadMeetings();
  pruneStaleOneTimeMeetings();
  watchMeetings();
  tick();
  return { path: MEETINGS_FILE, changed: true };
});

ipcMain.on('countdown:context-menu', (_event, key) => {
  showCountdownContextMenu(key);
});

// Manual drag implementation: the card uses -webkit-app-region: no-drag so
// right-click/contextmenu works everywhere (Windows treats "drag" regions
// as a title bar and swallows right-clicks into its own system menu before
// the page ever sees them). Dragging is instead driven from the renderer
// via plain mouse events sent over IPC.
ipcMain.handle('countdown:get-position', () => {
  if (!countdownWindow) return [0, 0];
  return countdownWindow.getPosition();
});

ipcMain.on('countdown:move-to', (_event, x, y) => {
  if (!countdownWindow) return;
  // NOTE: plain setPosition() has a confirmed Electron/Windows bug on
  // frameless+transparent windows where the window grows by ~1px in each
  // dimension on every call (very visible during a drag, which calls this
  // repeatedly). Re-asserting the intended size via setBounds() avoids it.
  const preset = getCountdownSizePreset();
  countdownWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: preset.width,
    height: preset.height,
  });
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('close-settings', () => {
  if (settingsWindow) settingsWindow.close();
});

ipcMain.handle('settings:get', () => appSettings);

ipcMain.handle('settings:save', (_event, newSettings) => {
  saveSettings(newSettings);
  pushFlashSettings();
  applyCountdownWindowSize();
  pushCountdownSettings();
  tick(); // refresh countdown display + flash tracking with new settings
  return { ok: true };
});

ipcMain.on('test-flash', () => {
  triggerFlash();
});

app.on('window-all-closed', () => {
  saveAppState({ userClosed: true });
  app.quit();
});

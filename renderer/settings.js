'use strict';

const statusEl = document.getElementById('status');
const countdownColorEl = document.getElementById('countdownColor');
const countdownOpacityEl = document.getElementById('countdownOpacity');
const countdownOpacityValueEl = document.getElementById('countdownOpacityValue');
const countdownSizeEl = document.getElementById('countdownSize');
const flashColorEl = document.getElementById('flashColor');
const flashOpacityEl = document.getElementById('flashOpacity');
const opacityValueEl = document.getElementById('opacityValue');
const flashCountEl = document.getElementById('flashCount');
const soundEnabledEl = document.getElementById('soundEnabled');
const flashAt5MinEl = document.getElementById('flashAt5Min');
const flashAt1MinEl = document.getElementById('flashAt1Min');
const flashAtStartEl = document.getElementById('flashAtStart');
const testFlashBtn = document.getElementById('testFlashBtn');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const meetingsPathEl = document.getElementById('meetingsPath');
const choosePathBtn = document.getElementById('choosePathBtn');
const resetPathBtn = document.getElementById('resetPathBtn');
const meetingsPathStatusEl = document.getElementById('meetingsPathStatus');

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', !!isError);
}

function applyToForm(settings) {
  countdownColorEl.value = settings.countdownColor;
  countdownOpacityEl.value = Math.round(settings.countdownOpacity * 100);
  countdownOpacityValueEl.textContent = countdownOpacityEl.value;
  countdownSizeEl.value = settings.countdownSize;
  flashColorEl.value = settings.flashColor;
  flashOpacityEl.value = Math.round(settings.flashOpacity * 100);
  opacityValueEl.textContent = flashOpacityEl.value;
  flashCountEl.value = String(settings.flashCount);
  soundEnabledEl.checked = !!settings.soundEnabled;
  flashAt5MinEl.checked = !!settings.flashAt5Min;
  flashAt1MinEl.checked = !!settings.flashAt1Min;
  flashAtStartEl.checked = !!settings.flashAtStart;
  const secondsRadio = document.querySelector(
    `input[name="secondsDisplay"][value="${settings.secondsDisplay}"]`
  ) || document.getElementById('secondsAuto');
  secondsRadio.checked = true;
}

function readForm() {
  const secondsDisplay = document.querySelector('input[name="secondsDisplay"]:checked').value;
  return {
    countdownColor: countdownColorEl.value,
    countdownOpacity: Number(countdownOpacityEl.value) / 100,
    countdownSize: countdownSizeEl.value,
    flashColor: flashColorEl.value,
    flashOpacity: Number(flashOpacityEl.value) / 100,
    flashCount: Number(flashCountEl.value),
    soundEnabled: soundEnabledEl.checked,
    flashAt5Min: flashAt5MinEl.checked,
    flashAt1Min: flashAt1MinEl.checked,
    flashAtStart: flashAtStartEl.checked,
    secondsDisplay,
  };
}

flashOpacityEl.addEventListener('input', () => {
  opacityValueEl.textContent = flashOpacityEl.value;
});

countdownOpacityEl.addEventListener('input', () => {
  countdownOpacityValueEl.textContent = countdownOpacityEl.value;
});

testFlashBtn.addEventListener('click', async () => {
  // Save current (possibly unsaved) form values first so the test flash
  // reflects what's on screen, then trigger it.
  const originalLabel = testFlashBtn.textContent;
  testFlashBtn.disabled = true;
  testFlashBtn.textContent = 'Flashing…';
  await window.settingsAPI.saveSettings(readForm());
  window.settingsAPI.testFlash();
  setTimeout(() => {
    testFlashBtn.disabled = false;
    testFlashBtn.textContent = originalLabel;
  }, 1200);
});

cancelBtn.addEventListener('click', () => {
  window.settingsAPI.close();
});

saveBtn.addEventListener('click', async () => {
  setStatus('Saving…');
  try {
    await window.settingsAPI.saveSettings(readForm());
    setStatus('Saved ✓');
    window.settingsAPI.close();
  } catch (err) {
    setStatus(`Failed to save: ${err.message || err}`, true);
  }
});

(async function init() {
  try {
    const settings = await window.settingsAPI.getSettings();
    applyToForm(settings);
  } catch (err) {
    setStatus(`Failed to load: ${err.message || err}`, true);
  }
  try {
    meetingsPathEl.value = await window.settingsAPI.getMeetingsPath();
  } catch (err) {
    meetingsPathEl.value = '';
  }
})();

function setMeetingsPathStatus(text, isError) {
  meetingsPathStatusEl.textContent = text;
  meetingsPathStatusEl.classList.toggle('error', !!isError);
}

choosePathBtn.addEventListener('click', async () => {
  choosePathBtn.disabled = true;
  try {
    const result = await window.settingsAPI.chooseMeetingsPath();
    if (result.canceled) return;
    if (result.error) {
      setMeetingsPathStatus(`Failed to move file: ${result.error}`, true);
      return;
    }
    meetingsPathEl.value = result.path;
    setMeetingsPathStatus(result.changed ? 'Location updated ✓' : '');
  } finally {
    choosePathBtn.disabled = false;
  }
});

resetPathBtn.addEventListener('click', async () => {
  resetPathBtn.disabled = true;
  try {
    const result = await window.settingsAPI.resetMeetingsPath();
    meetingsPathEl.value = result.path;
    setMeetingsPathStatus(result.changed ? 'Reset to default ✓' : '');
  } finally {
    resetPathBtn.disabled = false;
  }
});

'use strict';

const overlayEl = document.getElementById('overlay');

// Total on-screen duration for a flash sequence; kept in sync with
// FLASH_DURATION_MS in main.js so pulses always finish within that window.
const FLASH_DURATION_MS = 1000;

let currentSettings = {
  color: '#ffffff',
  opacity: 0.55,
  count: 2,
  soundEnabled: false,
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch {
    // Audio unavailable — not critical, skip silently.
  }
}

function runPulses(count) {
  const safeCount = Math.max(1, Math.min(2, count)); // hard cap at 2/sec
  const pulseMs = FLASH_DURATION_MS / safeCount;
  let i = 0;

  function pulseOnce() {
    overlayEl.style.transition = 'none';
    overlayEl.style.background = rgba(currentSettings.color, currentSettings.opacity);
    // Force a reflow so the opaque frame actually paints before we schedule
    // the fade-out — otherwise the browser can coalesce both style changes
    // into a single frame and the flash never becomes visible.
    void overlayEl.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlayEl.style.transition = `background ${pulseMs * 0.4}ms ease-in-out`;
        overlayEl.style.background = rgba(currentSettings.color, 0);
      });
    });
    i += 1;
    if (i < safeCount) setTimeout(pulseOnce, pulseMs);
  }

  pulseOnce();
}

window.flashAPI.onSettings((settings) => {
  currentSettings = { ...currentSettings, ...settings };
});

window.flashAPI.onFlash(() => {
  runPulses(currentSettings.count);
  if (currentSettings.soundEnabled) playBeep();
});

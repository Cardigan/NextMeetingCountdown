'use strict';

const cardEl = document.getElementById('card');
const titleEl = document.getElementById('title');
const remainingEl = document.getElementById('remaining');
const subtitleEl = document.getElementById('subtitle');
const closeBtn = document.getElementById('closeBtn');
const editBtn = document.getElementById('editBtn');
const settingsBtn = document.getElementById('settingsBtn');

function hexToRgba(hex, alpha) {
  const h = (hex || '#181a20').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const bigint = parseInt(full, 16) || 0;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

window.countdownAPI.onSettings((settings) => {
  document.documentElement.style.setProperty('--cd-scale', settings.scale || 1);
  const opacity = settings.opacity != null ? settings.opacity : 0.88;
  cardEl.style.background = hexToRgba(settings.color, opacity);
  cardEl.classList.toggle('size-small', settings.size === 'small');
});

closeBtn.addEventListener('click', () => {
  window.countdownAPI.quit();
});

editBtn.addEventListener('click', () => {
  window.countdownAPI.openEditor();
});

settingsBtn.addEventListener('click', () => {
  window.countdownAPI.openSettings();
});

let currentMeetingKey = null;

cardEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.countdownAPI.showContextMenu(currentMeetingKey);
});

// Manual drag: the card is no-drag (so right-click works everywhere), so
// plain window dragging is implemented here instead of via CSS app-region.
let dragging = false;
let dragStartMouse = { x: 0, y: 0 };
let dragStartWin = { x: 0, y: 0 };

cardEl.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return; // left-click only
  if (event.target.closest('button')) return; // let buttons handle their own clicks
  dragging = true;
  dragStartMouse = { x: event.screenX, y: event.screenY };
  window.countdownAPI.getPosition().then((pos) => {
    dragStartWin = { x: pos[0], y: pos[1] };
  });
});

window.addEventListener('mousemove', (event) => {
  if (!dragging) return;
  const dx = event.screenX - dragStartMouse.x;
  const dy = event.screenY - dragStartMouse.y;
  window.countdownAPI.moveTo(dragStartWin.x + dx, dragStartWin.y + dy);
});

window.addEventListener('mouseup', () => {
  dragging = false;
});

window.countdownAPI.onTick((data) => {
  if (!data.hasMeeting) {
    currentMeetingKey = null;
    titleEl.textContent = data.isEmpty ? 'Click + to add your first meeting' : 'No upcoming meetings';
    remainingEl.textContent = '--';
    remainingEl.classList.remove('imminent');
    subtitleEl.textContent = '';
    return;
  }

  currentMeetingKey = data.key;
  titleEl.textContent = data.title;
  remainingEl.textContent = data.remainingText;
  subtitleEl.textContent = `at ${data.time}`;
  remainingEl.classList.toggle('imminent', data.imminent);
});

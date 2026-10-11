'use strict';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DAY_GROUPS = {
  everyday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  weekday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekend: ['saturday', 'sunday'],
};
const GROUP_LABELS = {
  everyday: 'Every day',
  weekday: 'Weekdays (Mon–Fri)',
  weekend: 'Weekend (Sat–Sun)',
};

const rowsEl = document.getElementById('rows');
const addBtn = document.getElementById('addBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusEl = document.getElementById('status');

function dayOptionsHtml(selected) {
  const groupOptions = Object.keys(DAY_GROUPS)
    .map((g) => `<option value="${g}" ${g === selected ? 'selected' : ''}>${GROUP_LABELS[g]}</option>`)
    .join('');
  const dayOptions = DAYS.map((d) => {
    const label = d.charAt(0).toUpperCase() + d.slice(1);
    return `<option value="${d}" ${d === selected ? 'selected' : ''}>${label}</option>`;
  }).join('');
  return `<optgroup label="Groups">${groupOptions}</optgroup><optgroup label="Single day">${dayOptions}</optgroup>`;
}

function makeRow(entry) {
  const tr = document.createElement('tr');
  const recurrence = entry.recurrence === 'biweekly' ? 'biweekly'
    : entry.recurrence === 'once' ? 'once' : 'weekly';
  const dateValue = entry.date || entry.anchor || '';

  tr.innerHTML = `
    <td><select class="day">${dayOptionsHtml(entry.day)}</select></td>
    <td><input type="time" class="time" value="${entry.time || '09:00'}" /></td>
    <td><input type="text" class="title" value="${entry.title ? escapeAttr(entry.title) : ''}" placeholder="Meeting title" /></td>
    <td>
      <select class="recurrence">
        <option value="weekly" ${recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="biweekly" ${recurrence === 'biweekly' ? 'selected' : ''}>Every other week</option>
        <option value="once" ${recurrence === 'once' ? 'selected' : ''}>Never (one-time)</option>
      </select>
    </td>
    <td><input type="date" class="date" value="${dateValue}" /></td>
    <td><button class="del-btn" title="Remove">×</button></td>
  `;

  const recurrenceSel = tr.querySelector('.recurrence');
  const dateInput = tr.querySelector('.date');
  const daySel = tr.querySelector('.day');

  function syncRecurrenceUI() {
    const val = recurrenceSel.value;
    dateInput.disabled = val === 'weekly';
    // A one-time event's weekday is derived from its date, not hand-picked.
    daySel.disabled = val === 'once';
  }
  syncRecurrenceUI();
  recurrenceSel.addEventListener('change', syncRecurrenceUI);

  tr.querySelector('.del-btn').addEventListener('click', () => {
    tr.remove();
  });

  return tr;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function addRow(entry) {
  const tr = makeRow(entry || { day: 'monday', time: '09:00', title: '' });
  rowsEl.appendChild(tr);
  return tr;
}

function configToRows(config) {
  rowsEl.innerHTML = '';
  const groups = new Map(); // groupId -> { group, days: Set<string>, meeting }
  const singles = [];

  DAYS.forEach((day) => {
    const list = config[day] || [];
    list.forEach((m) => {
      if (m.groupId && m.group && DAY_GROUPS[m.group]) {
        if (!groups.has(m.groupId)) {
          groups.set(m.groupId, { group: m.group, days: new Set(), meeting: m });
        }
        groups.get(m.groupId).days.add(day);
      } else {
        singles.push({ day, time: m.time, title: m.title, recurrence: m.recurrence, date: m.date || m.anchor });
      }
    });
  });

  let any = false;

  groups.forEach((g) => {
    const expectedDays = DAY_GROUPS[g.group];
    const matches = expectedDays.length === g.days.size && expectedDays.every((d) => g.days.has(d));
    if (matches) {
      addRow({
        day: g.group,
        time: g.meeting.time,
        title: g.meeting.title,
        recurrence: g.meeting.recurrence,
        date: g.meeting.date || g.meeting.anchor,
      });
      any = true;
    } else {
      // Group is incomplete (e.g. one day's entry was hand-edited/removed) —
      // fall back to rendering each remaining day as its own single row.
      g.days.forEach((d) => singles.push({ day: d, time: g.meeting.time, title: g.meeting.title, recurrence: g.meeting.recurrence, date: g.meeting.date || g.meeting.anchor }));
    }
  });

  singles.forEach((s) => {
    addRow(s);
    any = true;
  });

  if (!any) addRow();
}

function rowsToConfig() {
  const config = { sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [] };
  const errors = [];

  Array.from(rowsEl.children).forEach((tr, idx) => {
    const dayValue = tr.querySelector('.day').value;
    const time = tr.querySelector('.time').value;
    const title = tr.querySelector('.title').value.trim();
    const recurrence = tr.querySelector('.recurrence').value;
    const dateVal = tr.querySelector('.date').value;

    if (!title) {
      errors.push(`Row ${idx + 1}: title is required`);
      return;
    }
    if (!time) {
      errors.push(`Row ${idx + 1} (${title}): time is required`);
      return;
    }
    if (recurrence === 'biweekly' && !dateVal) {
      errors.push(`Row ${idx + 1} (${title}): "every other week" needs a date`);
      return;
    }
    if (recurrence === 'once' && !dateVal) {
      errors.push(`Row ${idx + 1} (${title}): one-time events need a date`);
      return;
    }

    const baseEntry = { time, title };
    if (recurrence === 'biweekly' || recurrence === 'once') {
      baseEntry.recurrence = recurrence;
      baseEntry.date = dateVal;
    }

    if (recurrence === 'once') {
      // One-time events are stored under the weekday their date actually
      // falls on, regardless of whatever the (disabled) day dropdown shows.
      const weekday = DAYS[new Date(`${dateVal}T00:00:00`).getDay()];
      config[weekday].push(baseEntry);
      return;
    }

    if (DAY_GROUPS[dayValue]) {
      // Expand a group selection (everyday/weekday/weekend) into one entry
      // per actual weekday, tagged so the editor can collapse it back into
      // a single row next time it loads.
      const groupId = `g${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      DAY_GROUPS[dayValue].forEach((day) => {
        config[day].push({ ...baseEntry, group: dayValue, groupId });
      });
    } else {
      config[dayValue].push(baseEntry);
    }
  });

  DAYS.forEach((day) => {
    config[day].sort((a, b) => a.time.localeCompare(b.time));
  });

  return { config, errors };
}

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', !!isError);
}

addBtn.addEventListener('click', () => {
  const tr = addRow();
  tr.scrollIntoView({ block: 'nearest' });
  tr.querySelector('.day').focus();
});

cancelBtn.addEventListener('click', () => {
  window.editorAPI.close();
});

saveBtn.addEventListener('click', async () => {
  const { config, errors } = rowsToConfig();
  if (errors.length > 0) {
    setStatus(errors[0], true);
    return;
  }
  setStatus('Saving…');
  try {
    await window.editorAPI.saveMeetings(config);
    setStatus('Saved ✓');
    window.editorAPI.close();
  } catch (err) {
    setStatus(`Failed to save: ${err.message || err}`, true);
  }
});

(async function init() {
  try {
    const config = await window.editorAPI.getMeetings();
    configToRows(config || {});
  } catch (err) {
    setStatus(`Failed to load: ${err.message || err}`, true);
    addRow();
  }
})();

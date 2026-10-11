'use strict';

// Pure scheduling logic — no Electron dependencies, easy to unit test.

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SCAN_WINDOW_DAYS = 15; // covers weekly + biweekly cycles with margin

/**
 * Midnight (local time) for the given date.
 */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Parses "HH:MM" and combines it with a date (local time), returning a Date.
 */
function combineDateTime(dateOnly, timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const d = new Date(dateOnly);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/**
 * Determines whether a meeting occurs on the given calendar date (date-only,
 * local midnight), accounting for "weekly" (default) vs "biweekly" recurrence.
 */
function occursOn(meeting, dateOnly) {
  if (meeting.recurrence === 'once') {
    // One-time event — occurs only on its specific date, never repeats.
    const dateStr = meeting.date || meeting.anchor;
    if (!dateStr) return false; // misconfigured; nothing to match against
    const eventDate = startOfDay(new Date(`${dateStr}T00:00:00`));
    return eventDate.getTime() === dateOnly.getTime();
  }
  if (meeting.recurrence !== 'biweekly') {
    return true;
  }
  const anchorStr = meeting.date || meeting.anchor;
  if (!anchorStr) {
    // Misconfigured biweekly entry without a date — treat as weekly to be safe.
    return true;
  }
  const anchor = startOfDay(new Date(`${anchorStr}T00:00:00`));
  const diffDays = Math.round((dateOnly.getTime() - anchor.getTime()) / MS_PER_DAY);
  const mod14 = ((diffDays % 14) + 14) % 14;
  return mod14 === 0;
}

/**
 * Builds the stable occurrence key for a meeting instance, based on its
 * un-adjusted (not-yet-snoozed) scheduled date/time plus title. This is
 * stable across ticks for the same real-world occurrence, so it's safe to
 * use to track per-occurrence skip/snooze state and de-dupe flash firing.
 */
function occurrenceKey(rawDateTime, title) {
  return `${rawDateTime.getTime()}|${title}`;
}

/**
 * Finds the next upcoming meeting strictly after `now`.
 *
 * @param {object} meetingsConfig - parsed meetings.json (keyed by lowercase weekday)
 * @param {Date} now - current time
 * @param {object} [options]
 * @param {(key: string) => boolean} [options.isSkipped] - return true to
 *   exclude a specific occurrence (identified by its occurrence key) from
 *   consideration entirely, moving on to the next one.
 * @param {(key: string) => number} [options.getSnoozeMs] - extra delay (ms)
 *   to add to a specific occurrence's effective date/time, e.g. for a
 *   "snooze 5 minutes" action. Does not affect the occurrence's key.
 * @returns {{title: string, time: string, dateTime: Date, key: string, recurrence?: string}|null}
 */
function getNextMeeting(meetingsConfig, now = new Date(), options = {}) {
  const { isSkipped = () => false, getSnoozeMs = () => 0 } = options;

  for (let offset = 0; offset < SCAN_WINDOW_DAYS; offset += 1) {
    const dateOnly = startOfDay(addDays(now, offset));
    const weekday = DAY_NAMES[dateOnly.getDay()];
    const dayMeetings = (meetingsConfig[weekday] || [])
      .filter((m) => occursOn(m, dateOnly))
      .map((m) => {
        const rawDateTime = combineDateTime(dateOnly, m.time);
        const key = occurrenceKey(rawDateTime, m.title);
        const snoozeMs = getSnoozeMs(key) || 0;
        const dateTime = snoozeMs > 0 ? new Date(rawDateTime.getTime() + snoozeMs) : rawDateTime;
        return { ...m, dateTime, key };
      })
      .filter((m) => !isSkipped(m.key))
      .filter((m) => m.dateTime.getTime() > now.getTime())
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

    if (dayMeetings.length > 0) {
      return dayMeetings[0];
    }
  }
  return null;
}

/**
 * Breaks down a millisecond duration into days/hours/minutes/seconds (floor),
 * plus a flag for whether it's under the 5-minute "imminent" threshold.
 *
 * `secondsMode` controls whether seconds are included in the display text:
 * - "auto" (default): seconds only show once imminent (< 5 min remaining),
 *   matching the original behavior.
 * - "always": seconds always included, even for multi-day countdowns.
 * - "never": seconds never included, even when imminent.
 */
function formatRemaining(ms, secondsMode = 'auto') {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const imminent = totalSeconds < 300;
  const showSeconds = secondsMode === 'always' ? true : secondsMode === 'never' ? false : imminent;

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  let text;
  if (showSeconds && days === 0 && hours === 0) {
    // Short countdown: "Xm Ys", or just "Ys" once minutes run out.
    text = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  } else {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (days > 0 || hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    if (showSeconds) parts.push(`${seconds}s`);
    text = parts.join(' ');
  }

  return { days, hours, minutes, seconds, totalMinutes, imminent, text };
}

module.exports = {
  DAY_NAMES,
  startOfDay,
  addDays,
  combineDateTime,
  occursOn,
  occurrenceKey,
  getNextMeeting,
  formatRemaining,
};

# CalendarTimer Product Requirements Document

**Document status:** Retroactive specification of the completed product  
**Product:** CalendarTimer  
**Platform:** Windows desktop  
**Primary user:** One individual user

## 1. Product Summary

CalendarTimer is a small Electron desktop application that remains visible above other windows and counts down to the user's next meeting. It addresses a simple recurring problem: the user can become focused on other work and forget an approaching meeting. CalendarTimer provides a persistent, movable countdown card, configurable full-screen flash alerts, optional sound, and a local meeting editor without requiring a calendar service, account, backend, or network connection.

## 2. Goals

- Keep the next meeting continuously visible without occupying significant screen space.
- Make the remaining time immediately understandable, including second-level precision when a meeting is close.
- Reliably attract attention at configurable milestones through a full-screen visual flash and optional sound.
- Support weekly, every-other-week, and one-time meetings.
- Let the user manage meetings and appearance entirely through the app.
- Behave like a normal installed Windows application, including Start Menu launch and login auto-start.
- Keep personal meeting information local and out of the project's repository and git history.
- Minimize setup friction on first launch.

## 3. Non-Goals

- Building a multi-user, shared, or enterprise scheduling product.
- Replacing a calendar application or providing full calendar management.
- Synchronizing with Outlook, Microsoft 365, Google Calendar, ICS feeds, or other external services.
- Providing cloud storage, accounts, authentication, or cross-device synchronization.
- Providing OS notification-center integration.
- Supporting platforms other than Windows.

## 4. Target User

CalendarTimer is a personal productivity tool for a single user who wants an unobtrusive but persistent reminder of the next meeting. It is not designed for multiple profiles, shared schedules, administrators, or organizational deployment.

## 5. Functional Requirements

### 5.1 Countdown Card

1. The application shall display a compact floating card containing:
   - The title of the next eligible meeting.
   - The time remaining until that meeting.
   - Controls to add/edit meetings, open Settings, and quit the app.
2. The countdown shall automatically advance to the next eligible meeting as time passes or the schedule changes.
3. When five minutes or more remain, the countdown shall show the relevant combination of days, hours, and minutes, with no seconds.
4. When less than five minutes remain and the seconds-display setting is in its default automatic mode, the countdown shall include seconds and update every second.
5. The seconds display shall also support:
   - **Always:** include seconds regardless of time remaining.
   - **Never:** never include seconds.
6. The countdown shall correctly transition into second-level display rather than remaining at a static value such as `0m`.
7. When no meetings are configured, the card shall show the friendly empty state **"Click + to add your first meeting"** rather than a generic no-meetings message.
8. Changes saved through the meeting editor or made directly to the active schedule file shall update the displayed next meeting without requiring an app restart.

### 5.2 Meeting Scheduling and Recurrence

Meetings shall use the user's local date and time. Multiple meetings may occur on the same day.

| Editor option | Stored recurrence | Required fields | Scheduling behavior |
|---|---|---|---|
| Weekly | Omitted or `weekly` | Day, time, title | Occurs every week on the selected day and time. |
| Every other week | `biweekly` | Day, time, title, date | Occurs every two weeks. The date identifies a known occurrence and determines alternating weeks. |
| Never | `once` | Time, title, date | Occurs exactly once on the specified date and never repeats. |

Additional scheduling requirements:

- Times shall use 24-hour `HH:MM` local-time semantics.
- Biweekly and one-time entries shall use a `YYYY-MM-DD` **Date** field.
- For biweekly meetings, the date must fall on a valid occurrence and acts as the recurrence anchor.
- For one-time meetings, the date is the exact occurrence date.
- A one-time entry shall be stored under the weekday on which its specified date falls.
- One-time entries shall not appear as future meetings after their specified date and time has passed.
- The meeting editor shall offer the following day selections:
  - Each individual weekday.
  - **Everyday** for Sunday through Saturday.
  - **Weekdays (Mon–Fri)**.
  - **Weekend (Sat–Sun)**.
- Group-day selections shall expand to the appropriate weekday-keyed entries when saved and may be collapsed back into one logical editor row when equivalent linked entries are loaded.

### 5.3 Default Seed Schedule

The first-run example schedule shall demonstrate supported weekly and biweekly behavior and provide editable starter content. The project history established the following seed meetings:

| Day | Time | Title | Recurrence |
|---|---:|---|---|
| Monday | 16:00 | Mentor meeting | Every other week, with an example date |
| Tuesday | 11:05 | PQO Standup | Weekly |
| Thursday | 10:05 | MSC team meeting | Weekly |
| Thursday | 11:05 | PQO team meeting | Weekly |
| Thursday | 12:00 | Wiffle ball | Weekly |
| Thursday | 14:05 | WSR | Weekly |
| Friday | 11:00 | AI vibe challenge | Weekly |

The committed example file may use clearly labeled example titles, but it shall demonstrate the same scheduling capabilities and remain safe to publish.

### 5.4 Flash Alerts

1. The app shall support a full-screen flash overlay for upcoming-meeting alerts.
2. The default flash appearance shall be translucent white with no text or writing.
3. Flashing shall be rate-capped at a maximum of two flashes per second.
4. Each configured threshold shall fire no more than once for a given meeting occurrence.
5. Threshold detection shall remain reliable when:
   - The next meeting changes.
   - A newly added meeting becomes the next meeting.
   - The countdown crosses a configured threshold between refresh cycles.
6. The user shall be able to select any combination of these alert thresholds:
   - Five minutes before the meeting.
   - One minute before the meeting.
   - At the meeting start time.
7. An optional short sound may accompany the flash.
8. Settings shall include a **Test flash** action that displays the actual full-screen flash using the current configuration.
9. Activating **Test flash** shall also produce immediate visible button feedback so the user can tell the action was registered.

### 5.5 Settings and Configuration

The Settings window shall expose the following controls:

| Area | Setting | Required options/behavior |
|---|---|---|
| Countdown card | Background color | User-selectable card color |
| Countdown card | Opacity | User-configurable card opacity |
| Countdown card | Size | Small, medium, and large |
| Flash | Color | User-selectable flash color |
| Flash | Opacity | User-configurable flash translucency |
| Flash | Count | One or two pulses, subject to the rate cap |
| Sound | Enabled | On/off |
| Alert timing | Thresholds | Independently enable 5 minutes, 1 minute, and meeting start |
| Countdown precision | Seconds display | Auto under 5 minutes, always, or never |

Saving Settings shall persist all changes and close the Settings window. Configuration shall survive app restarts.

### 5.6 Meetings Editor

1. The countdown card's **+** control shall open the meetings editor.
2. The editor shall support viewing, adding, editing, and deleting meetings.
3. Each row shall provide fields for day, time, title, recurrence, and date where applicable.
4. The recurrence control shall offer **Weekly**, **Every other week**, and **Never**.
5. The field shared by biweekly and one-time meetings shall be labeled **Date**, not **Anchor date**.
6. Date shall be required when recurrence is **Every other week** or **Never**, and unnecessary for weekly meetings.
7. Saving shall validate required fields and apply changes immediately.
8. The editor's default width shall display all columns without requiring the user to resize the window; its established height shall be preserved.
9. Selecting **Add meeting** shall:
   - Add a new editable row.
   - Scroll that row into view.
   - Place keyboard focus on the new row's Day dropdown.
10. All editor buttons shall provide a visible pressed/active feedback state.

### 5.7 First-Run and Empty-State Experience

1. On a genuine first run, the app shall create the user's personal schedule from the committed example schedule.
2. The app shall automatically open the meetings editor so the user can immediately replace the examples with personal meetings.
3. The user shall not be required to manually create or locate a JSON file before using the app.
4. If the user removes all meetings, the countdown card shall guide them back to the editor with the empty-state message defined in Section 5.1.
5. The same first-run behavior shall apply in development and in the packaged application, using the appropriate local storage path for each environment.

### 5.8 Window and Interaction Behavior

1. The countdown card shall remain always on top of ordinary desktop windows.
2. The card shall be draggable so the user can place it anywhere on screen.
3. The selected position shall persist across launches.
4. The editor and Settings controls shall use clear icon semantics:
   - **+** opens the meeting editor.
   - **Gear** opens Settings.
   - **×** quits the application.
5. These three controls shall have visually consistent styling and equally usable click/touch target sizes.
6. All buttons throughout the app shall provide visible interaction feedback when pressed.
7. The flash overlay shall be visually separate from the countdown card's configured color, opacity, and size.

### 5.9 Installation, Launch, and Auto-Start

1. CalendarTimer shall be distributed as a Windows installer that does not require the user to run `npm start` or a batch file.
2. Installation shall:
   - Create a Start Menu shortcut.
   - Produce an app that can be pinned to the Windows taskbar.
   - Launch without displaying a console window.
   - Register CalendarTimer to start automatically at Windows login.
3. Installation may be silent and shall launch the app when installation completes.
4. Clicking the app's **×** control shall be treated as an explicit quit, not a temporary window close.
5. After an explicit quit, CalendarTimer shall remain closed across logout/login and shall not auto-reopen.
6. Manually launching CalendarTimer again from the Start Menu or taskbar shall clear the intentional-quit state and re-arm login auto-start for future sessions.
7. Users may disable startup registration through Windows startup-app settings.

### 5.10 Local Data and Privacy

1. All user data shall remain on the local machine.
2. The user's active `meetings.json` shall contain personal schedule data and shall never be committed to the repository.
3. `meetings.json` shall be gitignored, while a non-personal `meetings.example.json` shall be committed as the seed/template.
4. Personal meeting details shall be removed from existing git history before the repository is shared or pushed; ignoring the file only for future commits is insufficient.
5. Settings, window position, and intentional-quit state shall be stored separately in local application-data files.
6. The product shall not transmit meeting titles, times, settings, or usage data to a server.

### 5.11 Stale One-Time Event Cleanup

1. The app shall inspect one-time events once during startup.
2. A one-time event whose date is more than 60 days in the past shall be removed automatically from the user's active `meetings.json`.
3. One-time events that are 60 or fewer days in the past shall remain in the file.
4. Cleanup shall affect only qualifying `once` entries and shall preserve weekly, biweekly, future, and recent one-time entries.
5. The updated schedule file shall remain valid and usable after cleanup.

## 6. Non-Functional Requirements and Constraints

- **Platform:** Windows desktop.
- **Application model:** Electron desktop application.
- **Connectivity:** Fully functional offline; no backend or server dependency.
- **Persistence:** Local files only, using the project directory in development and the application's Windows user-data location when installed.
- **Privacy:** No authentication, telemetry requirement, cloud sync, or remote data transmission.
- **Reliability:** Countdown selection and alert-threshold transitions must remain correct when schedules change while the app is running.
- **Responsiveness:** The countdown shall update frequently enough to show accurate second-level timing when seconds are enabled.
- **Usability:** Core actions must be available from the countdown card and must not require editing JSON.
- **Visual footprint:** The countdown shall remain compact and user-configurable while retaining readable content and usable controls.
- **Build security context:** Vulnerabilities reported solely in `electron-builder` or its build-time dependency tree are development/build concerns and shall not be represented as dependencies shipped in the packaged runtime unless confirmed otherwise.

## 7. Out of Scope

- Outlook, Microsoft 365, Google Calendar, or ICS import and synchronization.
- Creating, accepting, declining, or modifying meetings in an external calendar.
- Windows notification-center toasts or actionable OS notifications.
- Snooze, dismiss, or reschedule actions from an alert.
- Cloud backup or schedule sharing.
- Multiple users or profiles.
- Mobile, macOS, Linux, or web versions.
- Automatic taskbar pinning, which remains a manual Windows user action.

## 8. Acceptance Summary

CalendarTimer is acceptable when a user can install and launch it as a normal Windows app, edit a seeded local schedule through the UI, see an accurate always-on-top countdown to the next weekly, biweekly, or one-time meeting, receive each configured flash alert reliably, customize alert and card appearance, retain window/settings state, and explicitly quit in a way that suppresses the next login auto-start. Personal meeting data must remain local and absent from both current repository contents and shared git history.

## 9. Future Considerations

The following are forward-looking ideas only and are not committed requirements:

- Optional Outlook or ICS import while preserving local-first behavior.
- Snooze or temporary alert suppression.
- Explicit multi-monitor controls for where full-screen flashes appear.
- Additional accessibility controls, such as reduced motion or higher-contrast presets.

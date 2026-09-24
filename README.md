# Todoist Tasker Daily Reminder

A Tasker JavaScriptlet for Android (Pixel) that turns a Todoist filter into a daily notification.

Named tasks stay as one line each. Habits whose titles are a **single pictogram** (🚿 👀 🥽 and so on) are concatenated into one visual strip per due date, so real work stands out. If nothing is due, no notification is posted. If the digest collapses to a single line, that line becomes the notification title.

## Requirements

- [Tasker](https://tasker.joaoapps.com/)
- [AutoNotification](https://joaoapps.com/autonotification/) (or Tasker’s built-in Notify)
- A Todoist API token: **Settings → Integrations → Developer → API token**
- Todoist REST **v1** (`/api/v1/…` — REST v2 returns `410 Gone`)

## What the digest looks like

```
⚠️ Call the solicitor
📌 VAT return receipt query
📌 🚿 👀 🥽
➡️ Book dentist
```

Date marks:

| Mark | Meaning |
| --- | --- |
| ⚠️ | Overdue |
| 📌 | Today (or undated P1) |
| ➡️ | Tomorrow |
| 🔜 | Day after tomorrow |
| `Mon` … `Sat` | Later in the window |

Pictogram detection: the task title is one symbol with no letters or digits. Add a word (`🚿 shower`) and it stays a normal line.

## Tasker setup

### Profiles

Two Time profiles, both running the same task (for example `Todoist Digest`):

- 9:00 AM → 9:01 AM, repeat 1 hour
- 6:00 PM → 6:01 PM, repeat 1 hour

The 1-hour repeat is a Pixel workaround so the profile still fires once in that minute.

Give Tasker **Unrestricted** battery use and notification permission.

### Task actions

1. **Variable Set** — `%TODOIST_TOKEN` to your token (or set it once under **Vars** and skip this step).
2. **HTTP Request**
   - Method: `GET`
   - URL:

     ```
     https://api.todoist.com/api/v1/tasks/filter?query=((overdue%20%7C%203%20days)%20%7C%20p1)%20%26%20!%40weather&limit=200
     ```

     That query is `((overdue | 3 days) | p1) & !@weather`.

     The `!@weather` clause keeps the 7:00 forecast tasks out of this list. Add it after the weather task has run once (that run creates the `weather` label). Until then, leave the clause off — a missing label can make the filter fail.
   - Header: `Authorization: Bearer %TODOIST_TOKEN`
   - Output prefix: `todoist` (this creates `%todoist_http_data`)
   - Continue Task After Error: on
3. **Variable Set** — `%TODOIST_JSON` to `%todoist_http_data`
4. **JavaScriptlet** — paste [`todoist-digest.js`](todoist-digest.js). Auto Exit on, timeout 45s. Save with ✓ (swipe-back discards the script).
5. **Stop** — If `%MORNING_TODOIST_SKIP` `eq` `1` (skips the notification on empty days).
6. **AutoNotification**
   - Title: `%MORNING_TODOIST_TITLE`
   - Text: `%MORNING_TODOIST_BODY`
   - Icon: Todoist app icon
   - Id: `todoist_digest` (replaces the previous digest instead of stacking)
   - Priority: `2`
   - Category: a dedicated channel (High/Urgent, not Silent)
   - URL (tap): your Pending filter, e.g. `todoist://filter?id=YOUR_FILTER_ID`
   - Structure Output: off

## Script outputs

| Variable | Purpose |
| --- | --- |
| `%MORNING_TODOIST_SKIP` | `1` = nothing to show; Stop before Notify |
| `%MORNING_TODOIST_TITLE` | The one remaining line, or `Morning Tasks` |
| `%MORNING_TODOIST_BODY` | Notification text |
| `%MORNING_TODOIST_HTML` | Same list with per-task `todoist://` links (Android notifications do not honour these taps) |
| `%MORNING_TODOIST_URGENT` | Count of overdue + today |
| `%MORNING_TODOIST_TOTAL` | Raw API row count |
| `%MORNING_TODOIST_SHOWN` | Rows after filtering |
| `%MENU_LABELS` / `%MENU_URLS` | Per-task labels and ids if you still use a Menu action |

## Filtering

The HTTP query already limits the payload. The script then:

- Dedupes by task id
- Shows a recurring task at most once, and only if it is overdue, today, or tomorrow (`RECUR_SHOW_DAYS = 1`)
- Sorts by due date, then undated before dated, then priority
- Clips named titles to 30 characters

Tune `MAX_NAME` and `RECUR_SHOW_DAYS` at the top of the script.

## API notes

- Endpoint: `GET https://api.todoist.com/api/v1/tasks/filter?query=…`
- Body shape: `{ "results": [ … ], "next_cursor": "…" }` — the script reads `.results`
- Todoist P1 in the API is `priority: 4`
- Task ids are strings

## Weather forecast

[`weather-forecast.js`](weather-forecast.js) runs at 7:00 and writes **one Todoist task per day** for today and the next 6 days, always for Fintry, Stirlingshire. The next morning it updates those same tasks and deletes any that have fallen off the window.

Today, before 9:00, is morning (07:00–12:00) and afternoon (12:00–18:00) on one line. From 9:00 until 18:00, a later run starts today at the current hour, so a run at 12:00 uses 12:00–18:00. After 18:00 today's task is left unchanged. If both periods are the same kind of weather, that line is a single forecast. Each later day is one daytime line (08:00–18:00).

The due date is the forecast day. The task title is only the forecast:

```
Today      🌧️ 9° Rain → ⛅ 14° Partly cloudy
Tomorrow   ☁️ 11–13° Overcast
Later      ☀️ 16° Clear
```

Tasks are labelled `weather` and marked with description `tasker-weather`, so the next run replaces only these generated tasks.

### Profile

Time 7:00 AM → 7:01 AM, repeat 1 hour (same Pixel workaround as the digest).

### Task actions

1. **JavaScriptlet** — paste [`weather-forecast.js`](weather-forecast.js). Auto Exit on, timeout 60s. Save with ✓.

`%TODOIST_TOKEN` is the same token as the digest. Forecast data comes from [Open-Meteo](https://open-meteo.com/) (no key) for Fintry (`56.05335`, `-4.22404`). Give Tasker unrestricted battery use.

After the first successful run, add `& !@weather` to the digest HTTP query so these tasks do not appear in the 9:00 notification. See the URL above.

| Variable | Purpose |
| --- | --- |
| `%WEATHER_SKIP` | `1` = nothing written |
| `%WEATHER_BODY` | The seven lines, for a test run |
| `%WEATHER_COUNT` | Days written |
| `%WEATHER_DEBUG` | `ok 7`, or the skip / error reason |

## License

[MIT](LICENSE). Keep the copyright notice if you reuse or redistribute this.
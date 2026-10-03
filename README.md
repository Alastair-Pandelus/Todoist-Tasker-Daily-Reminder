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

- 8:00 AM → 8:10 AM, every 2 minutes
- 6:00 PM → 6:10 PM, every 2 minutes

The 2-minute repeat is there so a wake a minute or two late still lands on a later minute. The script notifies once each morning and once each evening; a later minute in the same window does nothing.

Give Tasker **Unrestricted** battery use and notification permission.

File-based scripts live on the phone in `/sdcard/Tasker/scripts/`, not Download. In a JavaScript action the path is `Tasker/scripts/filename.js`.

### Task actions

1. **Variable Set** — `%TODOIST_TOKEN` to your token (or set it once under **Vars** and skip this step).
2. **HTTP Request**
   - Method: `GET`
   - URL:

     ```
     https://api.todoist.com/api/v1/tasks/filter?query=((overdue%20%7C%203%20days)%20%7C%20p1)%20%26%20!%40weather%20%26%20!%40meal&limit=200
     ```

     That query is `((overdue | 3 days) | p1) & !@weather & !@meal`.

     `!@weather` and `!@meal` keep the forecast and Paprika meal tasks out of this list. Add each clause after that task has run once (the run creates the label). Until then, leave the missing label out — a missing label can make the filter fail.
   - Header: `Authorization: Bearer %TODOIST_TOKEN`
   - Output prefix: `todoist` (this creates `%todoist_http_data`)
   - Continue Task After Error: on
3. **Variable Set** — `%TODOIST_JSON` to `%todoist_http_data`
4. **JavaScript** — path `Tasker/scripts/todoist-digest.js`. Auto Exit on, timeout 45s. Save with ✓.
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

Time 7:00 AM → 7:10 AM, every 2 minutes. A later minute in that window does nothing once that morning's forecast has been written.

### Task actions

1. **JavaScript** — path `Tasker/scripts/weather-forecast.js`. Auto Exit on, timeout 60s. Save with ✓.

`%TODOIST_TOKEN` is the same token as the digest. Forecast data comes from [Open-Meteo](https://open-meteo.com/) (no key) for Fintry (`56.05335`, `-4.22404`). Give Tasker unrestricted battery use.

After the first successful run, add `& !@weather` to the digest HTTP query so these tasks do not appear in the 9:00 notification. See the URL above.

| Variable | Purpose |
| --- | --- |
| `%WEATHER_SKIP` | `1` = nothing written |
| `%WEATHER_BODY` | The seven lines, for a test run |
| `%WEATHER_COUNT` | Days written |
| `%WEATHER_DEBUG` | `ok 7`, or the skip / error reason |

## Paprika meals

[`paprika-meals.js`](paprika-meals.js) runs daily and writes one Todoist task for each meal on the Paprika Meals calendar from today through the same date next month.

The task title is an icon plus the meal name. Breakfast, Lunch and Dinner get an icon. Dessert is not its own task: its icon and name are added to that day's dinner. A type you remove is no longer synced. FODMAP status marks at the start of the Paprika name (✅, ℹ️, ❌, and the older coloured circles) are left off the Todoist title.

```
🍳 Sourbread French Toast
🥗 Baked potato
🍽️ Salmon 🍰 Rhubarb with ice cream
```

Breakfast is due at 9:00, lunch at 13:00 and dinner at 20:00, using the phone's local time. Dessert on the same day is added to the dinner title, and that task stays at 20:00. A dessert with no dinner is still one task at 20:00. Any other meal type stays all-day on the meal date. Tasks are labelled `meal`. The next run updates these tasks and deletes ones that have left the window or the planner.

### Profile

Time 7:02 AM → 7:12 AM, every 2 minutes. A later minute in that window does nothing once that morning's meals have been written.

### Task actions

1. In **Vars**, set `%PAPRIKA_USERNAME` and `%PAPRIKA_PASSWORD` once (the Paprika account email and password). `%TODOIST_TOKEN` is the token already used by the digest.
2. **JavaScript** — path `Tasker/scripts/paprika-meals.js`. Auto Exit on, timeout 90s. Save with ✓.

After the first successful run, add `& !@meal` to the digest HTTP query so these tasks stay out of the 9:00 list.

| Variable | Purpose |
| --- | --- |
| `%MEALS_SKIP` | `1` = nothing written |
| `%MEALS_BODY` | The lines written, for a test run |
| `%MEALS_COUNT` | Meals written |
| `%MEALS_DEBUG` | `ok 12`, or the skip / error reason |

## Nibe hot water boost

[`nibe-hw-boost.js`](nibe-hw-boost.js) boosts the F1245 hot water and then turns the boost off. It uses myUplink parameter `48132` (one-time increase) and reads the tank top, `40013` (BT7). The boost ends when BT7 is above 50°C. A manual run, which has no deadline, also ends after 30 minutes.

The 14:30 profile passes a 15:00 deadline, because electricity is only cheap until 3pm. A separate 15:00 profile turns the boost off even if the minute loop is late. Running **Nibe Hot Water Boost** by hand leaves the deadline blank, so it runs until the tank is above 50°C or 30 minutes have passed.

It only starts while the Todoist task **♨️ Boost hot water for shower** is still open and due at 2:30pm that day, and the phone is on the Fintry Wi-Fi, `TP-LINK_03FA_5GHz`, `TP-LINK_03FA_2_4GHZ`, or `oldmanse`, the same networks as **Fintry Todo**. The 14:30 profile has that Wi-Fi condition as well as the time. The script checks `%WIFII` again, so a manual run away from Fintry does nothing. If the phone leaves Fintry while a boost is running, the next minute check turns the boost off. The 3pm stop does not require Fintry Wi-Fi.

The phone gets an AutoNotification when a boost starts and when it ends. The end text is the reason: the tank temperature, 3pm, leaving Fintry Wi-Fi, or the 3 hour limit. A run that never starts, including one away from Fintry, does not notify. The 3pm task stays quiet when nothing was boosted.

### Credentials

Set these once in Tasker **Vars**. They are not in this repository.

| Variable | Purpose |
| --- | --- |
| `%NIBE_CLIENT_ID` | myUplink application id |
| `%NIBE_CLIENT_SECRET` | myUplink client secret |

### Profile

Time 2:30 PM → 2:40 PM, every 2 minutes, and Wi-Fi connected to `TP-LINK_03FA_5GHz`, `TP-LINK_03FA_2_4GHZ`, or `oldmanse`. Task: **Cheap hot water**, which runs **Nibe Hot Water Boost** with parameter 1 set to `15:00`. A later minute does nothing if a boost is already running.

Time 3:00 PM → 3:10 PM, every 2 minutes. Task: **Hot water boost off**. That task always writes the boost off, including when the minute loop is still waiting. It stays quiet when a boost was not running.

### Task

**Nibe Hot Water Boost** can be run on its own. It keeps the device awake while it is checking.

1. **JavaScript** — path `Tasker/scripts/nibe-hw-boost.js`, local `%mode` = `start`. Auto Exit on, timeout 45s.
2. Wait 1 minute, then the same script with `%mode` = `check`, until `%NIBE_HW_ACTIVE` is `0`.

| Variable | Purpose |
| --- | --- |
| `%NIBE_HW_ACTIVE` | `1` while a boost is running |
| `%NIBE_HW_TEMP` | Last BT7 reading |
| `%NIBE_HW_DEBUG` | Last status, such as `Hot water 46.2C` |
| `%NIBE_HW_TITLE` | Notification title, `Hot water boost on` or `Hot water boost off` |
| `%NIBE_HW_BODY` | Notification text |
| `%NIBE_HW_NOTIFY` | `1` when the task should post that notification |

## License

[MIT](LICENSE). Keep the copyright notice if you reuse or redistribute this.
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
     https://api.todoist.com/api/v1/tasks/filter?query=(overdue%20%7C%203%20days)%20%7C%20p1&limit=200
     ```

     That query is `(overdue | 3 days) | p1`.
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

## License

[MIT](LICENSE). Keep the copyright notice if you reuse or redistribute this.
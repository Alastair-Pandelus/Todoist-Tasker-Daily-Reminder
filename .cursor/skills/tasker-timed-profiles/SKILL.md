---
name: tasker-timed-profiles
description: >-
  Schedules Tasker time profiles on the Pixel so a late wake still runs the
  task. Use when creating or changing a Tasker time profile, clock, alarm,
  daily task, weather forecast, digest, meal sync, or hot-water boost.
---

# Tasker timed profiles

On this Pixel, a time profile that lasts one minute is missed when the wake arrives a minute or two late. Schedule every clock profile with a 10-minute window and a repeat every 2 minutes.

## Pattern

- **From** the intended minute.
- **To** 10 minutes later.
- **Repeat** every 2 minutes. In Tasker XML that is `<rep>2</rep>` and `<repval>2</repval>`. The profile list shows `every 2m`.
- The task must be safe to run again inside that window. The first successful run records that it is done. A later minute in the same window exits without doing the work again.

`<rep>2</rep>` is minutes. `<rep>1</rep>` is hours. Do not use a 1-minute window with repeat every 1 hour (`rep` 1, `repval` 1). That fires only at **From**. A longer end time does not keep it active, because each repeat is an instant, not a range.

Place and Wi-Fi profiles are not this pattern.

## XML

```xml
<Time sr="con0">
    <fh>7</fh>
    <fm>0</fm>
    <rep>2</rep>
    <repval>2</repval>
    <th>7</th>
    <tm>10</tm>
</Time>
```

That is 7:00–7:10, every 2 minutes.

## Once per window

Set the done flag only after the run succeeds, so a failed first minute can try again. JavaScript is Rhino: `var` and `function` only.

| Profile | Window | Done when |
| --- | --- | --- |
| Weather Forecast | 7:00–7:10 | `%WEATHER_DONE` is today's date |
| Paprika Meals | 7:02–7:12 | `%MEALS_DONE` is today's date |
| Todoist AM | 8:00–8:10 | `%DIGEST_DONE` is `yyyy-mm-dd-am` |
| Todoist PM | 18:00–18:10 | `%DIGEST_DONE` is `yyyy-mm-dd-pm` |
| Cheap hot water | 14:30–14:40, Fintry Wi-Fi | `%NIBE_HW_ACTIVE` is already `1` |
| Hot water boost off | 15:00–15:10 | The stop task stays quiet when the boost was not running |

A hot-water start that is already active returns without a second notification. The 3pm stop may run more than once; it does not notify when the boost is already off.

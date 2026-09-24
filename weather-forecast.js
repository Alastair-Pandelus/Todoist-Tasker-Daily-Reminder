// Morning weather forecast for Tasker (JavaScriptlet).
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// 7:00 profile. One Todoist task per day (today + next 6), label "weather".
// Today before 9:00 is morning (07:00) → afternoon (until 18:00).
// From 9:00 until 18:00, today starts at the current hour.
// After 18:00 today's task is left as it is. Later days are one daytime line.
// The same tasks are updated on the next run; days that fall out of the
// window are deleted. Paste into Tasker → Code → JavaScriptlet.
//
// Needs %TODOIST_TOKEN. Forecast is always for Fintry, Stirlingshire.

var LABEL = "weather";
var MARKER = "tasker-weather";
var FINTRY_LAT = "56.05335";
var FINTRY_LON = "-4.22404";
var MORNING = [7, 8, 9, 10, 11];
var AFTERNOON = [12, 13, 14, 15, 16, 17];
var DAYTIME = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
var SLIDE_FROM = 9;
var DAY_END = 18;

function isBlank(v) {
  if (v == null) return true;
  v = String(v);
  if (!v || v === "undefined" || v === "null") return true;
  if (v.charAt(0) === "%") return true;
  return false;
}

function pick(name) {
  var v;
  try { v = local(name); } catch (e) { v = ""; }
  if (!isBlank(v)) return String(v);
  try { v = global(name); } catch (e2) { v = ""; }
  if (!isBlank(v)) return String(v);
  return "";
}

function wx(code) {
  code = parseInt(code, 10);
  if (code === 0 || code === 1) return { name: "Clear", emoji: "\u2600\uFE0F", rank: 0 };
  if (code === 2) return { name: "Partly cloudy", emoji: "\u26C5", rank: 2 };
  if (code === 3) return { name: "Overcast", emoji: "\u2601\uFE0F", rank: 3 };
  if (code === 45 || code === 48) return { name: "Fog", emoji: "\uD83C\uDF2B\uFE0F", rank: 4 };
  if (code >= 51 && code <= 55) return { name: "Drizzle", emoji: "\uD83C\uDF26\uFE0F", rank: 5 };
  if (code === 56 || code === 57) return { name: "Freezing drizzle", emoji: "\uD83C\uDF28\uFE0F", rank: 6 };
  if (code >= 61 && code <= 65) return { name: "Rain", emoji: "\uD83C\uDF27\uFE0F", rank: 7 };
  if (code === 66 || code === 67) return { name: "Freezing rain", emoji: "\uD83C\uDF27\uFE0F", rank: 8 };
  if (code >= 71 && code <= 77) return { name: "Snow", emoji: "\u2744\uFE0F", rank: 9 };
  if (code >= 80 && code <= 82) return { name: "Showers", emoji: "\uD83C\uDF26\uFE0F", rank: 10 };
  if (code === 85 || code === 86) return { name: "Snow showers", emoji: "\uD83C\uDF28\uFE0F", rank: 11 };
  if (code >= 95) return { name: "Thunder", emoji: "\u26C8\uFE0F", rank: 12 };
  return null;
}

function pickHours(day, hours) {
  var out = [];
  var i;
  for (i = 0; i < hours.length; i++) {
    var row = day[hours[i]];
    if (row && row.temp != null && row.code != null) out.push(row);
  }
  return out;
}

function summarize(samples) {
  var buckets = {};
  var i;
  for (i = 0; i < samples.length; i++) {
    var info = wx(samples[i].code);
    var temp = Math.round(Number(samples[i].temp));
    if (!info || isNaN(temp)) continue;
    var b = buckets[info.name];
    if (!b) {
      buckets[info.name] = { name: info.name, emoji: info.emoji, rank: info.rank, n: 1, lo: temp, hi: temp };
    } else {
      b.n++;
      if (temp < b.lo) b.lo = temp;
      if (temp > b.hi) b.hi = temp;
    }
  }
  var best = null;
  var name;
  for (name in buckets) {
    if (!buckets.hasOwnProperty(name)) continue;
    var cur = buckets[name];
    if (!best || cur.n > best.n || (cur.n === best.n && cur.rank > best.rank)) best = cur;
  }
  return best;
}

function formatLine(s) {
  if (!s) return "";
  var temp = s.lo === s.hi ? String(s.lo) : (s.lo + "\u2013" + s.hi);
  return s.emoji + " " + temp + "\u00B0 " + s.name;
}

function formatToday(morning, afternoon) {
  if (morning && afternoon && morning.name === afternoon.name) {
    return formatLine({
      name: morning.name,
      emoji: morning.emoji,
      lo: Math.min(morning.lo, afternoon.lo),
      hi: Math.max(morning.hi, afternoon.hi)
    });
  }
  if (morning && afternoon) return formatLine(morning) + " \u2192 " + formatLine(afternoon);
  return formatLine(morning || afternoon);
}

function todayContent(day, nowHour) {
  if (nowHour >= DAY_END) return "";
  var start = nowHour >= SLIDE_FROM ? nowHour : MORNING[0];
  var morningHours = [];
  var afternoonHours = [];
  var h;
  for (h = start; h < DAY_END; h++) {
    if (h < 12) morningHours.push(h);
    else afternoonHours.push(h);
  }
  return formatToday(
    summarize(pickHours(day, morningHours)),
    summarize(pickHours(day, afternoonHours))
  );
}

function buildPlans(data, nowHour) {
  var h = data && data.hourly;
  if (!h || !h.time || !h.temperature_2m || !h.weather_code) return [];
  var days = {};
  var order = [];
  var i;
  for (i = 0; i < h.time.length; i++) {
    var stamp = String(h.time[i]);
    var date = stamp.substring(0, 10);
    var hour = parseInt(stamp.substring(11, 13), 10);
    if (!days[date]) {
      days[date] = {};
      order.push(date);
    }
    days[date][hour] = { temp: h.temperature_2m[i], code: h.weather_code[i] };
  }
  var plans = [];
  var n = order.length < 7 ? order.length : 7;
  for (i = 0; i < n; i++) {
    var date = order[i];
    var day = days[date];
    if (i === 0 && nowHour >= DAY_END) {
      plans.push({ date: date, keep: true });
      continue;
    }
    var content = i === 0
      ? todayContent(day, nowHour)
      : formatLine(summarize(pickHours(day, DAYTIME)));
    if (content) plans.push({ date: date, content: content });
  }
  return plans;
}

function dueYmd(task) {
  if (!task || !task.due || !task.due.date) return "";
  return String(task.due.date).substring(0, 10);
}

function hasLabel(task) {
  var labels = task.labels || [];
  var i;
  for (i = 0; i < labels.length; i++) {
    if (labels[i] === LABEL) return true;
  }
  return false;
}

function isOurs(task) {
  return task && task.description === MARKER && !task.checked && !task.is_completed;
}

function unchanged(task, plan) {
  return task.content === plan.content && dueYmd(task) === plan.date && hasLabel(task);
}

function run() {
  function fail(reason) {
    setGlobal("WEATHER_SKIP", "1");
    setGlobal("WEATHER_DEBUG", reason);
    setGlobal("WEATHER_COUNT", 0);
    try { flash("Weather skip: " + reason); } catch (e) {}
    exit();
  }

  function http(method, url, body, headers) {
    var xhr;
    try { xhr = new XMLHttpRequest(); } catch (e) { fail("no XHR " + e); }
    xhr.open(method, url, false);
    var name;
    for (name in headers) {
      if (headers.hasOwnProperty(name)) xhr.setRequestHeader(name, headers[name]);
    }
    try { xhr.send(body == null ? null : body); } catch (e2) {
      return { status: 0, body: String(e2) };
    }
    return {
      status: xhr.status,
      body: xhr.responseText != null ? String(xhr.responseText) : ""
    };
  }

  var wxUrl = "https://api.open-meteo.com/v1/forecast?latitude=" +
    FINTRY_LAT + "&longitude=" + FINTRY_LON +
    "&hourly=temperature_2m,weather_code&forecast_days=7&timezone=Europe%2FLondon";
  var forecast = http("GET", wxUrl, null, {
    "Accept": "application/json"
  });
  if (forecast.status < 200 || forecast.status >= 300) {
    fail("forecast http " + forecast.status);
  }

  var data;
  try { data = JSON.parse(forecast.body); } catch (e3) { fail("forecast json"); }
  var plans = buildPlans(data, new Date().getHours());
  if (!plans.length) fail("no forecast days");

  var lines = [];
  var p;
  for (p = 0; p < plans.length; p++) {
    if (plans[p].content) lines.push(plans[p].date + " " + plans[p].content);
  }
  setGlobal("WEATHER_BODY", lines.join("\n"));
  setGlobal("WEATHER_COUNT", plans.length);

  var token = pick("TODOIST_TOKEN");
  if (!token) fail("no token");

  var auth = {
    "Authorization": "Bearer " + token,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  var listed = http(
    "GET",
    "https://api.todoist.com/api/v1/tasks?label=" + encodeURIComponent(LABEL) + "&limit=200",
    null,
    auth
  );
  if (listed.status < 200 || listed.status >= 300) {
    fail("todoist list " + listed.status + " " + listed.body.substring(0, 80));
  }

  var existing = [];
  try {
    var parsed = JSON.parse(listed.body);
    existing = (parsed && parsed.results) ? parsed.results : [];
  } catch (e4) { fail("todoist json"); }

  var byDate = {};
  var i;
  for (i = 0; i < existing.length; i++) {
    var task = existing[i];
    if (!isOurs(task)) continue;
    var ymd = dueYmd(task);
    if (!byDate[ymd]) byDate[ymd] = [];
    byDate[ymd].push(task);
  }

  var wanted = {};
  var errors = [];
  for (p = 0; p < plans.length; p++) {
    var plan = plans[p];
    wanted[plan.date] = true;
    if (plan.keep) continue;
    var group = byDate[plan.date] || [];
    var res = null;
    if (!group.length) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks", JSON.stringify({
        content: plan.content,
        description: MARKER,
        labels: [LABEL],
        due_date: plan.date
      }), auth);
    } else if (!unchanged(group[0], plan)) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[0].id), JSON.stringify({
        content: plan.content,
        description: MARKER,
        labels: [LABEL],
        due_date: plan.date
      }), auth);
    }
    if (res && (res.status < 200 || res.status >= 300)) {
      errors.push(plan.date + " " + res.status);
    }
    for (i = 1; i < group.length; i++) {
      var extra = http("DELETE", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[i].id), null, auth);
      if (extra.status < 200 || extra.status >= 300) errors.push("dup " + extra.status);
    }
  }

  var ymdKey;
  for (ymdKey in byDate) {
    if (!byDate.hasOwnProperty(ymdKey) || wanted[ymdKey]) continue;
    var stale = byDate[ymdKey];
    for (i = 0; i < stale.length; i++) {
      var gone = http("DELETE", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(stale[i].id), null, auth);
      if (gone.status < 200 || gone.status >= 300) errors.push("stale " + gone.status);
    }
  }

  if (errors.length) {
    setGlobal("WEATHER_SKIP", "1");
    setGlobal("WEATHER_DEBUG", errors.join("; ").substring(0, 200));
    try { flash("Weather error: " + errors[0]); } catch (e5) {}
    exit();
  }

  setGlobal("WEATHER_SKIP", "0");
  setGlobal("WEATHER_DEBUG", "ok " + plans.length);
  try { flash("Weather " + plans.length + " days"); } catch (e6) {}
}

if (typeof local === "function") run();

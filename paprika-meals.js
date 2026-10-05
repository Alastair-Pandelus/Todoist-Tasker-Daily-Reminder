// Paprika Meals → Todoist for Tasker (JavaScriptlet).
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Daily profile. Copies scheduled meals from today through the same
// date next month. The Todoist title is an icon plus the meal name,
// without the FODMAP status mark Paprika puts at the start of the recipe.
// Breakfast, Lunch and Dinner get an icon. Breakfast is due at 9:00
// for 30 minutes, lunch at 13:00 for 45 minutes and dinner at 20:00
// for 45 minutes, in the phone's local time.
// Dessert on the same day is added onto the dinner title, and that
// task stays at 20:00. A lunchtime snack (hummus, oatcakes with cheese)
// is added onto that day's lunch main, and that task stays at 13:00.
// Other meal types stay all-day. The same tasks
// are updated; meals that leave the window or the planner are deleted.
//
// Needs %TODOIST_TOKEN, %PAPRIKA_USERNAME, and %PAPRIKA_PASSWORD.

var LABEL = "meal";
var MARKER = "tasker-paprika:";
var API = "https://paprikaapp.com/api";

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

function pad(n) {
  n = String(n);
  return n.length < 2 ? "0" + n : n;
}

function ymd(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function oneLine(s) {
  return String(s || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function stripFodmap(title) {
  var marks = [
    "\u2705",
    "\u2139\uFE0F",
    "\u2139",
    "\u274C",
    "\u26A0\uFE0F",
    "\u26A0",
    "\uD83D\uDFE2",
    "\uD83D\uDFE1",
    "\uD83D\uDFE0",
    "\uD83D\uDD34"
  ];
  var s = String(title || "");
  var guard = 0;
  var i;
  while (guard < 4) {
    var hit = false;
    for (i = 0; i < marks.length; i++) {
      if (s.indexOf(marks[i]) === 0) {
        s = s.substring(marks[i].length).replace(/^\s+/, "");
        hit = true;
        break;
      }
    }
    if (!hit) break;
    guard++;
  }
  return s;
}

function mealIcon(name) {
  var n = String(name || "").toLowerCase();
  if (n === "breakfast") return "\uD83C\uDF73 ";
  if (n === "lunch") return "\uD83E\uDD57 ";
  if (n === "dinner") return "\uD83C\uDF7D\uFE0F ";
  if (n === "dessert" || n === "desserts") return "\uD83C\uDF70 ";
  return "";
}

function mealTime(name) {
  var n = String(name || "").toLowerCase();
  if (n === "breakfast") return "09:00";
  if (n === "lunch") return "13:00";
  if (n === "dinner") return "20:00";
  return "";
}

function mealSlot(name) {
  var n = String(name || "").toLowerCase();
  if (n === "dinner") return "dinner";
  if (n === "dessert" || n === "desserts") return "dessert";
  if (n === "lunch") return "lunch";
  return "";
}

function isLunchSnack(content) {
  var n = String(content || "").toLowerCase();
  if (n.indexOf("hummus") >= 0) return true;
  if (n.indexOf("oatcake") >= 0) return true;
  return false;
}

function foldLunchSnacks(plans) {
  var rest = [];
  var byDate = {};
  var dates = [];
  var i;
  for (i = 0; i < plans.length; i++) {
    var plan = plans[i];
    if (plan.slot !== "lunch") {
      rest.push(plan);
      continue;
    }
    if (!byDate[plan.date]) {
      byDate[plan.date] = [];
      dates.push(plan.date);
    }
    byDate[plan.date].push(plan);
  }
  var absorbed = {};
  for (i = 0; i < dates.length; i++) {
    var group = byDate[dates[i]];
    var mains = [];
    var snacks = [];
    var j;
    for (j = 0; j < group.length; j++) {
      if (isLunchSnack(group[j].content)) snacks.push(group[j]);
      else mains.push(group[j]);
    }
    if (!snacks.length || !mains.length) {
      for (j = 0; j < group.length; j++) rest.push(group[j]);
      continue;
    }
    var parts = [];
    var primary = mains[0];
    var source;
    for (j = 0; j < mains.length; j++) {
      source = mains[j];
      parts.push(source.content);
      if (j > 0) absorbed[source.uid] = true;
    }
    for (j = 0; j < snacks.length; j++) {
      source = snacks[j];
      parts.push(source.content);
      absorbed[source.uid] = true;
    }
    rest.push({
      uid: primary.uid,
      date: primary.date,
      time: "13:00",
      slot: "lunch",
      content: parts.join(" "),
      order: primary.order
    });
  }
  return { plans: rest, absorbed: absorbed };
}

function foldDinnerDessert(plans) {
  var rest = [];
  var byDate = {};
  var dates = [];
  var i;
  for (i = 0; i < plans.length; i++) {
    var plan = plans[i];
    if (plan.slot !== "dinner" && plan.slot !== "dessert") {
      rest.push(plan);
      continue;
    }
    if (!byDate[plan.date]) {
      byDate[plan.date] = [];
      dates.push(plan.date);
    }
    byDate[plan.date].push(plan);
  }
  var absorbed = {};
  for (i = 0; i < dates.length; i++) {
    var group = byDate[dates[i]];
    var dinners = [];
    var desserts = [];
    var j;
    for (j = 0; j < group.length; j++) {
      if (group[j].slot === "dessert") desserts.push(group[j]);
      else dinners.push(group[j]);
    }
    var parts = [];
    var primary = null;
    var source;
    for (j = 0; j < dinners.length; j++) {
      source = dinners[j];
      parts.push(source.content);
      if (!primary) primary = source;
      else absorbed[source.uid] = true;
    }
    for (j = 0; j < desserts.length; j++) {
      source = desserts[j];
      parts.push(source.content);
      if (!primary) primary = source;
      else absorbed[source.uid] = true;
    }
    rest.push({
      uid: primary.uid,
      date: primary.date,
      time: "20:00",
      content: parts.join(" "),
      order: primary.order
    });
  }
  return { plans: rest, absorbed: absorbed };
}

function dueDateTime(dateYmd, hm) {
  var dp = String(dateYmd).split("-");
  var tp = String(hm).split(":");
  var local = new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0], +tp[1], 0, 0);
  return local.getUTCFullYear() + "-" + pad(local.getUTCMonth() + 1) + "-" +
    pad(local.getUTCDate()) + "T" + pad(local.getUTCHours()) + ":" +
    pad(local.getUTCMinutes()) + ":00Z";
}

function dueRaw(task) {
  if (!task || !task.due) return "";
  if (task.due.datetime) return String(task.due.datetime);
  if (task.due.date) return String(task.due.date);
  return "";
}

function sameDue(task, plan) {
  var raw = dueRaw(task);
  if (!plan.time) return raw.substring(0, 10) === plan.date && raw.indexOf("T") < 0;
  var expected = dueDateTime(plan.date, plan.time);
  if (raw === expected || raw.indexOf(expected.substring(0, 16)) === 0) return true;
  var parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return false;
  var dp = plan.date.split("-");
  var tp = plan.time.split(":");
  return parsed.getFullYear() === +dp[0] &&
    (parsed.getMonth() + 1) === +dp[1] &&
    parsed.getDate() === +dp[2] &&
    parsed.getHours() === +tp[0] &&
    parsed.getMinutes() === +tp[1];
}

function dueFields(plan) {
  if (plan.time) return { due_datetime: dueDateTime(plan.date, plan.time) };
  return { due_date: plan.date };
}

function mealMinutes(plan) {
  if (!plan || !plan.time) return 0;
  if (plan.time === "09:00") return 30;
  if (plan.time === "13:00" || plan.time === "20:00") return 45;
  return 0;
}

function durationAmount(task) {
  if (!task || task.duration == null || task.duration === "") return 0;
  var amount;
  var unit;
  if (typeof task.duration === "object") {
    amount = parseInt(task.duration.amount, 10);
    unit = task.duration.unit ? String(task.duration.unit) : "minute";
  } else {
    amount = parseInt(task.duration, 10);
    unit = task.duration_unit ? String(task.duration_unit) : "minute";
  }
  if (isNaN(amount)) return 0;
  if (unit !== "minute") return -1;
  return amount;
}

function hasLabel(task) {
  var labels = task.labels || [];
  var i;
  for (i = 0; i < labels.length; i++) {
    if (labels[i] === LABEL) return true;
  }
  return false;
}

function mealUid(task) {
  var d = task && task.description ? String(task.description) : "";
  if (d.indexOf(MARKER) !== 0) return "";
  return d.substring(MARKER.length);
}

function run() {
  var nowDate = new Date();
  var today = nowDate.getFullYear() + "-" +
    ("0" + (nowDate.getMonth() + 1)).slice(-2) + "-" +
    ("0" + nowDate.getDate()).slice(-2);
  if (pick("MEALS_DONE") === today) {
    setGlobal("MEALS_SKIP", "1");
    setGlobal("MEALS_DEBUG", "already " + today);
    exit();
  }

  function show(msg) {
    try { flashLong(msg); } catch (e) { try { flash(msg); } catch (e2) {} }
    try { popup("Meals", msg, false, "", "", 30); } catch (e3) {}
  }

  function fail(reason) {
    setGlobal("MEALS_SKIP", "1");
    setGlobal("MEALS_DEBUG", reason);
    setGlobal("MEALS_COUNT", 0);
    show("Skip: " + reason);
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

  function parseResult(res, label) {
    if (res.status < 200 || res.status >= 300) {
      fail(label + " http " + res.status + " " + res.body.substring(0, 80));
    }
    try {
      var parsed = JSON.parse(res.body);
      return parsed && parsed.result;
    } catch (e) {
      fail(label + " json");
    }
    return null;
  }

  var email = pick("PAPRIKA_USERNAME") || pick("PAPRIKA_EMAIL");
  var password = pick("PAPRIKA_PASSWORD");
  var todoist = pick("TODOIST_TOKEN");
  if (!email || !password) fail("no paprika login");
  if (!todoist) fail("no token");

  var login = http(
    "POST",
    API + "/v1/account/login",
    "email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(password),
    {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    }
  );
  var session = parseResult(login, "paprika login");
  var paprikaToken = session && session.token;
  if (!paprikaToken) fail("paprika login");

  var paprikaAuth = {
    "Authorization": "Bearer " + paprikaToken,
    "Accept": "application/json"
  };

  var typeRows = parseResult(http("GET", API + "/v2/sync/mealtypes/", null, paprikaAuth), "meal types");
  var typeByUid = {};
  var i;
  for (i = 0; i < (typeRows || []).length; i++) {
    var row = typeRows[i];
    if (!row || row.deleted || !row.uid || !row.name) continue;
    typeByUid[String(row.uid).toUpperCase()] = {
      name: oneLine(row.name),
      order: row.order_flag != null ? row.order_flag : (row.original_type != null ? row.original_type : i)
    };
  }

  var mealRows = parseResult(http("GET", API + "/v2/sync/meals/", null, paprikaAuth), "meals");
  var start = ymd(nowDate);
  var end = ymd(addMonths(nowDate, 1));
  var plans = [];
  for (i = 0; i < (mealRows || []).length; i++) {
    var meal = mealRows[i];
    if (!meal || meal.deleted || meal.is_ingredient || !meal.uid) continue;
    var date = String(meal.date || "").substring(0, 10);
    if (!date || date < start || date > end) continue;
    var kind = typeByUid[String(meal.type_uid || "").toUpperCase()];
    if (!kind || !kind.name) continue;
    var title = stripFodmap(oneLine(meal.name));
    if (!title) continue;
    plans.push({
      uid: String(meal.uid),
      date: date,
      time: mealTime(kind.name),
      slot: mealSlot(kind.name),
      content: mealIcon(kind.name) + title,
      order: kind.order
    });
  }

  function byMeal(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    if (a.content !== b.content) return a.content < b.content ? -1 : 1;
    return a.uid < b.uid ? -1 : 1;
  }

  plans.sort(byMeal);
  var folded = foldDinnerDessert(plans);
  plans = folded.plans;
  var absorbed = folded.absorbed;
  var lunchFold = foldLunchSnacks(plans);
  plans = lunchFold.plans;
  var lunchUid;
  for (lunchUid in lunchFold.absorbed) {
    if (lunchFold.absorbed.hasOwnProperty(lunchUid)) absorbed[lunchUid] = true;
  }
  plans.sort(byMeal);

  var lines = [];
  for (i = 0; i < plans.length; i++) lines.push(plans[i].date + " " + plans[i].content);
  setGlobal("MEALS_BODY", lines.join("\n"));
  setGlobal("MEALS_COUNT", plans.length);

  var auth = {
    "Authorization": "Bearer " + todoist,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  var existing = [];
  var url = "https://api.todoist.com/api/v1/tasks?label=" + encodeURIComponent(LABEL) + "&limit=200";
  var guard = 0;
  while (url && guard < 5) {
    var listed = http("GET", url, null, auth);
    if (listed.status < 200 || listed.status >= 300) {
      fail("todoist list " + listed.status + " " + listed.body.substring(0, 80));
    }
    var parsed;
    try { parsed = JSON.parse(listed.body); } catch (e3) { fail("todoist json"); }
    var results = (parsed && parsed.results) ? parsed.results : [];
    for (i = 0; i < results.length; i++) existing.push(results[i]);
    url = parsed && parsed.next_cursor
      ? "https://api.todoist.com/api/v1/tasks?label=" + encodeURIComponent(LABEL) +
        "&limit=200&cursor=" + encodeURIComponent(parsed.next_cursor)
      : "";
    guard++;
  }

  var byUid = {};
  for (i = 0; i < existing.length; i++) {
    var task = existing[i];
    if (!task || task.checked || task.is_completed) continue;
    var uid = mealUid(task);
    if (!uid) continue;
    if (!byUid[uid]) byUid[uid] = [];
    byUid[uid].push(task);
  }

  var wanted = {};
  var errors = [];
  var p;
  for (p = 0; p < plans.length; p++) {
    var plan = plans[p];
    wanted[plan.uid] = true;
    var group = byUid[plan.uid] || [];
    var minutes = mealMinutes(plan);
    var same = group.length &&
      group[0].content === plan.content &&
      sameDue(group[0], plan) &&
      hasLabel(group[0]) &&
      durationAmount(group[0]) === minutes;
    var payload = {
      content: plan.content,
      description: MARKER + plan.uid,
      labels: [LABEL]
    };
    var due = dueFields(plan);
    var dueKey;
    for (dueKey in due) {
      if (due.hasOwnProperty(dueKey)) payload[dueKey] = due[dueKey];
    }
    if (minutes) {
      payload.duration = minutes;
      payload.duration_unit = "minute";
    }
    var res = null;
    if (!group.length) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks", JSON.stringify(payload), auth);
    } else if (!same) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[0].id), JSON.stringify(payload), auth);
    }
    if (res && (res.status < 200 || res.status >= 300)) errors.push(plan.date + " " + res.status);
    for (i = 1; i < group.length; i++) {
      var extra = http("DELETE", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[i].id), null, auth);
      if (extra.status < 200 || extra.status >= 300) errors.push("dup " + extra.status);
    }
  }

  var uidKey;
  for (uidKey in byUid) {
    if (!byUid.hasOwnProperty(uidKey) || (wanted[uidKey] && !absorbed[uidKey])) continue;
    var stale = byUid[uidKey];
    for (i = 0; i < stale.length; i++) {
      var gone = http("DELETE", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(stale[i].id), null, auth);
      if (gone.status < 200 || gone.status >= 300) errors.push("stale " + gone.status);
    }
  }

  if (errors.length) {
    setGlobal("MEALS_SKIP", "1");
    setGlobal("MEALS_DEBUG", errors.join("; ").substring(0, 200));
    show("Error: " + errors[0]);
    exit();
  }

  setGlobal("MEALS_DONE", today);
  setGlobal("MEALS_SKIP", "0");
  setGlobal("MEALS_DEBUG", "ok " + plans.length);
}

if (typeof local === "function") run();

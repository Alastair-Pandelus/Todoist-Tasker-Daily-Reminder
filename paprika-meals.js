// Paprika Meals → Todoist for Tasker (JavaScriptlet).
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Daily profile. Copies scheduled meals from today through the same
// date next month. The Todoist title is an icon plus the meal name,
// without the FODMAP status mark Paprika puts at the start of the recipe.
// Breakfast, Lunch, Dinner and Dessert get an icon. The same tasks are
// updated; meals that leave the window or the planner are deleted.
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

function mealUid(task) {
  var d = task && task.description ? String(task.description) : "";
  if (d.indexOf(MARKER) !== 0) return "";
  return d.substring(MARKER.length);
}

function run() {
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
  var today = new Date();
  var start = ymd(today);
  var end = ymd(addMonths(today, 1));
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
      content: mealIcon(kind.name) + title,
      order: kind.order
    });
  }

  plans.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    if (a.content !== b.content) return a.content < b.content ? -1 : 1;
    return a.uid < b.uid ? -1 : 1;
  });

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
    var same = group.length &&
      group[0].content === plan.content &&
      dueYmd(group[0]) === plan.date &&
      hasLabel(group[0]);
    var res = null;
    if (!group.length) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks", JSON.stringify({
        content: plan.content,
        description: MARKER + plan.uid,
        labels: [LABEL],
        due_date: plan.date
      }), auth);
    } else if (!same) {
      res = http("POST", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[0].id), JSON.stringify({
        content: plan.content,
        description: MARKER + plan.uid,
        labels: [LABEL],
        due_date: plan.date
      }), auth);
    }
    if (res && (res.status < 200 || res.status >= 300)) errors.push(plan.date + " " + res.status);
    for (i = 1; i < group.length; i++) {
      var extra = http("DELETE", "https://api.todoist.com/api/v1/tasks/" + encodeURIComponent(group[i].id), null, auth);
      if (extra.status < 200 || extra.status >= 300) errors.push("dup " + extra.status);
    }
  }

  var uidKey;
  for (uidKey in byUid) {
    if (!byUid.hasOwnProperty(uidKey) || wanted[uidKey]) continue;
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

  setGlobal("MEALS_SKIP", "0");
  setGlobal("MEALS_DEBUG", "ok " + plans.length);
}

if (typeof local === "function") run();

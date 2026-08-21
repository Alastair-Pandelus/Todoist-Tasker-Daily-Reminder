// Todoist daily digest for Tasker (JavaScriptlet).
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Reads %TODOIST_JSON (or %todoist_http_data / %http_data), then writes:
//   MORNING_TODOIST_SKIP, TITLE, BODY, HTML, URGENT, TOTAL, SHOWN
//   MENU_LABELS, MENU_URLS
//
// Paste the body of this file into Tasker → Code → JavaScriptlet.

function pick(name, isGlobal) {
  var v;
  try { v = isGlobal ? global(name) : local(name); } catch (e) { return ""; }
  if (!v || v.charAt(0) === "%") return "";
  return v;
}

var raw = pick("TODOIST_JSON", true) ||
          pick("todoist_http_data", false) ||
          pick("http_data", false);

var tasks = [];
if (raw) {
  try { tasks = JSON.parse(raw).results || []; } catch (e) { tasks = []; }
}

var WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var RECUR_SHOW_DAYS = 1;
var MAX_NAME = 30;
var DEFAULT_TITLE = "Morning Tasks";

function ymd(d) {
  return d.getFullYear() + "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
    ("0" + d.getDate()).slice(-2);
}

function fromYmd(s) {
  var p = s.split("-");
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

var todayStr = ymd(new Date());

function dayDiff(a, b) {
  return Math.round((fromYmd(a).getTime() - fromYmd(b).getTime()) / 86400000);
}

function dueInfo(t) {
  if (!t.due || !t.due.date) return null;
  var s = t.due.date, dateStr;
  if (s.length === 10) {
    dateStr = s;
  } else {
    var p = new Date(s);
    dateStr = isNaN(p.getTime()) ? s.substring(0, 10) : ymd(p);
  }
  return { date: dateStr, recurring: !!t.due.is_recurring };
}

function clip(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.substring(0, n - 1) + "\u2026";
}

function escHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateMark(t) {
  var OVERDUE = "\u26A0\uFE0F";
  var TODAY   = "\uD83D\uDCCC";
  if (!t._i) return TODAY;
  var diff = dayDiff(t._i.date, todayStr);
  if (diff < 0) return OVERDUE;
  if (diff === 0) return TODAY;
  if (diff === 1) return "\u27A1\uFE0F";
  if (diff === 2) return "\uD83D\uDD1C";
  return WEEKDAYS[fromYmd(t._i.date).getDay()];
}

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isPictogram(s) {
  s = (s || "").replace(/\s+/g, "").replace(/\uFE0E|\uFE0F/g, "");
  if (!s || /[A-Za-z0-9]/.test(s)) return false;
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) i++;
    n++;
  }
  return n === 1;
}

var items = [];
var seenIds = {};
var seenRecurring = {};

tasks.forEach(function (t) {
  if (!t || !t.id || seenIds[t.id]) return;
  seenIds[t.id] = true;

  t._i = dueInfo(t);

  if (t._i && t._i.recurring) {
    var rKey = norm(t.content);
    if (seenRecurring[rKey]) return;
    if (dayDiff(t._i.date, todayStr) > RECUR_SHOW_DAYS) return;
    seenRecurring[rKey] = true;
  }

  if (t._i) {
    t._sort = t._i.date;
    t._rank = 1;
  } else {
    t._sort = todayStr;
    t._rank = 0;
  }
  items.push(t);
});

items.sort(function (a, b) {
  if (a._sort !== b._sort) return a._sort < b._sort ? -1 : 1;
  if (a._rank !== b._rank) return a._rank - b._rank;
  if (b.priority !== a.priority) return b.priority - a.priority;
  return 0;
});

var groups = [];
var groupMap = {};
items.forEach(function (t) {
  var k = t._i ? t._i.date : todayStr;
  if (!groupMap[k]) {
    groupMap[k] = { texts: [], pics: [] };
    groups.push(groupMap[k]);
  }
  if (isPictogram(t.content)) groupMap[k].pics.push(t);
  else groupMap[k].texts.push(t);
});

var out = [], html = [], menuLabels = [], menuUrls = [], urgent = 0;

function bumpUrgent(t) {
  if (!t._i || t._i.date <= todayStr) urgent++;
}

function emitText(t) {
  var mark = dateMark(t);
  var name = clip(t.content, MAX_NAME);
  var appUrl = "todoist://task?id=" + t.id;
  var line = mark + " " + name;
  out.push(line);
  html.push(mark + ' <a href="' + appUrl + '">' + escHtml(name) + "</a>");
  menuLabels.push(line);
  menuUrls.push(t.id);
  bumpUrgent(t);
}

function emitPics(pics) {
  if (!pics.length) return;
  var mark = dateMark(pics[0]);
  var names = [];
  var htmlBits = [];
  pics.forEach(function (t) {
    names.push(t.content);
    htmlBits.push('<a href="todoist://task?id=' + t.id + '">' + escHtml(t.content) + "</a>");
    menuLabels.push(mark + " " + t.content);
    menuUrls.push(t.id);
    bumpUrgent(t);
  });
  out.push(mark + " " + names.join(" "));
  html.push(mark + " " + htmlBits.join(" "));
}

groups.forEach(function (g) {
  g.texts.forEach(emitText);
  emitPics(g.pics);
});

if (!out.length) {
  setGlobal("MORNING_TODOIST_SKIP", "1");
  setGlobal("MORNING_TODOIST_TITLE", "");
  setGlobal("MORNING_TODOIST_BODY", "");
  setGlobal("MORNING_TODOIST_HTML", "");
  setGlobal("MORNING_TODOIST_URGENT", 0);
  setGlobal("MORNING_TODOIST_TOTAL", tasks.length);
  setGlobal("MORNING_TODOIST_SHOWN", 0);
  setGlobal("MENU_LABELS", "");
  setGlobal("MENU_URLS", "");
} else {
  setGlobal("MORNING_TODOIST_SKIP", "0");
  setGlobal("MORNING_TODOIST_TITLE", out.length === 1 ? out[0] : DEFAULT_TITLE);
  setGlobal("MORNING_TODOIST_BODY", out.join("\n"));
  setGlobal("MORNING_TODOIST_HTML", html.join("<br>"));
  setGlobal("MORNING_TODOIST_URGENT", urgent);
  setGlobal("MORNING_TODOIST_TOTAL", tasks.length);
  setGlobal("MORNING_TODOIST_SHOWN", items.length);
  setGlobal("MENU_LABELS", menuLabels.join("\n"));
  setGlobal("MENU_URLS", menuUrls.join("\n"));
}

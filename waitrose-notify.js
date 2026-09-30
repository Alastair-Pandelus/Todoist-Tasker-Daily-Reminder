// Waitrose geofence notify for Tasker.
// Loaded from Tasker/scripts/waitrose-notify.js.
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Tasker's JS engine has no `java` global — do not fetch here.
// Put an HTTP Request action BEFORE this script.
//
// Task order:
//   1. HTTP Request  GET tasks?project_id=…  prefix waitrose
//   2. Tasker/scripts/waitrose-notify.js
//   3. If %WAITROSE_SKIP eq 1 → Stop → End If
//   4. AutoNotification  Title %WAITROSE_TITLE  Text %WAITROSE_BODY
//
// After a run, check %WAITROSE_DEBUG (or the on-screen flash).

var PROJECT_ID = "6hFR9RC3MvM7MQWW";
var MAX_NAME = 40;
var DEFAULT_TITLE = "\uD83C\uDF3F Waitrose";
var COOLDOWN_SECS = 3600;

function pick(name) {
  var v;
  try { v = global(name); } catch (e) { return ""; }
  if (!v || v.charAt(0) === "%") return "";
  return String(v);
}

function clip(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.substring(0, n - 1) + "\u2026";
}

function skip(reason) {
  reason = reason || "skip";
  setGlobal("WAITROSE_SKIP", "1");
  setGlobal("WAITROSE_TITLE", "");
  setGlobal("WAITROSE_BODY", "");
  setGlobal("WAITROSE_COUNT", 0);
  setGlobal("WAITROSE_DEBUG", reason);
  try { flash("Waitrose skip: " + reason); } catch (e) {}
  exit();
}

var now = parseInt(pick("TIMES"), 10);
var nextOk = parseInt(pick("WaitroseNextOk"), 10);
if (!isNaN(now) && !isNaN(nextOk) && now < nextOk) {
  skip("cooldown " + (nextOk - now) + "s left");
}

var homeWifi = pick("WAITROSE_HOME_WIFI");
var wifi = pick("WIFII");
if (homeWifi && wifi && new RegExp(homeWifi, "i").test(wifi)) {
  skip("home wifi");
}

var raw = pick("waitrose_http_data") || pick("http_data");
setGlobal("WAITROSE_HTTP_LEN", String(raw ? raw.length : 0));
if (!raw) skip("no http body");

var tasks = [];
try {
  var parsed = JSON.parse(raw);
  if (parsed && parsed.results) tasks = parsed.results;
  else if (parsed && parsed.length) tasks = parsed;
} catch (e) { skip("json " + e); }

var names = [];
var seen = {};
for (var i = 0; i < tasks.length; i++) {
  var t = tasks[i];
  if (!t || !t.id || t.checked || t.is_completed || seen[t.id]) continue;
  var pid = t.projectId || t.project_id;
  if (pid && String(pid) !== PROJECT_ID) continue;
  seen[t.id] = true;
  var name = clip(t.content, MAX_NAME);
  if (name) names.push(name);
}

if (!names.length) skip("empty n=" + tasks.length);

setGlobal("WAITROSE_SKIP", "0");
setGlobal("WAITROSE_DEBUG", "ok " + names.length);
setGlobal("WAITROSE_COUNT", names.length);
try { flash("Waitrose ok " + names.length); } catch (e) {}
if (names.length === 1) {
  setGlobal("WAITROSE_TITLE", DEFAULT_TITLE + " " + names[0]);
  setGlobal("WAITROSE_BODY", names[0]);
} else {
  setGlobal("WAITROSE_TITLE", DEFAULT_TITLE);
  setGlobal("WAITROSE_BODY", names.join("\n"));
}

if (!isNaN(now)) {
  setGlobal("WaitroseNextOk", String(now + COOLDOWN_SECS));
}

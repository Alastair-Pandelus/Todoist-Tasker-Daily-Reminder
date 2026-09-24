// Waitrose geofence notify for Tasker — single JavaScriptlet.
// Copyright (c) 2026 Alastair Pandelusstell
// SPDX-License-Identifier: MIT
//
// Fetches via XMLHttpRequest (Tasker documents this; `java` is not available).
// AutoNotification cannot run from JS — keep it as the action after Stop.
//
// Task order:
//   1. This JavaScriptlet  (timeout 45s)
//   2. If %WAITROSE_SKIP eq 1 → Stop → End If
//   3. AutoNotification  Title %WAITROSE_TITLE  Text %WAITROSE_BODY

var PROJECT_ID = "6hFR9RC3MvM7MQWW";
var MAX_NAME = 40;
var DEFAULT_TITLE = "\uD83C\uDF3F Waitrose";
var COOLDOWN_SECS = 3600;

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

function httpGetAuth(url, token) {
  var xhr;
  try { xhr = new XMLHttpRequest(); } catch (e) { skip("no XHR " + e); }
  xhr.open("GET", url, false);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.setRequestHeader("Accept", "application/json");
  try { xhr.send(null); } catch (e2) { skip("http send " + e2); }
  setGlobal("WAITROSE_HTTP_CODE", String(xhr.status));
  var body = xhr.responseText != null ? String(xhr.responseText) : "";
  if (xhr.status < 200 || xhr.status >= 300) {
    skip("http " + xhr.status + " " + body.substring(0, 80));
  }
  return body;
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

var token = pick("TODOIST_TOKEN");
if (!token) skip("no token");

var url = "https://api.todoist.com/api/v1/tasks?project_id=" +
  encodeURIComponent(PROJECT_ID) + "&limit=50";

var raw = httpGetAuth(url, token);
setGlobal("WAITROSE_HTTP_LEN", String(raw ? raw.length : 0));
if (!raw) skip("empty http body");

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

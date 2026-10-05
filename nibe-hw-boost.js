// Nibe F1245 hot water boost for Tasker.
// Loaded from Tasker/scripts/nibe-hw-boost.js.
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Reads %NIBE_CLIENT_ID and %NIBE_CLIENT_SECRET from Tasker Vars.
// Those values stay on the phone. Do not put them in this file.
//
// Local %mode: start (default), check, or stop.
// Local %par1: deadline HH:mm. The 14:30 profile passes 15:00.
//
// One-time increase is switched on, then off when the tank top is
// above 50C, so the lux cycle does not keep heating on the immersion.
// It is also forced off at the deadline. A manual run has no deadline,
// so it is forced off after 30 minutes. The boost is for a shower;
// leaving one-time increase on after that reheats the tank once the
// water has cooled, and that heat is not used.
//
// Start runs only while %WIFII shows a Fintry SSID (the same networks
// as the Fintry Todo profile), and only if the Todoist task
// "Boost hot water for shower" is still open and due at 14:30 today.
// The 3pm stop still runs without those checks.
//
// If the boiler cannot be reached, or the API key is rejected, the
// phone gets one notification and a running boost is switched off.
//
// Hot water boost is parameter 48132 (4 = one-time increase, 0 = off).
// Tank temperature is hot water top BT7, parameter 40013.

var DEVICE_ID = "emmy-r-46750-20240918-66540510312002-54-10-ec-12-c0-2b";
var BOOST_ID = "48132";
var BOOST_ON = 4;
var BOOST_OFF = 0;
var TEMP_ID = "40013";
var TARGET_C = 50;
var MANUAL_MINUTES = 30;
var SHOWER_TASK = "\u2668\uFE0F Boost hot water for shower";
var TODOIST_FILTER = "https://api.todoist.com/api/v1/tasks/filter";
var FINTRY_SSIDS = ["TP-LINK_03FA_5GHz", "TP-LINK_03FA_2_4GHZ", "oldmanse"];
var TOKEN_URL = "https://api.myuplink.com/oauth/token";
var API_BASE = "https://api.myuplink.com/v2/devices/" + DEVICE_ID + "/points";

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

function note(msg) {
  setGlobal("NIBE_HW_DEBUG", msg);
  try { flash(msg); } catch (e) {}
}

function announce(title, body) {
  setGlobal("NIBE_HW_TITLE", title);
  setGlobal("NIBE_HW_BODY", body);
  setGlobal("NIBE_HW_NOTIFY", "1");
  note(title + ": " + body);
}

function quietHttp(method, url, body, headers) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    var key;
    for (key in headers) {
      if (headers.hasOwnProperty(key)) xhr.setRequestHeader(key, headers[key]);
    }
    if (body == null) xhr.send("");
    else xhr.send(body);
    return xhr;
  } catch (e) {
    return null;
  }
}

function quietToken() {
  var id = pick("NIBE_CLIENT_ID");
  var secret = pick("NIBE_CLIENT_SECRET");
  if (!id || !secret) return "";
  var body = "grant_type=client_credentials" +
    "&client_id=" + encodeURIComponent(id) +
    "&client_secret=" + encodeURIComponent(secret) +
    "&scope=" + encodeURIComponent("READSYSTEM WRITESYSTEM");
  var xhr = quietHttp("POST", TOKEN_URL, body, {
    "Content-Type": "application/x-www-form-urlencoded"
  });
  if (!xhr || xhr.status < 200 || xhr.status >= 300) return "";
  try {
    var parsed = JSON.parse(xhr.responseText);
    if (parsed && parsed.access_token) return parsed.access_token;
  } catch (e) {}
  return "";
}

function quietWriteOff(token) {
  var xhr = quietHttp("PATCH", API_BASE, "{\"" + BOOST_ID + "\":" + BOOST_OFF + "}", {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "en-GB"
  });
  return !!(xhr && xhr.status >= 200 && xhr.status < 300);
}

function boilerError(msg) {
  var wasOn = pick("NIBE_HW_ACTIVE") === "1";
  var switched = false;
  if (wasOn) {
    var token = quietToken();
    if (token) switched = quietWriteOff(token);
  }
  setGlobal("NIBE_HW_ACTIVE", "0");
  setGlobal("NIBE_HW_DEADLINE", "");
  var body = msg;
  if (wasOn) body += switched ? " Boost switched off." : " Boost could not be switched off.";
  else body += " Boost not started.";
  var key = ymd(new Date()) + "|" + body;
  if (pick("NIBE_HW_ERROR") === key) {
    setGlobal("NIBE_HW_DEBUG", body);
    exit();
  }
  setGlobal("NIBE_HW_ERROR", key);
  announce("Hot water boost error", body);
  exit();
}

function http(method, url, body, headers) {
  return quietHttp(method, url, body, headers);
}

function boilerHttp(method, url, body, headers) {
  var xhr = quietHttp(method, url, body, headers);
  if (!xhr) boilerError("Cannot reach the boiler.");
  return xhr;
}

function accessToken() {
  var id = pick("NIBE_CLIENT_ID");
  var secret = pick("NIBE_CLIENT_SECRET");
  if (!id || !secret) boilerError("API key missing.");
  var body = "grant_type=client_credentials" +
    "&client_id=" + encodeURIComponent(id) +
    "&client_secret=" + encodeURIComponent(secret) +
    "&scope=" + encodeURIComponent("READSYSTEM WRITESYSTEM");
  var xhr = boilerHttp("POST", TOKEN_URL, body, {
    "Content-Type": "application/x-www-form-urlencoded"
  });
  if (xhr.status === 400 || xhr.status === 401 || xhr.status === 403) boilerError("API key invalid.");
  if (xhr.status < 200 || xhr.status >= 300) boilerError("Boiler login failed (" + xhr.status + ").");
  var parsed;
  try { parsed = JSON.parse(xhr.responseText); } catch (e) { boilerError("Boiler login reply was not readable."); }
  if (!parsed || !parsed.access_token) boilerError("Boiler login did not return a key.");
  return parsed.access_token;
}

function authHeader(token) {
  // Tasker sends an Accept-Language the API rejects, which made every
  // temperature read fail. en-GB is a locale it accepts.
  return {
    Authorization: "Bearer " + token,
    Accept: "application/json",
    "Accept-Language": "en-GB"
  };
}

function writeBoost(token, value) {
  var xhr = boilerHttp("PATCH", API_BASE, "{\"" + BOOST_ID + "\":" + value + "}", {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "en-GB"
  });
  if (xhr.status === 401 || xhr.status === 403) boilerError("API key invalid.");
  if (xhr.status < 200 || xhr.status >= 300) boilerError("Boost switch failed (" + xhr.status + ").");
}

function pointsFrom(text) {
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { return null; }
  if (!parsed) return null;
  if (parsed.length) return parsed;
  if (parsed.points && parsed.points.length) return parsed.points;
  if (parsed.items && parsed.items.length) return parsed.items;
  if (parsed.value != null) return [parsed];
  return null;
}

function tempFrom(list) {
  var i, point, id, value;
  for (i = 0; i < list.length; i++) {
    point = list[i];
    id = point.parameterId;
    if (id == null) id = point.id;
    if (String(id) !== TEMP_ID && list.length !== 1) continue;
    value = Number(point.value);
    if (!isNaN(value)) return value;
  }
  return null;
}

var readTempStatus = 0;

function readTemp(token) {
  var urls = [API_BASE + "?parameterId=" + TEMP_ID, API_BASE];
  var i, xhr, list, value;
  readTempStatus = 0;
  for (i = 0; i < urls.length; i++) {
    xhr = boilerHttp("GET", urls[i], null, authHeader(token));
    if (xhr.status === 401 || xhr.status === 403) boilerError("API key invalid.");
    if (xhr.status < 200 || xhr.status >= 300) {
      readTempStatus = xhr.status;
      continue;
    }
    list = pointsFrom(xhr.responseText);
    if (!list) continue;
    value = tempFrom(list);
    if (value !== null) return value;
  }
  return null;
}

function ymd(d) {
  return d.getFullYear() + "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
    ("0" + d.getDate()).slice(-2);
}

function dueIsTodayAt1430(dateStr) {
  if (!dateStr) return false;
  dateStr = String(dateStr);
  var today = ymd(new Date());
  var z = dateStr.charAt(dateStr.length - 1) === "Z" || dateStr.indexOf("+") >= 0;
  if (z) {
    var parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return false;
    return ymd(parsed) === today && parsed.getHours() === 14 && parsed.getMinutes() === 30;
  }
  return dateStr.substring(0, 10) === today && dateStr.substring(11, 16) === "14:30";
}

function dueString(task) {
  if (!task) return "";
  if (task.due) {
    if (task.due.datetime) return String(task.due.datetime);
    if (task.due.date) return String(task.due.date);
  }
  if (task.dueDate) return String(task.dueDate);
  return "";
}

function showerDueToday(task) {
  var dateStr = dueString(task);
  if (dueIsTodayAt1430(dateStr)) return true;
  if (dateStr.substring(0, 10) !== ymd(new Date())) return false;
  if (dateStr.indexOf("T") >= 0) return false;
  var hint = "";
  if (task.due && task.due.string) hint = String(task.due.string);
  else if (task.recurring) hint = String(task.recurring);
  return hint.indexOf("2:30") >= 0 || hint.indexOf("14:30") >= 0;
}

function showerTaskOpen() {
  var token = pick("TODOIST_TOKEN");
  if (!token) return "no todoist token";
  var query = "today & search: Boost hot water for shower";
  var url = TODOIST_FILTER + "?query=" + encodeURIComponent(query) + "&limit=50";
  var xhr = http("GET", url, null, {
    Authorization: "Bearer " + token,
    Accept: "application/json"
  });
  if (!xhr) return "todoist unreachable";
  if (xhr.status < 200 || xhr.status >= 300) return "todoist " + xhr.status;
  var parsed;
  try { parsed = JSON.parse(xhr.responseText); } catch (e) { return "todoist json"; }
  var list = parsed && parsed.results ? parsed.results : [];
  var i, task;
  for (i = 0; i < list.length; i++) {
    task = list[i];
    if (!task || !task.content) continue;
    if (task.content !== SHOWER_TASK && task.content.indexOf("Boost hot water for shower") < 0) continue;
    if (task.checked || task.is_completed) continue;
    if (showerDueToday(task)) return "";
  }
  return "no open 2:30 shower task";
}

function atFintry() {
  var wifi = pick("WIFII");
  var conn = wifi.split(">>> SCAN")[0];
  if (conn.indexOf("CONNECTION") < 0) return false;
  var i;
  for (i = 0; i < FINTRY_SSIDS.length; i++) {
    if (conn.indexOf(FINTRY_SSIDS[i]) >= 0) return true;
  }
  return false;
}

function nowMs() {
  return new Date().getTime();
}

function minutesNow() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function startedMs() {
  var raw = parseInt(pick("NIBE_HW_STARTED"), 10);
  if (isNaN(raw) || raw <= 0) return 0;
  if (raw < 10000000000) return raw * 1000;
  return raw;
}

function manualLimitReached() {
  if (pick("NIBE_HW_DEADLINE")) return false;
  var start = startedMs();
  if (!start) return false;
  return nowMs() - start >= MANUAL_MINUTES * 60 * 1000;
}

function minutesOf(hm) {
  var p = String(hm).split(":");
  if (p.length < 2) return null;
  var h = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function turnOff(token, reason) {
  writeBoost(token, BOOST_OFF);
  setGlobal("NIBE_HW_ACTIVE", "0");
  setGlobal("NIBE_HW_DEADLINE", "");
  announce("Hot water boost off", reason);
}

function startBoost() {
  if (pick("NIBE_HW_ACTIVE") === "1") {
    setGlobal("NIBE_HW_DEBUG", "boost already on");
    exit();
  }
  var shower = showerTaskOpen();
  if (shower) {
    setGlobal("NIBE_HW_ACTIVE", "0");
    var skipKey = ymd(new Date()) + "|" + shower;
    if (pick("NIBE_HW_SKIP") === skipKey) {
      setGlobal("NIBE_HW_DEBUG", shower);
      exit();
    }
    setGlobal("NIBE_HW_SKIP", skipKey);
    note("Hot water boost skipped: " + shower);
    exit();
  }
  if (!atFintry()) {
    setGlobal("NIBE_HW_ACTIVE", "0");
    note("Hot water boost skipped: not on Fintry wifi");
    exit();
  }
  var deadline = pick("par1");
  if (minutesOf(deadline) === null) deadline = "";
  var token = accessToken();
  writeBoost(token, BOOST_ON);
  setGlobal("NIBE_HW_ACTIVE", "1");
  setGlobal("NIBE_HW_DEADLINE", deadline);
  setGlobal("NIBE_HW_STARTED", pick("TIMES") || String(Math.floor(new Date().getTime() / 1000)));
  setGlobal("NIBE_HW_LOOPS", "0");
  setGlobal("NIBE_HW_CHECKED", "0");
  setGlobal("NIBE_HW_UNREAD", "0");
  if (deadline) announce("Hot water boost on", "Until " + deadline + " or above " + TARGET_C + "C");
  else announce("Hot water boost on", "Until above " + TARGET_C + "C or " + MANUAL_MINUTES + " minutes");
}

function checkBoost() {
  if (pick("NIBE_HW_ACTIVE") !== "1") {
    setGlobal("NIBE_HW_ACTIVE", "0");
    return;
  }
  var checked = parseInt(pick("NIBE_HW_CHECKED"), 10);
  if (!isNaN(checked) && checked > 0 && nowMs() - checked < 50000) return;
  setGlobal("NIBE_HW_CHECKED", String(nowMs()));

  var deadline = pick("NIBE_HW_DEADLINE");
  var deadlineMin = minutesOf(deadline);
  if (deadlineMin !== null && minutesNow() >= deadlineMin) {
    turnOff(accessToken(), "Stopped at " + deadline);
    return;
  }
  if (manualLimitReached()) {
    turnOff(accessToken(), "Stopped after " + MANUAL_MINUTES + " minutes");
    return;
  }
  switchOffIfHot();
}

function switchOffIfHot() {
  var token = accessToken();
  var temp = readTemp(token);
  if (temp === null || isNaN(temp)) {
    if (readTempStatus) boilerError("Tank temperature request failed (" + readTempStatus + ").");
    boilerError("Tank temperature was not returned.");
  }
  setGlobal("NIBE_HW_UNREAD", "0");
  setGlobal("NIBE_HW_TEMP", String(temp));
  if (temp > TARGET_C) {
    turnOff(token, "Tank is " + temp + "C");
    return;
  }
  note("Hot water " + temp + "C");
}

function stopBoost() {
  var wasOn = pick("NIBE_HW_ACTIVE") === "1";
  var token = accessToken();
  writeBoost(token, BOOST_OFF);
  setGlobal("NIBE_HW_ACTIVE", "0");
  setGlobal("NIBE_HW_DEADLINE", "");
  if (wasOn) announce("Hot water boost off", "Stopped at 3pm");
  else setGlobal("NIBE_HW_DEBUG", "boost already off");
}

setGlobal("NIBE_HW_NOTIFY", "0");
var mode = pick("mode");
if (!mode) mode = "start";
if (mode === "check") checkBoost();
else if (mode === "stop") stopBoost();
else startBoost();

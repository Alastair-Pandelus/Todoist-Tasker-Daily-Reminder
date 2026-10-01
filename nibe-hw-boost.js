// Nibe F1245 hot water boost for Tasker.
// Loaded from Tasker/scripts/nibe-hw-boost.js.
// Copyright (c) 2026 Alastair Pandelus
// SPDX-License-Identifier: MIT
//
// Reads %NIBE_CLIENT_ID and %NIBE_CLIENT_SECRET from Tasker Vars.
// Those values stay on the phone. Do not put them in this file.
//
// Local %mode: start (default), check, or stop.
// Local %par1: optional deadline HH:mm, used by start. The 14:30
// profile passes 15:00. A manual run leaves it blank and the boost
// ends when the tank top is above 48C, or after 3 hours.
//
// Start and the minute check run only while %WIFII shows a Fintry
// SSID (the same two networks as the Fintry Todo profile). Leaving
// Fintry cancels the boost. The 3pm stop still runs without that check.
//
// Hot water boost is parameter 48132 (4 = one-time increase, 0 = off).
// Tank temperature is hot water top BT7, parameter 40013.

var DEVICE_ID = "emmy-r-46750-20240918-66540510312002-54-10-ec-12-c0-2b";
var BOOST_ID = "48132";
var BOOST_ON = 4;
var BOOST_OFF = 0;
var TEMP_ID = "40013";
var TARGET_C = 48;
var SAFETY_MINUTES = 180;
var FINTRY_SSIDS = ["TP-LINK_03FA_5GHz", "TP-LINK_03FA_2_4GHZ"];
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

function fail(msg) {
  setGlobal("NIBE_HW_ACTIVE", "0");
  note(msg);
  exit();
}

function http(method, url, body, headers) {
  var xhr;
  try { xhr = new XMLHttpRequest(); } catch (e) { fail("no XHR " + e); }
  xhr.open(method, url, false);
  var key;
  for (key in headers) {
    if (headers.hasOwnProperty(key)) xhr.setRequestHeader(key, headers[key]);
  }
  try { xhr.send(body); } catch (e2) { fail(method + " " + e2); }
  return xhr;
}

function accessToken() {
  var id = pick("NIBE_CLIENT_ID");
  var secret = pick("NIBE_CLIENT_SECRET");
  if (!id || !secret) fail("Nibe credentials missing");
  var body = "grant_type=client_credentials" +
    "&client_id=" + encodeURIComponent(id) +
    "&client_secret=" + encodeURIComponent(secret) +
    "&scope=" + encodeURIComponent("READSYSTEM WRITESYSTEM");
  var xhr = http("POST", TOKEN_URL, body, {
    "Content-Type": "application/x-www-form-urlencoded"
  });
  if (xhr.status < 200 || xhr.status >= 300) fail("token " + xhr.status);
  var parsed;
  try { parsed = JSON.parse(xhr.responseText); } catch (e) { fail("token json"); }
  if (!parsed || !parsed.access_token) fail("token empty");
  return parsed.access_token;
}

function authHeader(token) {
  return { Authorization: "Bearer " + token, Accept: "application/json" };
}

function writeBoost(token, value) {
  var xhr = http("PATCH", API_BASE, "{\"" + BOOST_ID + "\":" + value + "}", {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json"
  });
  if (xhr.status < 200 || xhr.status >= 300) fail("boost write " + xhr.status);
}

function readTemp(token) {
  var xhr = http("GET", API_BASE + "?parameterId=" + TEMP_ID, null, authHeader(token));
  if (xhr.status < 200 || xhr.status >= 300) return null;
  var list;
  try { list = JSON.parse(xhr.responseText); } catch (e) { return null; }
  if (!list || !list.length) return null;
  var i;
  for (i = 0; i < list.length; i++) {
    if (String(list[i].parameterId) === TEMP_ID) return Number(list[i].value);
  }
  return null;
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

function minutesNow() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
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
  if (!atFintry()) {
    setGlobal("NIBE_HW_ACTIVE", "0");
    note("Hot water boost skipped: not on Fintry wifi");
    return;
  }
  var deadline = pick("par1");
  if (minutesOf(deadline) === null) deadline = "";
  var token = accessToken();
  writeBoost(token, BOOST_ON);
  setGlobal("NIBE_HW_ACTIVE", "1");
  setGlobal("NIBE_HW_DEADLINE", deadline);
  setGlobal("NIBE_HW_STARTED", pick("TIMES") || String(Math.floor(new Date().getTime() / 1000)));
  setGlobal("NIBE_HW_LOOPS", "0");
  if (deadline) announce("Hot water boost on", "Until " + deadline + " or above " + TARGET_C + "C");
  else announce("Hot water boost on", "Until above " + TARGET_C + "C");
}

function checkBoost() {
  if (pick("NIBE_HW_ACTIVE") !== "1") {
    setGlobal("NIBE_HW_ACTIVE", "0");
    return;
  }
  var loops = parseInt(pick("NIBE_HW_LOOPS"), 10);
  if (isNaN(loops)) loops = 0;
  loops = loops + 1;
  setGlobal("NIBE_HW_LOOPS", String(loops));

  var deadline = pick("NIBE_HW_DEADLINE");
  var deadlineMin = minutesOf(deadline);
  if (deadlineMin !== null && minutesNow() >= deadlineMin) {
    turnOff(accessToken(), "Stopped at " + deadline);
    return;
  }
  if (loops >= SAFETY_MINUTES) {
    turnOff(accessToken(), "3 hour limit");
    return;
  }
  if (!atFintry()) {
    turnOff(accessToken(), "left Fintry wifi");
    return;
  }

  var token = accessToken();
  var temp = readTemp(token);
  if (temp === null || isNaN(temp)) {
    note("Hot water temp unread");
    return;
  }
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

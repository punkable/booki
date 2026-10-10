import test from "node:test";
import assert from "node:assert/strict";
import { weatherKind, formatDegrees, formatHour, formatWeekday } from "../src/dock/weather-codes.js";

test("weather codes fold into the kinds the panel draws", () => {
  assert.equal(weatherKind(0).icon, "sun");
  assert.equal(weatherKind(0, 0).icon, "moon", "a clear night shows the moon");
  assert.equal(weatherKind(2).kind, "partly");
  assert.equal(weatherKind(48).kind, "fog");
  assert.equal(weatherKind(55).kind, "drizzle");
  assert.equal(weatherKind(81).kind, "rain");
  assert.equal(weatherKind(86).kind, "snow");
  assert.equal(weatherKind(99).icon, "cloud-lightning");
  assert.equal(weatherKind(undefined).kind, "cloudy", "unknown codes stay neutral");
  assert.equal(weatherKind(61).label, "weather.rain");
});

test("degrees are whole and converted only when asked", () => {
  assert.equal(formatDegrees(21.6, "celsius"), "22°");
  assert.equal(formatDegrees(20, "fahrenheit"), "68°");
  assert.equal(formatDegrees(null), "—");
});

test("forecast times keep the city's wall clock", () => {
  assert.equal(formatHour("2026-10-10T18:00", "en-GB"), "18");
  assert.equal(formatHour("2026-10-10T07:00", "en-US"), "7 AM");
  assert.equal(formatWeekday("2026-10-11", "en-US"), "Sun");
  assert.equal(formatHour("not a time", "en"), "");
});

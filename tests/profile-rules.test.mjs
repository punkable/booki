/* Automatic profiles: which profile the rules ask for at a given moment. */
import test from "node:test";
import assert from "node:assert/strict";
import { desiredProfile, inSchedule, parseClock } from "../src/profile-rules.js";

const available = ["Trabajo", "Casa", "Escritorio"];
const rules = { enabled: true, scheduleProfile: "Trabajo", scheduleFrom: "09:00", scheduleTo: "18:00", scheduleDays: [1, 2, 3, 4, 5], otherProfile: "Casa", monitorProfile: "Escritorio" };
// 2026-10-12 is a Monday.
const at = (day, hh, mm = 0) => new Date(2026, 9, 12 + day, hh, mm);

test("clock text parses to minutes and rejects nonsense", () => {
  assert.equal(parseClock("09:30"), 570);
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("nine"), null);
});

test("the schedule covers weekdays in working hours only", () => {
  assert.equal(desiredProfile(rules, { now: at(0, 10), available }), "Trabajo");
  assert.equal(desiredProfile(rules, { now: at(0, 18), available }), "Casa");
  assert.equal(desiredProfile(rules, { now: at(5, 10), available }), "Casa"); // Saturday
});

test("an external monitor wins over the schedule", () => {
  assert.equal(desiredProfile(rules, { now: at(0, 10), monitors: 2, available }), "Escritorio");
});

test("overnight ranges count for the day they started", () => {
  const night = { scheduleFrom: "22:00", scheduleTo: "06:00", scheduleDays: [5] }; // Friday night
  assert.equal(inSchedule(night, at(4, 23)), true);
  assert.equal(inSchedule(night, at(5, 2)), true);
  assert.equal(inSchedule(night, at(5, 23)), false);
});

test("off, or naming a deleted profile, asks for nothing", () => {
  assert.equal(desiredProfile({ ...rules, enabled: false }, { now: at(0, 10), available }), "");
  assert.equal(desiredProfile({ ...rules, otherProfile: "Gone" }, { now: at(0, 20), available }), "");
});

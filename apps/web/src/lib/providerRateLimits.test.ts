import { describe, expect, it } from "vite-plus/test";

import { resolveRateLimitDisplay } from "./providerRateLimits";

// Fixed clock: Thursday 2026-08-27 10:00 local time.
const NOW = new Date(2026, 7, 27, 10, 0, 0);

const sameDayReset = new Date(2026, 7, 27, 18, 0, 0).toISOString();
const nextWeekReset = new Date(2026, 8, 1, 9, 0, 0).toISOString();

describe("resolveRateLimitDisplay", () => {
  it("labels known windows and rounds utilization", () => {
    const { rows } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 42.4 },
        { kind: "weekly", utilization: 67 },
        { kind: "weekly", label: "Fable", utilization: 11.9 },
      ],
      NOW,
    );
    expect(rows).toEqual([
      { label: "5h", utilization: 42, level: "normal" },
      { label: "Weekly", utilization: 67, level: "normal" },
      { label: "Fable", utilization: 12, level: "normal" },
    ]);
  });

  it("skips unknown kinds without a label so new server kinds degrade gracefully", () => {
    const { rows } = resolveRateLimitDisplay(
      [
        { kind: "monthly", utilization: 10 },
        { kind: "monthly", label: "Extra", utilization: 20 },
      ],
      NOW,
    );
    expect(rows.map((row) => row.label)).toEqual(["Extra"]);
  });

  it("marks warning at 80 and danger at 95", () => {
    const { rows } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 79.4 },
        { kind: "weekly", utilization: 80 },
        { kind: "weekly", label: "Opus", utilization: 95 },
      ],
      NOW,
    );
    expect(rows.map((row) => row.level)).toEqual(["normal", "warning", "danger"]);
  });

  it("always shows the 5h reset and holds weekly resets until 90%", () => {
    const { resetLines } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 12, resetsAt: sameDayReset },
        { kind: "weekly", utilization: 89, resetsAt: nextWeekReset },
        { kind: "weekly", label: "Fable", utilization: 90, resetsAt: nextWeekReset },
      ],
      NOW,
    );
    expect(resetLines).toHaveLength(2);
    expect(resetLines[0]).toMatch(/^5h resets /);
    expect(resetLines[1]).toMatch(/^Fable resets /);
  });

  it("formats resets as time, weekday + time, or date + time by distance", () => {
    const nextDayReset = new Date(2026, 7, 28, 9, 0, 0);
    // A weekly window resetting a full week out would print today's weekday
    // and read as hours away, so far resets switch to a date.
    const fullWeekReset = new Date(2026, 8, 3, 9, 0, 0);
    const { resetLines } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 12, resetsAt: sameDayReset },
        { kind: "weekly", utilization: 99, resetsAt: nextDayReset.toISOString() },
        { kind: "weekly", label: "Fable", utilization: 99, resetsAt: fullWeekReset.toISOString() },
      ],
      NOW,
    );
    const formatTime = (date: Date) =>
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const weekday = nextDayReset.toLocaleDateString(undefined, { weekday: "short" });
    const farDate = fullWeekReset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(resetLines).toEqual([
      `5h resets ${formatTime(new Date(sameDayReset))}`,
      `Weekly resets ${weekday} ${formatTime(nextDayReset)}`,
      `Fable resets ${farDate} ${formatTime(fullWeekReset)}`,
    ]);
  });

  it("drops rows whose window already reset and reset lines without a usable timestamp", () => {
    const { rows, resetLines } = resolveRateLimitDisplay(
      [
        {
          kind: "fiveHour",
          utilization: 96,
          resetsAt: new Date(2026, 7, 27, 9, 0, 0).toISOString(),
        },
        { kind: "weekly", utilization: 99, resetsAt: "not-a-date" },
      ],
      NOW,
    );
    expect(rows.map((row) => row.label)).toEqual(["Weekly"]);
    expect(resetLines).toEqual([]);
  });
});

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
      "locale",
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
      "locale",
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
      "locale",
    );
    expect(rows.map((row) => row.level)).toEqual(["normal", "warning", "danger"]);
  });

  it("shows 5h and weekly reset lines but none for model-scoped windows", () => {
    const { resetLines } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 12, resetsAt: sameDayReset },
        { kind: "weekly", utilization: 40, resetsAt: nextWeekReset },
        { kind: "weekly", label: "Fable", utilization: 12, resetsAt: nextWeekReset },
      ],
      NOW,
      "locale",
    );
    expect(resetLines).toHaveLength(2);
    expect(resetLines[0]).toMatch(/^5h resets /);
    expect(resetLines[1]).toMatch(/^Weekly resets /);
  });

  it("formats resets as time, weekday + time, or date + time by distance", () => {
    const nextDayReset = new Date(2026, 7, 28, 9, 0, 0);
    // A weekly window resetting a full week out would print today's weekday
    // and read as hours away, so far resets switch to a date.
    const fullWeekReset = new Date(2026, 8, 3, 9, 0, 0);
    const formatTime = (date: Date) =>
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const near = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 12, resetsAt: sameDayReset },
        { kind: "weekly", utilization: 99, resetsAt: nextDayReset.toISOString() },
      ],
      NOW,
      "locale",
    );
    const weekday = nextDayReset.toLocaleDateString(undefined, { weekday: "short" });
    expect(near.resetLines).toEqual([
      `5h resets ${formatTime(new Date(sameDayReset))}`,
      `Weekly resets ${weekday} ${formatTime(nextDayReset)}`,
    ]);
    const far = resolveRateLimitDisplay(
      [{ kind: "weekly", utilization: 99, resetsAt: fullWeekReset.toISOString() }],
      NOW,
      "locale",
    );
    const farDate = fullWeekReset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(far.resetLines).toEqual([`Weekly resets ${farDate} ${formatTime(fullWeekReset)}`]);
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
      "locale",
    );
    expect(rows.map((row) => row.label)).toEqual(["Weekly"]);
    expect(resetLines).toEqual([]);
  });
});

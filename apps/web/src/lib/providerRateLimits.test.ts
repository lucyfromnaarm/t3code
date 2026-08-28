import { describe, expect, it } from "vite-plus/test";

import { resolveRateLimitDisplay } from "./providerRateLimits";

// Fixed clock: Thursday 2026-08-27 10:00 local time.
const NOW = new Date(2026, 7, 27, 10, 0, 0);

const sameDayReset = new Date(2026, 7, 27, 18, 0, 0).toISOString();

const formatTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

describe("resolveRateLimitDisplay", () => {
  it("labels known windows, rounds utilization, and levels at 80/95", () => {
    const { rows } = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 42.4 },
        { kind: "weekly", utilization: 80 },
        { kind: "weekly", label: "Fable", utilization: 95 },
      ],
      NOW,
      "locale",
    );
    expect(rows).toEqual([
      { label: "5h", utilization: 42, level: "normal" },
      { label: "Weekly", utilization: 80, level: "warning" },
      { label: "Fable", utilization: 95, level: "danger" },
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

  it("shows 5h and weekly reset lines, none for model-scoped windows", () => {
    const nextDayReset = new Date(2026, 7, 28, 9, 0, 0);
    // A reset a full week out would print today's weekday and read as hours
    // away, so far resets switch to a date.
    const fullWeekReset = new Date(2026, 8, 3, 9, 0, 0);
    const near = resolveRateLimitDisplay(
      [
        { kind: "fiveHour", utilization: 12, resetsAt: sameDayReset },
        { kind: "weekly", utilization: 40, resetsAt: nextDayReset.toISOString() },
        { kind: "weekly", label: "Fable", utilization: 90, resetsAt: nextDayReset.toISOString() },
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

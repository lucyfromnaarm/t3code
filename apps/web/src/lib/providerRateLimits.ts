import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";

/** Bar and percent turn amber at 80% and red at 95%. */
export const RATE_LIMIT_WARNING_UTILIZATION = 80;
export const RATE_LIMIT_DANGER_UTILIZATION = 95;

/** Weekly windows surface their reset time once they reach 90%. */
const WEEKLY_RESET_UTILIZATION = 90;

export interface RateLimitRow {
  readonly label: string;
  /** Rounded 0-100. */
  readonly utilization: number;
  readonly level: "normal" | "warning" | "danger";
}

/**
 * Presentation model for the picker tooltip's usage block: one meter row per
 * plan window, plus the reset lines worth showing (the 5h reset always, a
 * weekly reset only once that window is nearly exhausted). Windows the client
 * does not recognize are skipped so new server kinds degrade gracefully.
 */
export function resolveRateLimitDisplay(
  windows: ReadonlyArray<ServerProviderRateLimitWindow>,
  now: Date,
): { readonly rows: ReadonlyArray<RateLimitRow>; readonly resetLines: ReadonlyArray<string> } {
  const rows: RateLimitRow[] = [];
  const resetLines: string[] = [];
  const seenLabels = new Set<string>();
  for (const window of windows) {
    const label =
      window.label ??
      (window.kind === "fiveHour" ? "5h" : window.kind === "weekly" ? "Weekly" : undefined);
    // Labels key the rendered rows, so a duplicate keeps its first window only.
    if (label === undefined || seenLabels.has(label)) continue;
    // A window whose reset already passed has rolled over since the probe
    // (sleep, lost demand lease); its utilization is stale, so drop the row
    // rather than show a full meter for an empty window.
    if (window.resetsAt !== undefined) {
      const resetMs = Date.parse(window.resetsAt);
      if (!Number.isNaN(resetMs) && resetMs <= now.getTime()) continue;
    }
    seenLabels.add(label);
    const utilization = Math.round(Math.max(0, Math.min(100, window.utilization)));
    rows.push({
      label,
      utilization,
      level:
        utilization >= RATE_LIMIT_DANGER_UTILIZATION
          ? "danger"
          : utilization >= RATE_LIMIT_WARNING_UTILIZATION
            ? "warning"
            : "normal",
    });
    const showReset =
      window.kind === "fiveHour" ||
      (window.kind === "weekly" && utilization >= WEEKLY_RESET_UTILIZATION);
    if (showReset && window.resetsAt !== undefined) {
      const formatted = formatRateLimitReset(window.resetsAt, now);
      if (formatted !== undefined) {
        resetLines.push(`${label} resets ${formatted}`);
      }
    }
  }
  return { rows, resetLines };
}

/**
 * Reset timestamp as "6:00 PM" on the same calendar day, "Thu 6:00 PM"
 * within the next six days, and "Sep 3 6:00 PM" beyond that — a weekly
 * window resetting a full week out would otherwise print today's weekday
 * and read as hours away. Unparseable timestamps yield undefined; past
 * ones never reach here (their rows are dropped above).
 */
function formatRateLimitReset(resetsAt: string, now: Date): string | undefined {
  const reset = new Date(resetsAt);
  if (Number.isNaN(reset.getTime())) return undefined;
  const time = reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay =
    reset.getFullYear() === now.getFullYear() &&
    reset.getMonth() === now.getMonth() &&
    reset.getDate() === now.getDate();
  if (sameDay) return time;
  const withinSixDays = reset.getTime() - now.getTime() < 6 * 24 * 60 * 60 * 1000;
  const day = withinSixDays
    ? reset.toLocaleDateString(undefined, { weekday: "short" })
    : reset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} ${time}`;
}

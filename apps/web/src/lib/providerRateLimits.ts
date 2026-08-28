import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";

import { formatShortTimestamp, formatUpcomingDayLabel } from "~/timestampFormat";

/** Bar and percent turn amber at 80% and red at 95%. */
const RATE_LIMIT_WARNING_UTILIZATION = 80;
const RATE_LIMIT_DANGER_UTILIZATION = 95;

export interface RateLimitRow {
  readonly label: string;
  /** Rounded 0-100. */
  readonly utilization: number;
  readonly level: "normal" | "warning" | "danger";
}

/**
 * Presentation model for the picker tooltip's usage block: one meter row per
 * plan window, plus a reset line for the 5h and weekly windows when an
 * upcoming reset is known. Model-scoped windows (server-labeled) reset with
 * the weekly window, so they get no line of their own. Windows the client
 * does not recognize are skipped so new server kinds degrade gracefully.
 */
export function resolveRateLimitDisplay(
  windows: ReadonlyArray<ServerProviderRateLimitWindow>,
  now: Date,
  timestampFormat: TimestampFormat,
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
    if (window.label === undefined && window.resetsAt !== undefined) {
      const formatted = formatRateLimitReset(window.resetsAt, now, timestampFormat);
      if (formatted !== undefined) {
        resetLines.push(`${label} resets ${formatted}`);
      }
    }
  }
  return { rows, resetLines };
}

/**
 * Reset timestamp as a bare time on the same calendar day, weekday + time
 * within the next six days, and date + time beyond that — a weekly window
 * resetting a full week out would otherwise print today's weekday and read
 * as hours away. Times follow the user's timestamp format setting.
 * Unparseable timestamps yield undefined; past ones never reach here
 * (their rows are dropped above).
 */
function formatRateLimitReset(
  resetsAt: string,
  now: Date,
  timestampFormat: TimestampFormat,
): string | undefined {
  const reset = new Date(resetsAt);
  if (Number.isNaN(reset.getTime())) return undefined;
  const time = formatShortTimestamp(resetsAt, timestampFormat);
  const sameDay =
    reset.getFullYear() === now.getFullYear() &&
    reset.getMonth() === now.getMonth() &&
    reset.getDate() === now.getDate();
  if (sameDay) return time;
  const withinSixDays = reset.getTime() - now.getTime() < 6 * 24 * 60 * 60 * 1000;
  const day = formatUpcomingDayLabel(resetsAt, withinSixDays ? "weekday" : "date");
  return `${day} ${time}`;
}

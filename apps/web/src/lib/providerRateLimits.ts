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
 * Tooltip usage block: one meter row per plan window, plus reset lines for
 * the 5h and weekly windows. Server-labeled (model-scoped) windows reset
 * with the weekly window, so no line of their own. Unrecognized kinds are
 * skipped so new server kinds degrade gracefully.
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
    // A reset in the past means the window rolled over since the probe, so
    // its utilization is stale; drop the row.
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
 * Same day: bare time. Within six days: weekday + time. Further out: date +
 * time, so a reset a full week away cannot read as today. Times follow the
 * user's timestamp format setting; unparseable timestamps yield undefined.
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

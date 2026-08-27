import { assert, it } from "@effect/vitest";

import * as Effect from "effect/Effect";

import { mapClaudeUsageRateLimits, readClaudeRateLimits } from "./ClaudeProvider.ts";

const RESET_AT = "2026-08-27T18:00:00.000Z";

it("maps the named claude.ai usage windows in display order", () => {
  const windows = mapClaudeUsageRateLimits({
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: 42.5, resets_at: RESET_AT },
      seven_day: { utilization: 67, resets_at: RESET_AT },
      seven_day_opus: { utilization: 12, resets_at: null },
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "fiveHour", utilization: 42.5, resetsAt: RESET_AT },
    { kind: "weekly", utilization: 67, resetsAt: RESET_AT },
    { kind: "weekly", label: "Opus", utilization: 12 },
  ]);
});

it("returns undefined when the account has no plan limits", () => {
  assert.isUndefined(mapClaudeUsageRateLimits({ rate_limits_available: false, rate_limits: null }));
  assert.isUndefined(mapClaudeUsageRateLimits({ rate_limits_available: true, rate_limits: null }));
  assert.isUndefined(mapClaudeUsageRateLimits(undefined));
  assert.isUndefined(mapClaudeUsageRateLimits("nonsense"));
});

it("skips windows without a numeric utilization and clamps out-of-range values", () => {
  const windows = mapClaudeUsageRateLimits({
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: null, resets_at: RESET_AT },
      seven_day: { utilization: 140, resets_at: "not-a-date" },
    },
  });

  assert.deepStrictEqual(windows, [{ kind: "weekly", utilization: 100 }]);
});

it("maps model_scoped windows with validity-gated label dedupe", () => {
  const windows = mapClaudeUsageRateLimits({
    rate_limits_available: true,
    rate_limits: {
      // A valid named window wins its label; a null-utilization one does not
      // burn the label for the model_scoped entry carrying real data.
      seven_day_sonnet: { utilization: 20, resets_at: RESET_AT },
      seven_day_opus: { utilization: null, resets_at: RESET_AT },
      model_scoped: [
        { display_name: "Sonnet", utilization: 21, resets_at: RESET_AT },
        { display_name: "Opus", utilization: 44, resets_at: RESET_AT },
        { display_name: "Fable", utilization: 9, resets_at: RESET_AT },
        { display_name: "  ", utilization: 5, resets_at: RESET_AT },
      ],
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "weekly", label: "Sonnet", utilization: 20, resetsAt: RESET_AT },
    { kind: "weekly", label: "Opus", utilization: 44, resetsAt: RESET_AT },
    { kind: "weekly", label: "Fable", utilization: 9, resetsAt: RESET_AT },
  ]);
});

it("ignores the seven_day_oauth_apps window", () => {
  assert.isUndefined(
    mapClaudeUsageRateLimits({
      rate_limits_available: true,
      rate_limits: {
        seven_day_oauth_apps: { utilization: 55, resets_at: RESET_AT },
      },
    }),
  );
});

it.effect("degrades to undefined when the usage method is absent", () =>
  Effect.gen(function* () {
    assert.isUndefined(yield* readClaudeRateLimits({}));
  }),
);

it.effect("degrades to undefined when the usage method rejects", () =>
  Effect.gen(function* () {
    const windows = yield* readClaudeRateLimits({
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () =>
        Promise.reject(new Error("control request not supported")),
    });
    assert.isUndefined(windows);
  }),
);

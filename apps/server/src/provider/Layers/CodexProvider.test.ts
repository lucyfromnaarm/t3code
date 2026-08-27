import { assert, it } from "@effect/vitest";

import {
  applyPreferredCodexDefaultModel,
  mapCodexModelCapabilities,
  mapCodexRateLimitWindows,
} from "./CodexProvider.ts";

it("maps current Codex model capability fields", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: [],
    defaultReasoningEffort: "super-high",
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    defaultServiceTier: "flex",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "Lower latency responses.",
      },
      {
        id: "flex",
        name: "Flex",
        description: "Lower-cost asynchronous routing.",
      },
    ],
    supportedReasoningEfforts: [
      {
        description: "Maximum reasoning",
        reasoningEffort: "super-high",
      },
    ],
  });

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [{ id: "super-high", label: "super-high", isDefault: true }],
      currentValue: "super-high",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard" },
        {
          id: "priority",
          label: "Fast",
          description: "Lower latency responses.",
        },
        {
          id: "flex",
          label: "Flex",
          description: "Lower-cost asynchronous routing.",
          isDefault: true,
        },
      ],
      currentValue: "flex",
    },
  ]);
});

it("uses standard routing when the catalog has no default service tier", () => {
  const capabilities = mapCodexModelCapabilities({
    additionalSpeedTiers: ["fast"],
    defaultReasoningEffort: "medium",
    defaultServiceTier: null,
    description: "Test model",
    displayName: "GPT Test",
    hidden: false,
    id: "gpt-test",
    isDefault: true,
    model: "gpt-test",
    serviceTiers: [
      {
        id: "priority",
        name: "Fast",
        description: "1.5x speed, increased usage",
      },
    ],
    supportedReasoningEfforts: [],
  });

  assert.deepStrictEqual(capabilities.optionDescriptors, [
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        {
          id: "priority",
          label: "Fast",
          description: "1.5x speed, increased usage",
        },
      ],
      currentValue: "default",
    },
  ]);
});

it("marks the most preferred available model as default", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-terra", name: "GPT-5.6-Terra", isCustom: false, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(
    models.map((model) => ({ slug: model.slug, isDefault: model.isDefault })),
    [
      { slug: "gpt-5.6-terra", isDefault: true },
      { slug: "gpt-5.4", isDefault: undefined },
    ],
  );
});

it("prefers sol over terra when both are available", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-terra", name: "GPT-5.6-Terra", isCustom: false, capabilities: null },
    { slug: "gpt-5.6-sol", name: "GPT-5.6-Sol", isCustom: false, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.6-sol");
});

it("keeps Codex's own default when no preferred model is available", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.5", name: "GPT-5.5", isCustom: false, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.4");
});

it("ignores custom models that shadow a preferred slug", () => {
  const models = applyPreferredCodexDefaultModel([
    { slug: "gpt-5.6-sol", name: "gpt-5.6-sol", isCustom: true, capabilities: null },
    { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, isDefault: true, capabilities: null },
  ]);

  assert.deepStrictEqual(models.find((model) => model.isDefault)?.slug, "gpt-5.4");
});

it("maps Codex primary/secondary rate-limit windows to 5h and weekly", () => {
  const resetSeconds = Math.floor(Date.parse("2026-08-27T18:00:00.000Z") / 1000);
  const windows = mapCodexRateLimitWindows({
    rateLimits: {
      primary: { usedPercent: 18, resetsAt: resetSeconds, windowDurationMins: 300 },
      secondary: { usedPercent: 55, resetsAt: resetSeconds, windowDurationMins: 10_080 },
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "fiveHour", utilization: 18, resetsAt: "2026-08-27T18:00:00.000Z" },
    { kind: "weekly", utilization: 55, resetsAt: "2026-08-27T18:00:00.000Z" },
  ]);
});

it("classifies rate-limit windows by duration over position and accepts millisecond resets", () => {
  const resetMs = Date.parse("2026-08-27T18:00:00.000Z");
  const windows = mapCodexRateLimitWindows({
    rateLimits: {
      primary: { usedPercent: 40, resetsAt: resetMs, windowDurationMins: 10_080 },
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "weekly", utilization: 40, resetsAt: "2026-08-27T18:00:00.000Z" },
  ]);
});

it("falls back to positional kinds when window durations are absent and clamps percentages", () => {
  const windows = mapCodexRateLimitWindows({
    rateLimits: {
      primary: { usedPercent: 130, resetsAt: null },
      secondary: { usedPercent: -2 },
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "fiveHour", utilization: 100 },
    { kind: "weekly", utilization: 0 },
  ]);
});

it("returns undefined when the rate-limit read yields nothing renderable", () => {
  assert.isUndefined(mapCodexRateLimitWindows(undefined));
  assert.isUndefined(mapCodexRateLimitWindows({ rateLimits: {} }));
});

it("gives windows longer than eight days an open kind current clients skip", () => {
  const windows = mapCodexRateLimitWindows({
    rateLimits: {
      primary: { usedPercent: 12, windowDurationMins: 300 },
      secondary: { usedPercent: 60, windowDurationMins: 30 * 24 * 60 },
    },
  });

  assert.deepStrictEqual(windows, [
    { kind: "fiveHour", utilization: 12 },
    { kind: "monthly", utilization: 60 },
  ]);
});

it("drops reset timestamps beyond the representable Date range instead of throwing", () => {
  const windows = mapCodexRateLimitWindows({
    rateLimits: {
      primary: { usedPercent: 20, resetsAt: 8_640_000_000_000_001 },
    },
  });

  assert.deepStrictEqual(windows, [{ kind: "fiveHour", utilization: 20 }]);
});

import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId, type ServerConfig } from "@t3tools/contracts";

import { buildModelOptions } from "./modelOptions";

describe("mobile model options", () => {
  it("normalizes a legacy fallback selection against current capabilities", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-test",
              name: "GPT Test",
              isCustom: false,
              capabilities: {
                optionDescriptors: [
                  {
                    id: "serviceTier",
                    label: "Service Tier",
                    type: "select",
                    options: [
                      { id: "default", label: "Standard", isDefault: true },
                      { id: "priority", label: "Fast" },
                    ],
                    currentValue: "default",
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    const [option] = buildModelOptions(config, {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-test",
      options: [{ id: "fastMode", value: true }],
    });

    expect(option?.capabilities?.optionDescriptors?.[0]?.id).toBe("serviceTier");
    expect(option?.selection.options).toEqual([{ id: "serviceTier", value: "default" }]);
  });

  it("labels kimi driver providers as Kimi when no display name is set", () => {
    const config = {
      providers: [
        {
          instanceId: "kimi",
          driver: "kimi",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [{ slug: "kimi-code/k3", name: "K3", isCustom: false }],
        },
      ],
    } as unknown as ServerConfig;

    const [option] = buildModelOptions(config, null);

    expect(option?.providerLabel).toBe("Kimi");
  });
});

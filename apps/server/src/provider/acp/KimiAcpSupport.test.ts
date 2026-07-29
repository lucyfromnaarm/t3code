// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeFSP from "node:fs/promises";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";

import {
  applyKimiAcpModelSelection,
  buildKimiAcpSpawnInput,
  currentKimiModelIdFromSessionSetup,
  makeKimiAcpRuntime,
  resolveKimiAcpBaseModelId,
} from "./KimiAcpSupport.ts";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/acp-mock-agent.ts");
const mockAgentCommand = process.execPath;

async function makeMockKimiWrapper(extraEnv?: Record<string, string>) {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "kimi-acp-runtime-"));
  const wrapperPath = NodePath.join(dir, "fake-kimi.sh");
  const envExports = Object.entries(extraEnv ?? {})
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join("\n");
  const script = `#!/bin/sh
${envExports}
exec ${JSON.stringify(mockAgentCommand)} ${JSON.stringify(mockAgentPath)} "$@"
`;
  await NodeFSP.writeFile(wrapperPath, script, "utf8");
  await NodeFSP.chmod(wrapperPath, 0o755);
  return wrapperPath;
}

describe("resolveKimiAcpBaseModelId", () => {
  it("normalizes empty and custom Kimi model ids", () => {
    expect(resolveKimiAcpBaseModelId(undefined)).toBe("kimi-code/k3");
    expect(resolveKimiAcpBaseModelId("   ")).toBe("kimi-code/k3");
    expect(resolveKimiAcpBaseModelId("  kimi-code/kimi-for-coding  ")).toBe(
      "kimi-code/kimi-for-coding",
    );
  });

  it("expands short aliases to canonical slugs", () => {
    expect(resolveKimiAcpBaseModelId("k3")).toBe("kimi-code/k3");
    expect(resolveKimiAcpBaseModelId("kimi-for-coding")).toBe("kimi-code/kimi-for-coding");
  });
});

describe("buildKimiAcpSpawnInput", () => {
  it("spawns `kimi acp` with the configured binary path", () => {
    const spawn = buildKimiAcpSpawnInput({ binaryPath: "/usr/local/bin/kimi" }, "/tmp/project", {
      KIMI_API_KEY: "secret",
    });

    expect(spawn).toEqual({
      command: "/usr/local/bin/kimi",
      args: ["acp"],
      cwd: "/tmp/project",
      env: {
        KIMI_API_KEY: "secret",
      },
    });
  });

  it("falls back to `kimi` on PATH when no binary path is configured", () => {
    const spawn = buildKimiAcpSpawnInput(undefined, "/tmp/project");

    expect(spawn).toEqual({
      command: "kimi",
      args: ["acp"],
      cwd: "/tmp/project",
    });
  });
});

describe("applyKimiAcpModelSelection", () => {
  const makeRecordingRuntime = (failure?: EffectAcpErrors.AcpError) => {
    const modelCalls: Array<string> = [];
    const runtime = {
      setSessionModel: (modelId: string) =>
        Effect.gen(function* () {
          modelCalls.push(modelId);
          if (failure) return yield* failure;
          return {};
        }),
    };
    return { runtime, modelCalls };
  };

  it.effect("calls session/set_model when the requested model differs from current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyKimiAcpModelSelection({
        runtime,
        currentModelId: "kimi-code/k3",
        requestedModelId: "kimi-code/kimi-for-coding",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual(["kimi-code/kimi-for-coding"]);
      expect(result).toBe("kimi-code/kimi-for-coding");
    }),
  );

  it.effect("skips set_model when requested matches current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyKimiAcpModelSelection({
        runtime,
        currentModelId: "kimi-code/k3",
        requestedModelId: "kimi-code/k3",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("kimi-code/k3");
    }),
  );

  it.effect("skips set_model when no model is requested", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyKimiAcpModelSelection({
        runtime,
        currentModelId: "kimi-code/k3",
        requestedModelId: undefined,
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("kimi-code/k3");
    }),
  );

  it.effect("propagates session/set_model failures via mapError", () =>
    Effect.gen(function* () {
      const failure = EffectAcpErrors.AcpRequestError.invalidParams("session id not known");
      const { runtime } = makeRecordingRuntime(failure);
      const error = yield* Effect.flip(
        applyKimiAcpModelSelection({
          runtime,
          currentModelId: "kimi-code/k3",
          requestedModelId: "kimi-code/kimi-for-coding",
          mapError: (cause) => cause.message,
        }),
      );
      expect(error).toBe(failure.message);
    }),
  );
});

describe("currentKimiModelIdFromSessionSetup", () => {
  it("reads the current model from the configOptions select when models is absent", () => {
    expect(
      currentKimiModelIdFromSessionSetup({
        sessionId: "session-1",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "kimi-code/k3",
            options: [
              { value: "kimi-code/k3", name: "K3" },
              { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
            ],
          },
        ],
      }),
    ).toBe("kimi-code/k3");
  });

  it("prefers models.currentModelId when the models field is present", () => {
    expect(
      currentKimiModelIdFromSessionSetup({
        sessionId: "session-1",
        models: {
          currentModelId: "grok-build",
          availableModels: [{ modelId: "grok-build", name: "Grok Build" }],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "kimi-code/k3",
            options: [{ value: "kimi-code/k3", name: "K3" }],
          },
        ],
      }),
    ).toBe("grok-build");
  });

  it("returns undefined when neither models nor a model select is present", () => {
    expect(currentKimiModelIdFromSessionSetup({ sessionId: "session-1" })).toBeUndefined();
  });
});

it.layer(NodeServices.layer)("KimiAcpRuntimeLive", (it) => {
  const runStartAndClose = (extraEnv: Record<string, string>) =>
    Effect.gen(function* () {
      const wrapperPath = yield* Effect.promise(() => makeMockKimiWrapper(extraEnv));
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fiber = yield* Effect.forkDetach(
        Effect.gen(function* () {
          const acp = yield* makeKimiAcpRuntime({
            kimiSettings: { binaryPath: wrapperPath },
            childProcessSpawner,
            cwd: process.cwd(),
            clientInfo: { name: "kimi-acp-runtime-test", version: "0.0.0" },
          });
          const started = yield* acp.start();
          const configOptions = yield* acp.getConfigOptions;
          return { started, configOptions };
        }).pipe(Effect.scoped),
      );
      // The scope close runs uninterruptibly, so a hanging teardown cannot be
      // interrupted. Race the fiber instead of timing out the scoped effect.
      const outcome = yield* Effect.raceFirst(
        Fiber.await(fiber),
        Effect.sleep("10 seconds").pipe(Effect.as("timeout" as const)),
      );
      if (outcome === "timeout") {
        yield* Effect.forkDetach(Fiber.interrupt(fiber).pipe(Effect.ignore));
        assert.fail("Kimi ACP runtime start + teardown did not complete within 10 seconds");
      }
      return outcome;
    });

  it.effect("starts and tears down a kimi-shaped agent that ignores SIGTERM", () =>
    Effect.gen(function* () {
      const exit = yield* runStartAndClose({
        T3_ACP_KIMI_HANDSHAKE: "1",
        T3_ACP_IGNORE_SIGTERM: "1",
        T3_ACP_EXIT_ON_STDIN_CLOSE: "1",
      });
      assert.isTrue(Exit.isSuccess(exit));
      if (Exit.isSuccess(exit)) {
        assert.equal(exit.value.started.sessionId, "mock-session-1");
        // The kimi handshake only returns configOptions; the runtime still
        // surfaces the model select.
        assert.equal(exit.value.started.modelConfigId, "model");
        const modelOption = exit.value.configOptions.find((option) => option.id === "model");
        assert.isDefined(modelOption);
        if (modelOption?.type === "select") {
          assert.equal(modelOption.currentValue, "kimi-code/k3");
        }
      }
    }).pipe(TestClock.withLive),
  );

  it.effect("force-kills a kimi-shaped agent that stays up after SIGTERM and stdin close", () =>
    Effect.gen(function* () {
      const exit = yield* runStartAndClose({
        T3_ACP_KIMI_HANDSHAKE: "1",
        T3_ACP_IGNORE_SIGTERM: "1",
      });
      assert.isTrue(Exit.isSuccess(exit));
    }).pipe(TestClock.withLive),
  );
});

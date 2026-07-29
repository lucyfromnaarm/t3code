// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { KimiSettings } from "@t3tools/contracts";

import {
  buildInitialKimiProviderSnapshot,
  buildKimiDiscoveredModelsFromConfigOptions,
  checkKimiProviderStatus,
} from "./KimiProvider.ts";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/acp-mock-agent.ts");

const decodeKimiSettings = Schema.decodeSync(KimiSettings);

describe("buildInitialKimiProviderSnapshot", () => {
  it.effect("returns a disabled snapshot when settings.enabled is false", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(
        decodeKimiSettings({ enabled: false }),
      );
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it.effect("returns a pending snapshot by default", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(decodeKimiSettings({}));
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.version).toBeNull();
      expect(snapshot.message).toContain("Checking Kimi");
      expect(snapshot.requiresNewThreadForModelChange).toBe(true);
    }),
  );

  it.effect("advertises the built-in Kimi models with k3 as default", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(decodeKimiSettings({}));
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "kimi-code/k3",
        "kimi-code/k3-256k",
        "kimi-code/kimi-for-coding",
        "kimi-code/kimi-for-coding-highspeed",
      ]);
      expect(snapshot.models.find((model) => model.isDefault)?.slug).toBe("kimi-code/k3");
    }),
  );
});

it.layer(NodeServices.layer)("checkKimiProviderStatus", (it) => {
  it.effect("reports the binary as missing when the binary path does not resolve", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkKimiProviderStatus(
        decodeKimiSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/kimi-binary",
        }),
      );
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toMatch(/not installed|not on PATH|Failed to execute/);
    }),
  );

  it.effect("reports an installed CLI as unhealthy when --version exits non-zero", () =>
    Effect.gen(function* () {
      const secretStderr = "broken kimi install: secret-token-value";
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-kimi-version-" });
          const kimiPath = path.join(dir, "kimi");
          yield* fs.writeFileString(
            kimiPath,
            ["#!/bin/sh", `printf "%s\\n" "${secretStderr}" >&2`, "exit 2", ""].join("\n"),
          );
          yield* fs.chmod(kimiPath, 0o755);

          return yield* checkKimiProviderStatus(
            decodeKimiSettings({ enabled: true, binaryPath: kimiPath }),
          );
        }),
      );

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toBe("Kimi Code CLI is installed but failed to run.");
      expect(snapshot.message).not.toContain(secretStderr);
    }),
  );

  it.effect("reports an error when ACP model discovery is unavailable", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-kimi-success-" });
          const kimiPath = path.join(dir, "kimi");
          yield* fs.writeFileString(
            kimiPath,
            ["#!/bin/sh", 'printf "kimi-code 0.0.99\\n"', "exit 0", ""].join("\n"),
          );
          yield* fs.chmod(kimiPath, 0o755);

          return yield* checkKimiProviderStatus(
            decodeKimiSettings({ enabled: true, binaryPath: kimiPath }),
          );
        }),
      );

      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "kimi-code/k3",
        "kimi-code/k3-256k",
        "kimi-code/kimi-for-coding",
        "kimi-code/kimi-for-coding-highspeed",
      ]);
      expect(snapshot.message).toContain("ACP startup failed");
    }),
  );

  it.effect("discovers models from the ACP configOptions select", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-kimi-discovery-" });
          const kimiPath = path.join(dir, "kimi");
          yield* fs.writeFileString(
            kimiPath,
            [
              "#!/bin/sh",
              'if [ "${1:-}" = "--version" ]; then',
              '  printf "kimi-code 0.30.0\\n"',
              "  exit 0",
              "fi",
              "export T3_ACP_KIMI_HANDSHAKE=1",
              // @effect-diagnostics-next-line preferSchemaOverJson:off - Shell-quoting a path in a generated wrapper script, not JSON data.
              `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(mockAgentPath)} "$@"`,
              "",
            ].join("\n"),
          );
          yield* fs.chmod(kimiPath, 0o755);

          return yield* checkKimiProviderStatus(
            decodeKimiSettings({ enabled: true, binaryPath: kimiPath }),
          );
        }),
      );

      expect(snapshot.status).toBe("ready");
      expect(snapshot.version).toBe("0.30.0");
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "kimi-code/k3",
        "kimi-code/k3-256k",
        "kimi-code/kimi-for-coding",
        "kimi-code/kimi-for-coding-highspeed",
      ]);
      expect(snapshot.models.find((model) => model.isDefault)?.slug).toBe("kimi-code/k3");
    }),
  );
});

describe("buildKimiDiscoveredModelsFromConfigOptions", () => {
  it("builds models from the model configOptions select", () => {
    const models = buildKimiDiscoveredModelsFromConfigOptions([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "kimi-code/k3",
        options: [
          { value: "kimi-code/k3", name: "K3" },
          { value: "kimi-code/k3-256k", name: "K3 (256k)" },
          { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
        ],
      },
    ]);

    expect(models.map((model) => model.slug)).toEqual([
      "kimi-code/k3",
      "kimi-code/k3-256k",
      "kimi-code/kimi-for-coding",
    ]);
    expect(models.find((model) => model.isDefault)?.slug).toBe("kimi-code/k3");
    expect(models[1]?.name).toBe("K3 (256k)");
  });

  it("reads grouped select options and dedupes aliased slugs", () => {
    const models = buildKimiDiscoveredModelsFromConfigOptions([
      {
        id: "model",
        name: "Model",
        type: "select",
        currentValue: "k3",
        options: [
          {
            group: "kimi",
            name: "Kimi",
            options: [
              { value: "k3", name: "K3" },
              { value: "kimi-code/k3", name: "K3 duplicate" },
            ],
          },
        ],
      },
    ]);

    expect(models.map((model) => model.slug)).toEqual(["kimi-code/k3"]);
  });

  it("returns no models when the model select is absent or not a select", () => {
    expect(buildKimiDiscoveredModelsFromConfigOptions([])).toEqual([]);
    expect(
      buildKimiDiscoveredModelsFromConfigOptions([
        { id: "model", name: "Model", type: "boolean", currentValue: true },
      ]),
    ).toEqual([]);
  });
});

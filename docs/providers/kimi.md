# Kimi Code

This guide is for people who want to use the Kimi Code CLI (`kimi`) in T3 Code.

T3 Code talks to Kimi Code over ACP (`kimi acp`), the same protocol family used by the Grok and Cursor providers.

## Set Up

Install the Kimi Code CLI and log in:

```bash
kimi login
```

Login uses a device-code flow against your Kimi account. Auth state lives under `~/.kimi-code/`. On older CLI versions without the `login` subcommand, start `kimi` and run `/login` in its interactive UI instead.

In T3 Code Settings, your Kimi provider can stay like this:

```text
Display name: Kimi
Binary path: kimi
```

An empty `Binary path` means T3 Code resolves `kimi` from your `PATH`.

## Models

T3 Code discovers the available models from the CLI at probe time. The built-in fallbacks are:

- `kimi-code/k3` (default)
- `kimi-code/k3-256k`
- `kimi-code/kimi-for-coding`
- `kimi-code/kimi-for-coding-highspeed`

You can also add custom model slugs in Settings; they are passed through to the CLI verbatim.

## Multiple Instances

The Kimi driver supports multiple instances, so you can point different instances at different binaries (for example a stable and a nightly build) from Settings. All instances share the CLI's `~/.kimi-code` auth — there is no per-instance home override yet.

# Review usage

The Usage page combines Codex, Claude Code, and Grok Build activity from your connected
environments. It reads the providers' local session history and shows API-equivalent token cost,
processed tokens, cache savings, provider shares, and model breakdowns. Subscription billing is
separate from the raw token cost shown here.

Grok Build totals come from persisted session updates. Interactive turns that never wrote a
completed-turn record will not appear.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.

## Plan limits in the model picker

On web and desktop, hover an account in the model picker rail to see its plan windows under the
account name: the 5-hour and weekly windows for Claude subscriptions (plus per-model weekly
windows when Anthropic reports them) and the 5-hour and weekly windows for ChatGPT-backed Codex
accounts. The 5-hour and weekly reset times are shown whenever an upcoming reset is known;
per-model windows reset with the weekly window. Accounts without plan limits, such as API keys or
claude-compatible gateways, show the account name only.

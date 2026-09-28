# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal **US-equities trading journal**, not a software product. The repo is three things:

1. **A durable record** — dated markdown under `journal/` and per-name notes under `stocks/`, plus chart data JSON under `journal/charts/data/`. These files are the _only_ persistence layer (no database).
2. **A toolchain** — custom Claude Code skills under `.claude/skills/` that pull market data and orchestrate analysis workflows. "Running" this repo means invoking a skill or one of its Python scripts, then writing the synthesis back into a journal/stock file.
3. **A chart web app** — a pnpm workspace rooted at the repo root: shared libraries live under `packages/` and hosts under `apps/`. The kernel lives in `packages/core` (`@kansoku/core`); `apps/server` is a thin HTTP host (Tsuki (Hono + NestJS-style modules/DI) controllers + WS) that wraps the kernel, hosted as a single process by `main.node.ts` in production; `apps/desktop` is an Electron shell that embeds the same kernel and reaches it over typed IPC (`electron-ipc-decorator`) instead of HTTP; `apps/web` is Vite + React and picks HTTP or IPC transport by environment — `pnpm dev` runs web+server (Vite dev server proxies to the server process, neither needs a separate build step), `pnpm dev:desktop` runs web+desktop with no server process at all; charts render locally at `http://localhost:1792`. Cross-package types sit in `packages/shared`. **Open-core split (2026-07-17)**: `apps/pro/` — a gitignored slot directory holding the private repo `Innei/kansoku-pro` (`@kansoku/pro`), loaded at boot via `packages/core/src/pro/loader.ts` — now provides only the paid surface (per-stock auto-tracking, deep research, research-library AI) plus license, while the free AI (bring-your-own-key review, chat, AI settings, macro filtering, research-library browsing) has moved into open core and runs without `apps/pro`; `packages/pro-api` stays the public types-only contract. Without `apps/pro` the build is the complete free version (charts/realtime/journal + free AI all work, only the paid routes 404 and their UI hidden); `GET /api/capabilities` reports `{ pro, licensed }` unchanged. Paid-AI work therefore usually means editing `apps/pro` (its own git repo — commit there separately); free-AI work lives in `packages/core`. The server/kernel calls the longbridge CLI itself and computes every indicator in TS; charts are created via `POST /api/charts` (see `.claude/skills/chart/SKILL.md`). Realtime layer: a single WS connection (`/api/ws`) pushes live quotes (watchlist ∪ positions, pre/post/overnight aware) and 60s chart rebuilds while a page is open — persisted chart JSON stays frozen at analysis time. **Default way to launch the app is Electron: `pnpm dev:desktop` (or `pnpm dev:desktop:unlocked` for licensed-Pro behavior) — do not start the server process (`pnpm dev` / `apps/server`) unless the task specifically needs the HTTP host.** Before launching, make sure the pro overlays are projected (`pnpm overlay:sync`; a missing projection silently boots the free composition). `pnpm start` is the production form and requires `pnpm --filter @kansoku/web build` first. Tests with `pnpm test`.

## OSS → Pro sync (hard rule)

This repo is public. `apps/pro` is a **separate private git repo** (linked worktree). Changing exported types or AI/settings APIs here is unfinished until Pro is checked in the **same session**. Do not push this repo alone if Pro still compiles against the old shape.

Especially after edits under `packages/core` (conversation/agent/models/roles) or `packages/pro-api`:

1. Search the same symbols in `apps/pro`.
2. Update Pro call sites and fixtures (removed fields, new required keys such as `titleModel`).
3. Run `pnpm --filter @kansoku/pro typecheck` (and `pnpm --filter @kansoku/server typecheck` if server imports Pro).
4. Commit Pro separately, then push **both** remotes. Desktop release typechecks Pro at `KANSOKU_PRO_REF`.

Burned once: dropping `timeoutMs` from `ConversationPreparedTurn` without updating `apps/pro/src/ai/researchChat.ts`.

**Default language is English.** Write every new document in this repo in plain English — journal entries, stock notes, specs, READMEs, and this file. Existing Chinese documents stay as they are; when appending to one, match its language so a single file does not switch mid-way.

**Chat replies are in plain English too.** Every reply to the user — explanations, status updates, end-of-turn summaries — is in English. For Claude Code sessions this **overrides** TD-LANG-01 in the imported `trading-discipline` skill below (TD-LANG-01 still governs the app's own AI output, which follows the interface language).

**Avoid jargon** — details and good/bad examples are in the discipline file imported below (TD-LANG-02).

**For anything about positions, do not ask the user — query Longbridge directly** (TD-BROKER-01).

**Market scope follows configuration, default US** (TD-LANG-03; personal config lives in `journal/personal.md`).

## Architecture — three layers

### Layer 1 — data sources (raw retrieval)

| Source                                                               | Access                    | Covers                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Longbridge** plugin (`longbridge ...` CLI / `longbridge-*` skills) | brokerage account         | real-time quotes, K-line/OHLCV, fundamentals, capital flow, technicals, market temperature, news                                                                  |
| **`fred`** skill                                                     | free API key              | US/global macro time series (CPI, GDP, Fed funds, yields, M2, DXY)                                                                                                |
| **`sec-edgar`** skill                                                | UA header                 | raw 10-K/10-Q/8-K/S-1 text, Form 4 insider parsing                                                                                                                |
| **`gdelt`** skill                                                    | none (5s throttle)        | global multilingual news tone stream                                                                                                                              |
| **`trump-truth-monitor`** skill                                      | RSS mirror                | Trump Truth Social feed, classified + tier-graded for market impact                                                                                               |
| **`options-levels`** skill                                           | none (CBOE delayed)       | per-strike option open interest (magnet levels / stop-loss clusters) + put/call ratios; per-contract quotes on Longbridge are NOT authorized for this account                      |
| **`hithink-a-share`** skill                                          | `HITHINK_FINANCE_API_KEY` | China A-share data (official Tonghuashun API): limit-up pool with reasons, consecutive-limit-up ladder, Dragon-Tiger list, unusual moves, hot list, official three financial statements and metrics, A-share trading calendar; daily bars only, no minute bars — A-share charts and realtime still use Longbridge |

Longbridge covers price/fundamentals; the five custom skills cover Longbridge's blind spots (macro, raw filings, world news, policy speech, per-strike options positioning). Earnings dates and macro release schedules come from `longbridge finance-calendar report/macrodata` — never hand-hunt them from news. See `docs/superpowers/specs/2026-05-28-market-intel-skills-design.md` for the design rationale and full per-script interface.

### Layer 2 — orchestration workflows (the value-add)

These skills do not fetch new kinds of data; they sequence Layer-1 calls into a disciplined read and enforce anti-patterns:

- **`stock-deep-dive`** — one-pass six-lens onboarding for a name you don't know (business / fundamentals / technicals / catalysts / supply-chain-peers / audit). Dispatch lenses 1–5 in **one parallel tool block** (8–12 `longbridge` calls); lens 6 audits the result.
- **`capital-rotation`** — one-shot end-of-session scan of net flows across fixed cohorts (indices / semis / software-cloud / mega-tech), names ONE rotation narrative, writes `journal/YYYY-MM-DD-flow.md`.
- **`market-session-tracker`** — live intraday monitoring of a watchlist across pre-market → close, with breakout verification, distribution detection, tier classification, and timestamped thesis revision.
- **`trade-gate`** — trade decision gate for every buy/sell/add/trim: a six-layer scored buy funnel (hard gates + soft score, verdict bands ≥6/4–5/<4), a sell-trigger matrix reusing the user's existing rules (6/27 hold-plan lines A–D, the 11-item cycle-top checklist, the flush-not-clean reversal guard), and a patrol mode that runs the sell triggers across all live positions; every decision is logged to `journal/decisions/*.json`, reconciled against actual fills on the next run, and tallied into a violation ledger on request.

**Routing (these three overlap — pick deliberately):**

- Single name, first look, multiple dimensions → `stock-deep-dive`.
- Cross-section "where is money moving today" → `capital-rotation`.
- Live "watch this watchlist as it trades" → `market-session-tracker`.
- Buy / sell / add / trim decisions, or a sell-trigger patrol across positions → `trade-gate`.
- Only ONE lens wanted (just a quote, just news) → skip the workflow skills, call the `longbridge-*` sub-skill directly.

### Layer 3 — durable record (always the last step)

Every workflow ends by writing markdown. Do not skip this.

- `journal/YYYY-MM-DD-flow.md` — capital-rotation snapshots (scaffold: `capital-rotation/templates/rotation-snapshot.md`).
- `journal/YYYY-MM-DD-<theme>.md` — session-tracker reports (scaffold: `market-session-tracker/templates/session-report.md`).
- `journal/trump-feed/YYYY-MM-DD.md` — Trump post archive, appended idempotently by `archive.py`.
- `stocks/{SYMBOL}.md` — per-name six-lens notes; update incrementally, never rewrite the whole file (TD-NOTES-01).
- `stocks/_chain-ai-stack.md` — cross-stock map tying the tracked names along the AI-capex value chain.
- `journal/lessons.md` — post-mortem lessons list, one dated line per lesson; short-term prediction (`intraday-signal`) must read it before every run, and every actionable lesson from a post-mortem must be recorded here.

## Running the data scripts

Custom skills are stdlib-only Python 3 (`/usr/bin/python3`), invoked from repo root:

```bash
python3 .claude/skills/ --help < source > /scripts/ < cmd > .py  # self-documenting flags
python3 .claude/skills/ --smoke < source > /scripts/ < cmd > .py # connectivity self-test (use this as the "test")
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --quiet
```

Shared conventions (enforced by `.claude/skills/_shared/`):

- **Output contract**: success → `{"ok": true, "data": ..., "meta": ...}` on stdout, exit 0; failure → `{"ok": false, "error": ..., "hint": ...}`, non-zero exit, diagnostics on stderr.
- **Flags**: every script supports `--help`, `--smoke`, `--verbose`; data scripts add `--fresh` (bypass cache), `--json`.
- **Credentials**: `env.py` auto-loads `.env` at repo root on import (`FRED_API_KEY`, `SEC_USER_AGENT="Name <email>"`). No manual `source` step. `.env` is git-ignored — never commit it.
- **Caching/throttle**: `client.py` caches under `~/.cache/market-intel/` and self-throttles per source (SEC 10 req/s, FRED 120 req/min, **GDELT ≥ 5 s between requests** — faster returns a plaintext rate-limit notice, not JSON).
- The `trump-truth-monitor` archive can run on a 15-min `launchd` schedule — see `.claude/skills/trump-truth-monitor/launchd/README.md`.

## Cross-cutting invariants (the reason the skills exist)

**The invariants live in one skill (`trading-discipline`) with scope-specific chapters under `references/`. Do not restate them here or copy their text into any other skill.** Domain skills cite rule IDs (`TD-SOURCE-01`, `TD-GAAP-01`, …) and never duplicate the prose. Duplication drifts: on 2026-07-14 `capital-rotation/SKILL.md` was instructing a unit conversion that this file explicitly forbade.

@.claude/skills/trading-discipline/SKILL.md

The main `SKILL.md` is imported here; the `references/<runtime>/` chapters are composed into agent prompts by the AI pipeline based on the runtime, not by Claude Code's `@import`. Concretely: `packages/core/src/ai/runtime/promptPolicy.ts` exposes `loadAppDiscipline(repoRoot)` and `loadBenchDiscipline(repoRoot)`; each builds a skill index for its runtime and `readSkill` appends whatever `references/<runtime>/` holds — adding a chapter is adding a file, there is no list to update. App agents (`analyst` / `deepDive` / `chat`) call the first; the bench episode runner calls the second. Claude Code sessions in this repo receive only the SKILL.md core through `@import` — the model can `read_file` a specific reference when it needs the detail, but the base discipline is the core, mirroring the app runtime's baseline load.

### Known data gotchas

Folded into trading-discipline — cite, don't restate: the `.SOX.US` proxy is TD-PROXY-01; journal filename = US trading day, same-day entries append rather than overwrite is TD-JOURNAL-01; GDELT / Trump RSS window limits are TD-WINDOW-01.

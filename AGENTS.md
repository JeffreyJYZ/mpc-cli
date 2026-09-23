# AGENTS.md

Agent-facing notes for `mpc`. The README is user-facing — keep it that way; put
architecture, gotchas and contributor rules here.

## What this is

A `bun`/TypeScript CLI comparing model pricing across **opencode Go** and **Command Code**
(GOAT / Pro / Max / Go). Both providers sell a monthly subscription granting usage credits
with per-model allowances priced at API token rates, so `mpc` normalises both onto one table
per model: cost per request, requests per month and per rolling window, and a blended score.

## Layout

```
src/index.ts                 entry: run() + top-level error handling
src/cli.ts                   flag parsing, orchestration, --check
src/types.ts                 shared types + BOUNDARY
src/html.ts                  HTML scrapers: parseTables, parseRoleRows, parseMoney, extractCatalog
src/sources/commandcode.ts   cmduse plans --json + commandcode.ai/docs/plans/*
src/sources/opencodeGo.ts    opencode.ai/docs/go + /zen/go/v1/models
src/normalize.ts             cross-provider model key
src/model-aliases.ts         branding aliases (Tencent Hy3 -> hy3, ...)
src/metrics.ts               cost/request, req windows, multiplier, 0-100 index
src/render.ts                column registry, table + JSON output, tally
test/*.test.ts               unit tests, inline fixtures, no network
```

Data flow: `loadOcGoCatalog` + `loadCcCatalog` → `buildRows` (scoring across both) →
filter/sort → `renderText`/`renderJson`.

No runtime dependencies. Scraping uses Bun's built-in `fetch` + `HTMLRewriter`.

## Commands

```sh
bun install
bun test                       # unit tests
bun run typecheck              # tsc --noEmit
bunx biome check --write .     # format + lint (always before commit)
bun run src/index.ts --help
bun link                       # exposes the `mpc` binary
```

Before every commit: `bunx biome check --write .`, `bun run typecheck`, `bun test` all clean.

## Rules

- **Biome** is the only formatter/linter (`biome check --write`). No Prettier/ESLint. If
  Biome supports the file type, use it.
- `biome.json` `$schema` must match the installed Biome version, or biome prints a migrate
  notice. Bump it when upgrading.
- **Bun** over npm. **Tabs, width 4.** TypeScript, not JS.
- Tests must not hit the network — extend the inline fixtures in `test/html.test.ts`.
- Contracts to preserve:
  - `buildMetrics` invariant: `payPerRequest * requestsPerMonth === plan.price`.
  - Free models: `costPerRequest === 0` ⇒ `requestsPerMonth = Infinity`, `index = 100`.
  - One shared index scale across both providers (`buildRows` scores the concatenated list).
- Keep README user-facing; agent/design notes go here.

## Scraping lessons (the messy part)

Everything below was a real bug. Keep them in mind when touching `src/html.ts`.

- **Text nodes concatenate.** A cell like `<del>$15</del> <strong>$60</strong><small>4x</small>`
  flattens to `$604x`. `parseTables`/`parseRoleRows` insert `BOUNDARY` (`\u0001`, from
  `types.ts`) between text nodes, and `parseMoney` splits on it and takes the **last**
  segment carrying a price. Don't join text nodes without the marker.
- **Biome forbids control chars in regex literals** (`noControlCharactersInRegex`). Never
  write `/\u0001/`. Use `str.split(BOUNDARY)` — not a regex.
- **Header cells carry sort arrows**: `Input ↕`. `headerIndex` strips non-alphanumerics
  before matching, and input/output match on prefix (`/^input/i`) because Command Code's
  grid writes `Input/M`.
- **Deal strikethrough**: `~~$30~~$67` — the last `$` in the cell is the current value.
- **Model name cells append badges** (`Grok 4.7` + `-40%` + `Ends September 27, 2026`). Take
  the first `BOUNDARY` segment as the name or the key gets polluted.
- **opencode Go rows duplicate models**: off-peak vs peak, and `≤ 256K` vs `> 256K` tiers.
  `variantScore` picks the base tier and off-peak by default; `--peak` flips the preference.
  Dedup is by canonical key.
- **Command Code layouts differ per plan.** GOAT/Pro/Max publish `<table>`s with explicit
  per-model credits (Pro has three tables; Max has two credit columns). The **Go ($1) plan
  has no table at all** — its catalog is a `role="row"` div grid parsed by `parseRoleRows`,
  and every model is assigned the plan's whole credit pool via `defaultAllowance`.
- **"Older models also available" are prose-only** on GOAT/Pro. They are filled with the
  documented standard allowance (`standardAllowance`: $20 GOAT, $30 Pro) from the wide
  catalog grid, not a credits table. Prefer explicit allowance rows over fallbacks when both
  exist (`loadCcCatalog` merges fallbacks only for keys not already present).
- **Free models** parse as `$0.00` / `Free`; allowance is irrelevant once cost is 0.
- Numeric formatting: `fmtUsd` stays fixed-point and trims zeros — scientific notation
  (`$3.67e-5`) was rejected by the user as unreadable.

## Model matching

`normalizeKey` lowercases, drops the vendor prefix and parentheticals, strips punctuation,
then applies `model-aliases.ts`. Add an alias whenever a model appears on one side only
because of branding (check `mpc --check`, which lists `only in oc-go` / `only in cc`). Speed
variants (GLM-5.2 Fast, Kimi K2.7 Code HighSpeed, MiMo V6 Pro UltraSpeed) are intentionally
distinct keys.

## Metrics semantics

- `payPerRequest = planPrice * costPerRequest / allowance` — plan-relative. A cheaper
  subscription can post a lower per-request cost while buying fewer requests, so `$/1K` is an
  effective rate and `req/mo` is the volume signal.
- Rolling windows scale the monthly figure by the plan's own ratio: opencode Go fixed
  20%/50%; Command Code derives it from the plan's 5h/weekly dollar caps (20%/50% on GOAT and
  Pro, 30%/60% on Max and Go).
- `index` = `100 * (0.6*volume + 0.2*cachePrice + 0.2*outputPrice)`, min-max normalised across
  every model-provider entry; price terms inverted.

## Sources and drift

Live, per run — no cache. `mpc --check` reports parse counts, unmatched model keys, and the
opencode Go live model id count. If a docs page changes shape, the parsers throw with the
URL; fix the parser, don't silently fall back.

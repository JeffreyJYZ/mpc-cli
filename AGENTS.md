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
src/sources/bench.ts         ability scores: cc / aa / aa-web / file / url + cache
src/sources/artificialAnalysis.ts  AA models page flight-JSON + API parser
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
variants (GLM-5.2 Fast, Kimi K2.7 Code HighSpeed, MiMo V2.6 Pro UltraSpeed) are intentionally
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
- Skewed terms use `logMinmax` (log10 then min-max): volume, tps, cache price, output price. Without
  it a single outlier (e.g. a 1000 tps model, or a $0.002 cache) squashes everyone else toward one
  end. Ability stays linear. Non-positive values clamp to `1e-6`.

## Ability scores

- `sources/bench.ts` resolves benchmark scores; `--bench` picks the scheme. Default `cc` scrapes
  Command Code's `Intelligence` column from a fixed reference page (GOAT, since plan pages vary and
  the Go grid has no Intelligence). Unscored models are filled from the keyless AA page scrape.
- `sources/artificialAnalysis.ts` parses the `{label, intelligenceIndex, detailsUrl}` dataset
  embedded in AA flight JSON. That page only embeds its chart top-N, so `aa-web` is **partial**;
  full coverage needs `AA_API_KEY` (`--bench aa`), which is **paginated** (`pagination.has_more`,
  page_size 200) — follow every page or most models silently miss. The API row shape is
  `{name, slug, evaluations.artificial_analysis_intelligence_index,
  performance.median_output_tokens_per_second}`, one row per reasoning variant, so keep the best
  per key. AA slugs normalize cleanly via `normalizeKey`
  (`qwen3-8-max-0902` -> `qwen38max0902`); slug keys win over label keys to keep variant suffixes.
- `aa-web` caches to `$XDG_CACHE_HOME/mpc/ability-aa-web.json` (7d TTL, `--refresh` busts).
- Ability and speed come from one source: CC's `Intelligence` and `Tok/s` columns (`BenchData`).
  A model with no speed figure gets the neutral 0.5 in VAL, not a penalty.
- `VAL` uses `abilityWeight` (default 0.35) and `tpsWeight` (default 0.10); remaining weight splits
  volume/cache/output 50/25/25.
  Unscored models get `valueIndex = null`; never coerce a missing score to zero.
- `lookupAbility` makes speed variants (`...Fast`, `...HighSpeed`, `...UltraSpeed`, `...FlashX`)
  inherit the base model's ability, since the weights are the same. Throughput is never inherited —
  serving differs. Add suffixes to `SPEED_SUFFIXES` in `metrics.ts` only when that is true.

## Rendering

- `render.ts` owns the column registry (`COLUMNS`), presets (`DEFAULT_COLUMNS`, `DETAIL_COLUMNS`)
  and the grouped table. Group banner = provider (`planTitle`), so column headers stay unprefixed.
- Modes: default = `DEFAULT_COLUMNS` (untrimmed); `--detail` = `DETAIL_COLUMNS` untrimmed;
  `--fit` = `DETAIL_COLUMNS` trimmed to width; `--columns` = exact and bypasses everything.
- `fitColumns` drops optional columns, symmetric across providers, when the table exceeds the
  terminal width (`process.stdout.columns`, `--width`, else 120). `drop` priority on a `Column`:
  1 = `rates`, 2 = `req/$`, 3 = `5h`/`wk`. Columns without `drop` (model, ability, win, IDX, VAL)
  are never removed. `tps` has drop priority 4.
- `req/$` is exactly `1000 / $/1K`; kept because it reads more directly, but it is not independent
  information. `$/1K` is the plan-relative figure.
- Colours follow cmduse: bold headings, dim secondary, cyan opencode, magenta Command Code, green
  winner/best, IDX green-yellow-red. Auto-off when stdout is not a TTY or `NO_COLOR` is set.

## Sources and drift

Live, per run — no cache. `mpc --check` reports parse counts, unmatched model keys, and the
opencode Go live model id count. If a docs page changes shape, the parsers throw with the
URL; fix the parser, don't silently fall back.

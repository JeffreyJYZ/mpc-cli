# AGENTS.md

Agent-facing notes for `mpc`. The README is user-facing — keep it that way; put
architecture, gotchas and contributor rules here.

## What this is

A `bun`/TypeScript CLI comparing model pricing across **OpenCode Go** and **CommandCode**
(GOAT / Pro / Max / Go). Both providers sell a monthly subscription granting usage credits
with per-model allowances priced at API token rates, so `mpc` normalises both onto one table
per model: cost per request, requests per month and per rolling window, and a blended score.

## Layout

```
src/index.ts                 entry
src/types.ts                 shared types + BOUNDARY
src/keys.ts                  canonical model key + branding aliases
src/cli/run.ts               run(): orchestration
src/cli/options.ts           Options, DEFAULTS, validators, COLUMN_HELP
src/cli/parse/               cac.ts (declarations), map.ts (bag -> Options), validate.ts
src/cli/flow/                collect.ts, sort.ts, check.ts
src/cli/engine/              cost.ts, rows.ts, score.ts, ability.ts, scale.ts, index.ts
src/data/sources/            opencode.ts + cc/ (plans, cmduse, catalog) + aa/ (web, api, parse)
src/data/bench/              index.ts (loadAbility), resolve.ts, cc.ts, store.ts, types.ts
src/data/scrape/             index.ts, tables.ts, roleRows.ts; catalog/ (catalog, numeric, variant)
src/view/render.ts           renderText / renderJson + frame constants
src/view/schema.ts           view types + the column registry
src/view/columns/            oc.ts, cc.ts, meta.ts
src/view/layout/             segments.ts, fit.ts, table.ts
src/view/text/               index.ts (colour + re-exports), format.ts, styles.ts
src/view/footer.ts           tally + legend + footer
test/cli, test/data, test/unit/{core,view}
```

Data flow: `loadOcGoCatalog` + `loadCcCatalog` -> `buildRows` (scoring across both) ->
filter/sort -> `renderText`/`renderJson`.

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

## Usage projection

- `--usage` merges sources: the provider plugin's per-request log (`~/.cache/mpc/usage.jsonl`,
  `--usage-log`, `MPC_USAGE_LOG`) with `cmduse model --json --since` (cmduse 0.6.x+); `data/logs.ts`
  scans session JSONL as the fallback. `CMDUSE_BIN` overrides the cmduse binary (dev builds).
- The plugin (`~/dev/plugins/command-code-zed`) writes that log from
  `message.updated` events — the only complete per-model source, since neither the account API nor
  Studio exposes a model dimension.
- There is **no per-model account endpoint** (`cmduse mcp` exposes only account totals). Local logs
  are partial by nature, so the report always prints a coverage line against `cmduse -1` totals and
  warns when coverage < 90%. `--usage-file` is the escape hatch for a complete mix.
- cmduse reports **per-model totals**, not per-request — `engine/project.ts` divides by `requests`
  only for the per-request figures.
- `--usage-months` scales the period to a month; the header says which. Unmatched models are
  listed in the report, never silently dropped. `--format json` dumps the whole projection.

## Config and plugins

- **Scope boundary:** extensibility is config only (flags, config file, config-layering plugins).
  Registering new providers or plans is explicitly out of scope — the tool compares OpenCode Go
  against CommandCode's real plans, nothing hypothetical.

- Precedence: defaults < plugins (listed order) < user config < CLI. `resolveBag(argv)` in
  `cli/config.ts` merges them; `parseFlags` (raw CLI) and `parseArgs` (CLI-only Options) stay
  sync so tests never touch the filesystem.
- `cli/plugins.ts`: a plugin is `.json`, or a `.js`/`.ts`/package default-exporting a config bag
  or a factory `(ctx) => bag`. Relative paths resolve against the config file's directory.
- Every flag is persistable because the config keys are the raw camelCase bag; `assertKnown`
  validates every layer, so typos in a plugin or config fail loud.
- All scoring knobs live in `ScoreConfig` (`cli/engine/score.ts`): `idxWeights`, `valWeights`,
  `scale`, `inheritSuffixes`, `window`. Colour thresholds go through `setThresholds`, colour mode
  through `setColorMode`.

## CLI parsing

- Flags are declared once in `src/cli/parse/cac.ts` and parsed with `cac`; it owns `--help` and
  `--version`. `src/cli/parse/map.ts` reduces the parsed bag to `Options`; `src/cli/parse/validate.ts`
  whitelists keys (unknown flags throw) and checks ranges.
- `--no-color` / `--no-fallback` / `--no-ability` are cac negations: the code reads
  `color === false`, `fallback === false`, `ability === false`.
- `resolveBag(argv)` is the real entry point (async, applies config + plugins); `parseArgs(argv)`
  is CLI-only and sync, for tests. `--columns help` still prints
  `COLUMN_HELP` from `src/cli/options.ts`. `-h`/`-v` exit inside cac, so tests must not pass them.

## Rules

- **Biome** is the only formatter/linter (`biome check --write`). No Prettier/ESLint. If
  Biome supports the file type, use it.
- `cac` is the only runtime dependency; keep it that way unless there is a strong reason.
- `biome.json` `$schema` must match the installed Biome version, or biome prints a migrate
  notice. Bump it when upgrading.
- **Bun** over npm. **Tabs, width 4.** TypeScript, not JS.
- Tests must not hit the network — extend the inline fixtures in `test/html.test.ts`.
- Contracts to preserve:
  - `buildMetrics` invariant: `payPerRequest * requestsPerMonth === plan.price`.
  - Free models: `costPerRequest === 0` ⇒ `requestsPerMonth = Infinity`, `index = 100`.
  - One shared index scale across both providers (`buildRows` scores the concatenated list).
- Keep README user-facing; agent/design notes go here.
- **Size limits (pragmatic, not a game):**
  1. Aim for ~100 lines per file, hard cap **150**. Split when a file has two reasons to change,
     never just to hit a number.
  2. A directory holds at most **6 entries** (files + subdirectories). Group by responsibility.
  Check: `wc -l $(rg --files -g '*.ts' src test)` and a per-dir entry count.
- **No re-export-only barrels.** Import concrete modules. A module that holds real code and also
  re-exports a few names for convenience is fine.

## Scraping lessons (the messy part)

Everything below was a real bug. Keep them in mind when touching `src/html.ts`.

- **Text nodes concatenate.** A cell like `<del>$15</del> <strong>$60</strong><small>4x</small>`
  flattens to `$604x`. `parseTables`/`parseRoleRows` insert `BOUNDARY` (`\u0001`, from
  `types.ts`) between text nodes, and `parseMoney` splits on it and takes the **last**
  segment carrying a price. Don't join text nodes without the marker.
- **Biome forbids control chars in regex literals** (`noControlCharactersInRegex`). Never
  write `/\u0001/`. Use `str.split(BOUNDARY)` — not a regex.
- **Header cells carry sort arrows**: `Input ↕`. `headerIndex` strips non-alphanumerics
  before matching, and input/output match on prefix (`/^input/i`) because CommandCode's
  grid writes `Input/M`.
- **Deal strikethrough**: `~~$30~~$67` — the last `$` in the cell is the current value.
- **Model name cells append badges** (`Grok 4.7` + `-40%` + `Ends September 27, 2026`). Take
  the first `BOUNDARY` segment as the name or the key gets polluted.
- **OpenCode Go rows duplicate models**: off-peak vs peak, and `≤ 256K` vs `> 256K` tiers.
  `variantScore` picks the base tier and off-peak by default; `--peak` flips the preference.
  Dedup is by canonical key.
- **CommandCode layouts differ per plan.** GOAT/Pro/Max publish `<table>`s with explicit
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
- Rolling windows scale the monthly figure by the plan's own ratio: OpenCode Go fixed
  20%/50%; CommandCode derives it from the plan's 5h/weekly dollar caps (20%/50% on GOAT and
  Pro, 30%/60% on Max and Go).
- `COST` = inverted value score: `100 - 100*(0.6*volume + 0.2*cachePrice + 0.2*outputPrice)`, min-max normalised across
  every model-provider entry. Lower is better, so its colour thresholds and default sort are the
  opposite of VAL.
- Skewed terms use `logMinmax` (log10 then min-max): volume, tps, cache price, output price. Without
  it a single outlier (e.g. a 1000 tps model, or a $0.002 cache) squashes everyone else toward one
  end. Ability stays linear. Non-positive values clamp to `1e-6`.

## Ability scores

- `sources/bench.ts` resolves benchmark scores; `--bench` picks the scheme. Default `cc` scrapes
  CommandCode's `Intelligence` column from a fixed reference page (GOAT, since plan pages vary and
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
- CC's `Intelligence` and AA's index are the *same* benchmark (agree to ~2dp), so `--bench cc`
  returns early without an AA round-trip. Only non-cc primaries fill from CC / AA.
- Ability and speed come from one source: CC's `Intelligence` and `Tok/s` columns (`BenchData`).
  A model with no speed figure gets the neutral 0.5 in VAL, not a penalty.
- `VAL` uses `abilityWeight` (default 0.35) and `tpsWeight` (default 0.10); remaining weight splits
  volume/cache/output 50/25/25.
  Unscored models get `valueIndex = null`; never coerce a missing score to zero.
- `lookupAbility` makes speed variants (`...Fast`, `...HighSpeed`, `...UltraSpeed`) inherit the base
  model's ability, since the weights are the same. `...FlashX` is the exception: it is the faster tier
  of `...Flash`, so it inherits `...Flash`, not the base. Throughput is never inherited — serving
  differs. Add to `SPEED_SUFFIXES` in `metrics.ts` only when the weights really are shared.

## Rendering

- `render.ts` owns the column registry (`COLUMNS`), presets (`DEFAULT_COLUMNS`, `DETAIL_COLUMNS`)
  and the grouped table. Group banner = provider (`planTitle`), so column headers stay unprefixed.
- Provider names: `providerName` (OpenCode/CommandCode, used in banners and the footer) and
  `shortProviderName` (OC/CC, used in the WIN column). Use these helpers, not literals.
- Default sort is `val` (desc). `--metric cost|perreq` ascend, `val|req` descend, `--asc` flips;
  rows with no VAL always sort last. `cost` sorts by the COST index, `perreq` by `$/req`.
- Modes: default = `DEFAULT_COLUMNS` (untrimmed); `--detail` = `DETAIL_COLUMNS` untrimmed;
  `--fit` = `DETAIL_COLUMNS` trimmed to width; `--columns` = exact and bypasses everything.
- `fitColumns` drops optional columns, symmetric across providers, when the table exceeds the
  terminal width (`process.stdout.columns`, `--width`, else 120). `drop` priority on a `Column`:
  1 = `rates`, 2 = `req/$`, 3 = `5h`/`wk`. Columns without `drop` (model, ability, win, COST, VAL)
  are never removed. `tps` has drop priority 4.
- `req/$` is exactly `1000 / $/1K`; kept because it reads more directly, but it is not independent
  information. `$/1K` is the plan-relative figure.
- Colours follow cmduse: bold headings, dim secondary, cyan OpenCode, magenta CommandCode, green
  winner/best, COST green-yellow-red. Auto-off when stdout is not a TTY or `NO_COLOR` is set.

## Sources and drift

Live, per run — no cache. `mpc --check` reports parse counts, unmatched model keys, and the
OpenCode Go live model id count. If a docs page changes shape, the parsers throw with the
URL; fix the parser, don't silently fall back.

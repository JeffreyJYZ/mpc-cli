# AGENTS.md

Agent-facing notes for `mpc`. The README is user-facing — keep it that way; put
architecture, gotchas and contributor rules here.

## Sibling repos (same owner)

`mpc` is downstream of a second repo, `~/dev/cmdcode-tools/cmduse` — same author, local-only
(never push/publish without explicit go):

| sibling | mpc's dependency on it |
| --- | --- |
| `cmduse` (Rust CLI, `cli/`) | shelled out for `plans --json` (plan price/windows), `-1 --json` (account totals, coverage), `model --json --since <ISO>` (windowed per-model local usage) |
| `@jeffreyjyz/opencode-command-code` (`opencode/`) | consumes `mpc --json` for its session sidebar (allowance, rates, Intelligence, Tok/s per model) |
| `reqshape` (`~/dev/cmdcode-tools/reqshape`) | `--shape auto` (default) / `measured` runs `reqshape --format json` and reads its combined per-req `profile` as one workload for both plans (`REQSHAPE_BIN` overrides the binary); reqshape in turn runs `mpc --json --shape off` |

Contracts that must not drift silently: cmduse's JSON shapes (`plans`, `-1`, `model`) and
`mpc --json`'s `rows[].{key,name,cc:{allowance,pricing,ability,tps,deal},oc:{...}}`, which the plugin's sidebar
reads. A change on either side updates the other in the same effort. `CMDUSE_BIN` points every
cmduse call at a dev build (`cmdusedev`). The payload's top-level `workload` became `workloads`
(one entry per side) when per-side shapes landed; the plugin reads `rows[]` only, so that rename
did not need a companion change — check `useRows.ts` before assuming any other key is unread.

## What this is

A `bun`/TypeScript CLI comparing model pricing across **OpenCode Go** and **CommandCode**
(GOAT / Pro / Max / Go). Both providers sell a monthly subscription granting usage credits
with per-model allowances priced at API token rates, so `mpc` normalises both onto one table
per model: cost per request, requests per month and per rolling window, and a volume index.

## Layout

```
src/index.ts                 entry
src/types.ts                 shared types
src/keys.ts                  canonical model key + branding aliases
src/constants/               module-level data constants: sources.ts (URLs, CC_PLANS, TTL),
                             scoring.ts (PER_MILLION, SPEED_*), view.ts (frame, columns,
                             LEGEND, CSV_HEADER, HEADERS, COLUMN_HELP), cli.ts (DEFAULTS
                             pairs, flag sets, METRICS/FORMATS/TIERS/SETS), data.ts (BOUNDARY,
                             ALIASES, deal regexes)
src/cli/run.ts               run(): orchestration
src/cli/options.ts           Options, validators
src/cli/parse/               cac.ts (declarations), map.ts (bag -> Options), fields.ts, validate.ts
src/cli/flow/                collect.ts, sort.ts, check.ts, columns.ts
src/cli/engine/              cost.ts, rows.ts, score.ts, ability.ts, scale.ts, index.ts
src/data/sources/            opencode.ts + cc/ (plans, cmduse, catalog) + aa/ (web, api, parse)
src/data/bench/              index.ts (loadAbility), resolve.ts, cc.ts, store.ts, types.ts
src/data/scrape/             index.ts, tables.ts, roleRows.ts; catalog/ (catalog, numeric, variant)
src/data/usage/              index.ts (loadUsage), parse.ts (UsageEntry), log.ts (JSONL + merge),
                             logs.ts (session scan), opencodeDb.ts (opencode store, both
                             layouts), opencodeV2.ts (session_message reader)
src/data/shape.ts            --shape: reqshape payload -> one workload for both sides (REQSHAPE_BIN)
src/view/render.ts           renderText / renderJson
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

**`bun link`'s global entry can be pruned — the bin then dangles and `mpc` dies `ENOENT`.**
`bun link` (run in this repo) creates `~/.bun/bin/mpc` →
`~/.bun/install/global/node_modules/mpc/src/index.ts`, but that global `node_modules` is shared
with every `bun install -g`, so a global install/uninstall can remove the entry while the bin
symlink stays. The failure is silent: `command -v mpc` reports nothing (a dangling symlink is
not executable), and a consumer that spawns `mpc` gets `ENOENT` with no local symptom — the
plugin's model block degrades to name-only. Restore with `bun link` here; check the target
directly with `test -e ~/.bun/install/global/node_modules/mpc/src/index.ts` (the bin's
`ls -l` still *shows* the old path, so it proves nothing).

The same prune hits every `bun link` in the group (`reqshape` too), and the global symlink
stores an **absolute** path — so moving a repo breaks it before any prune does. When
`--shape measured` warns that reqshape is missing, restore with `bun link` in
`~/dev/cmdcode-tools/reqshape` (see that repo's AGENTS.md).

## Usage projection

- `--usage` merges sources. Primary is **opencode's own store** (`data/usage/opencodeDb.ts`, read-only via
  `bun:sqlite`), read through two layouts. v2 (`data/usage/opencodeV2.ts`) appends to
  `session_message` and stopped writing `message` at the migration, so the legacy query reads
  nothing on an upgraded install; a *completed* assistant turn there carries `model{id,providerID}`,
  `cost` and `tokens`, while an in-flight one carries only the model and is skipped until it
  finishes. The legacy `message` layout (`message.data` flat: `modelID`, `providerID`, `cost`,
  `tokens{input,output,cache}`) stays as the fallback. Either way it is complete and backfilled for
  every provider opencode ran. An external JSONL log (`--usage-log`, `MPC_USAGE_LOG`) is the
  fallback when the DB is missing; `cmduse model --json --since` (cmduse 0.6.x+) and
  `data/usage/logs.ts` cover CommandCode CLI sessions. `CMDUSE_BIN` overrides the cmduse binary
  (dev builds).
- The account API has no per-model dimension (Studio's surface is the same endpoint), which is why
  opencode's own store is the per-model source.
- **delta (Zed's new app) is not a usable per-model source.** It does run Command Code — its model
  ids (`command-code-openai`, `command-code-zed/…`, `deepseek-v4-flash`) appear in
  `~/Library/Application Support/delta/user_<id>/data.sqlite` — but the conversation lives in a
  content-addressed **CRDT blob store** (`nodes`: `MapInner.CowHashMapNode` protobufs, tens of
  thousands of rows, next to a WAL that dwarfs the db), not a per-message table like opencode's
  `session_message`. There is no model/token/cost column to join on. Note the split this exposes in
  cmduse itself: its **account-wide** views (`-1 --json`, `daily`, `hourly`) come from the account
  API's cumulative summary (`fetch_pool` → `daily_from_cumulative`, `ByDay` only) and so *do* count
  every harness — delta included — but carry **no model dimension**; its **per-model** views
  (`cmduse model`, `cmduse session`, `--local`) walk `~/.commandcode/projects`, the CommandCode
  CLI's own sessions only. So delta lands in your totals and in nobody's per-model mix, which is
  exactly the gap the usage report's `cover` line shows (`local usage N of M account requests`).
  Adding it as a source means decoding that CRDT, not another `--usage-db`-style reader.
- There is **no per-model account endpoint** (`cmduse mcp` exposes only account totals), so the
  report prints a coverage line against `cmduse -1` totals and warns when coverage < 90%. Coverage
  below 100% means some traffic came from a harness that stores nothing locally (or another
  machine); `--usage-file` covers that.
- cmduse reports **per-model totals**, not per-request — `engine/project.ts` divides by `requests`
  only for the per-request figures.
- **`--usage` prices with the same rule as the fixed workload** (`project.ts`'s `totalCost`):
  reasoning joins the output term and an unpublished cache-write rate bills at the input rate.
  It once omitted reasoning and billed cache-write at `0`, so `your $` / `$/req` / `$/mo` read low
  on reasoning-heavy traffic. The `UsageEntry` now carries a `reasoning` counter, populated from
  opencode's store (`tokens.reasoning`); the CommandCode session-log block has no such counter and
  stays at 0.
- `--usage-months` scales the period to a month; the header says which. Unmatched models are
  listed in the report, never silently dropped. `--format json` dumps the whole projection.
- **The `head-to-head` line compares the plans only on the models both price** (`headToHead` in
  `view/layout/usage.ts`). Summing every row lets a model only one provider sells pad that side's
  total while adding nothing to the other — a real mix of one tied model plus two CC-only ones
  read as "OpenCode cheaper by 45%", which was 100% the CC-only rows. One-sided rows are excluded
  and the count printed; with no overlap the verdict is `none`, never a win. The plain per-side
  `totals` line stays, because each side's own projected cost is still true.

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
- All scoring knobs live in `ScoreConfig` (`cli/engine/score.ts`): `valWeights`,
  `scale`, `inheritSuffixes`, `window`. Colour thresholds go through `setThresholds`, colour mode
  through `setColorMode`.

## CLI parsing

- Flags are declared once in `src/cli/parse/cac.ts` and parsed with `cac`; it owns `--help` and
  `--version`. `src/cli/parse/map.ts` reduces the parsed bag to `Options`; `src/cli/parse/validate.ts`
  whitelists keys (unknown flags throw) and checks ranges.
- **cac does not exit on `--help`/`--version` — it prints and returns.** With `run: false` the
  parse comes back carrying `help`/`h` and `version`/`v` as *four* separate keys, so `validate.ts`'s
  `INTERNAL` set lists all four, and `run()` returns `0` on either pair before any work — without
  the early return the whole table printed after the help text, and `-h`/`-v` died on
  `unknown flag "--h"` (exit 1, which also broke piping the help).
- **A value-taking flag used bare yields the boolean `true`, not undefined.** `assertValues`
  rejects a bare value flag by name (`--usage-window expects a value`), which stops `String(true)`
  becoming the literal `"true"` (that once tried to read a file named `true`). Two are exempt:
  `config` (`--no-config` makes `true` its default, so bare `--config` cannot be told from "use
  the default path") and `shape` (**bare `--shape` means `measured`**, mapped in `map.ts`).
  Every `--no-<x>` flag defaults its positive to `true` — that is why `fit`/`fallback`/`ability`
  read `true` with no flag given.
- **cac/mri coerces a blank value to `0`**, not to `""` (`--width ""` arrived as `0` and silently
  disabled trimming; `--out ""` arrived as `0`). `assertValues` covers the bare-flag case;
  `int`/`share` reject `""`/boolean for values that arrive from config/plugin layers, and `width`
  is required to be `≥ 1` because a real `0` is meaningless.
- `--no-color` / `--no-fallback` / `--no-ability` are cac negations: the code reads
  `color === false`, `fallback === false`, `ability === false`.
- **Plugins are the lowest layer, `--plugin` included.** `resolveBag` merges the config file's
  plugins *and* the CLI's plugins before the user config, so the config overrides both; loading
  `--plugin` last let a CLI plugin beat the config file, contradicting the documented order.
- **`--print-config` validates before it prints** (`assertKnown` + `assertValues`), so a typo or an
  unknown key fails there instead of on the next real run.
- `resolveBag(argv)` is the real entry point (async, applies config + plugins); `parseArgs(argv)`
  is CLI-only and sync, for tests. `--columns help` still prints
  `COLUMN_HELP` from `src/constants/view.ts`. `-h`/`-v` exit inside cac, so tests must not pass them.

## Rules

- **Biome** is the only formatter/linter (`biome check --write`). No Prettier/ESLint. If
  Biome supports the file type, use it.
- `cac` is the only runtime dependency; keep it that way unless there is a strong reason.
- `biome.json` `$schema` must match the installed Biome version, or biome prints a migrate
  notice. Bump it when upgrading.
- **Bun** over npm. **Tabs, width 4.** TypeScript, not JS.
- **Imports: `~/` for anything outside the file's own directory, `./` for siblings.**
  The alias is a single `"~/*": ["./src/*"]` entry in `tsconfig.json` `paths`, with no
  `baseUrl` — TypeScript resolves `paths` relative to the tsconfig, and `baseUrl` is
  deprecated. Bun honours it at runtime and in tests, so `mpc` and `bun test` need no
  build step. Targets outside `src/` (test fixtures, `package.json`) stay relative.
- Tests must not hit the network — extend the inline fixtures in `test/data/catalog.test.ts`
  and `test/unit/scrape.test.ts`.
- Contracts to preserve:
  - `buildMetrics` invariant: `payPerRequest * requestsPerMonth === plan.price`.
  - Free models: `costPerRequest === 0` ⇒ `requestsPerMonth = Infinity`, `index = 100`.
    JSON has no `Infinity`, so `renderJson` (a plain `JSON.stringify` of `rows`) emits
    `requestsPerMonth: null` — and `requestsPerFiveHour`/`requestsPerWeek` with it. **`null`
    means unbounded, not unknown.** A consumer that treats it as missing data (or compares it
    numerically) is wrong; `sortProjections` in reqshape guards it explicitly for this reason.
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
  `constants/data.ts`) between text nodes, and `parseMoney` splits on it and takes the **last**
  segment carrying a price. Don't join text nodes without the marker.
- **Biome forbids control chars in regex literals** (`noControlCharactersInRegex`). Never
  write `/\u0001/`. Use `str.split(BOUNDARY)` — not a regex.
- **Header cells carry sort arrows**: `Input ↕`. `headerIndex` strips non-alphanumerics
  before matching, and input/output match on prefix (`/^input/i`) because CommandCode's
  grid writes `Input/M`.
- **Deal strikethrough**: `~~$30~~$67` — the last `$` in the cell is the current value.
- **Deal badges are later text nodes of the name cell**: the cell reads
  `Grok 4.7` · `-40%` · `Ends September 27, 2026`, joined by `BOUNDARY`, and `nameCell`
  keeps only the first node — so `dealIn` reads the rest for the DEAL column. Paid models
  are priced from the *credits* tables, which carry no badges, so `fillDeals` lends them the
  badge from the rate-only pass; without it every paid deal vanishes while the free ones
  survive. Expiry needs no logic: the docs drop the badge and revert the price themselves
  (Grok 4.7 went back to its full rate when the -40% lapsed).
- **Model name cells append badges** (`Grok 4.7` + `-40%` + `Ends September 27, 2026`). Take
  the first `BOUNDARY` segment as the name or the key gets polluted.
- **OpenCode Go rows duplicate models**: off-peak vs peak, and `≤ 256K` vs `> 256K` tiers.
  `variantScore` picks the base tier and off-peak by default; `--peak` flips the preference.
  Dedup is by canonical key.
- **CommandCode layouts differ per plan, and the shape is declared, never inferred.** GOAT/Pro/Max
  publish `<table>`s with explicit per-model credits (Pro has three tables; Max has two credit
  columns). The **Go ($1) plan publishes no credits column but is a `<table>` now** (it used to be a
  `role="row"` div grid): every model gets the plan's whole credit pool via `defaultAllowance`.
  `loadCcCatalog` selects the parser from `CC_PLANS[id].grid` — **do not branch on
  `!creditHeader`**, which is what broke Go: "no credit header" no longer means "grid", so Go was
  sent to `parseRoleRows`, matched nothing, and the load threw.
- **"Older models also available" are prose-only** on GOAT/Pro. They are filled with the
  documented standard allowance (`standardAllowance`: $20 GOAT, $30 Pro) from the wide
  catalog grid, not a credits table. Prefer explicit allowance rows over fallbacks when both
  exist (`loadCcCatalog` merges fallbacks only for keys not already present).
- **Free models** parse as `$0.00` / `Free`; allowance is irrelevant once cost is 0.
- Numeric formatting: `fmtUsd` stays fixed-point and trims zeros — scientific notation
  (`$3.67e-5`) was rejected by the user as unreadable.

## Model matching

`normalizeKey` lowercases, drops the vendor prefix and parentheticals, strips punctuation,
then applies the `ALIASES` table in `constants/data.ts`. Add an alias whenever a model appears on one side only
because of branding (check `mpc --check`, which lists `only in OpenCode` / `only in CommandCode`). Speed
variants (GLM-5.2 Fast, Kimi K2.7 Code HighSpeed, MiMo V2.6 Pro UltraSpeed) are intentionally
distinct keys.

## Metrics semantics

- `payPerRequest = planPrice * costPerRequest / allowance` — plan-relative. A cheaper
  subscription can post a lower per-request cost while buying fewer requests, so `$/1K` is an
  effective rate and `req/mo` is the volume signal.
- Rolling windows scale the monthly figure by the plan's own ratio: OpenCode Go fixed
  20%/50%; CommandCode derives it from the plan's 5h/weekly dollar caps (20%/50% on GOAT and
  Pro, 30%/60% on Max and Go).
- `COST` = inverted **volume** score: `100 - 100*volume`, min-max normalised `log10(requestsPerMonth)`
  across every model-provider entry — "how many requests the plan buys". Cache and output prices are
  their own columns and are **not** folded in (this was the `--idx-weights` blend; that flag and the
  blended index were dropped). Lower is better, so its colour thresholds and default sort are the
  opposite of VAL.
- Skewed terms use `logMinmax` (log10 then min-max): volume, tps, cache price, output price. Without
  it a single outlier (e.g. a 1000 tps model, or a $0.002 cache) squashes everyone else toward one
  end. Ability stays linear. Non-positive values clamp to `1e-6`.

## Workload and measured shape

- `Workload` is five fields: `input`, `cacheRead`, `output`, `reasoning`, `cacheWrite`
  (defaults `800 / 50000 / 200 / 0 / 0`). The defaults for `reasoning` and `cacheWrite` are 0 so
  plain `mpc` keeps producing yesterday's numbers; `--reasoning` / `--cache-write` set them.
- **Reasoning bills at the output rate *on top of* output.** opencode's store keeps
  `tokens.output` and `tokens.reasoning` as *separate* counters (one row had `output 14,
  reasoning 38`, so reasoning is not a subset of output), and the store's own provider-priced
  `cost` reproduces only when reasoning joins the output term: GLM-5.3 at 1.4 / 4.4 / 0.26 $/M
  with 8,689 in · 14 out · 38 reasoning · 128 cache-read is `0.01242668`, exactly what
  `((8689*1.4) + (14+38)*4.4 + (128*0.26))/1e6` gives. `test/unit/core/cost.test.ts` pins it.
  This was a silent underestimate of CommandCode's cost per request for months — its measured
  reasoning (≈308/req) is nearly as large as its output (≈337/req).
- A cache-write rate the model does not publish is priced at its **input** rate, never free
  (`pricing.cacheWrite ?? pricing.input`) — same rule reqshape documents.
- `buildMetrics` / `buildRows` take `Record<ProviderId, Workload>`, not one workload.
  `collect` resolves both sides to the **same** workload (`shape.workload ?? options.workload`),
  so the comparison isolates price and allowance from which traffic went where.
- `--shape` is `data/shape.ts`'s state machine over the `constants/shape.ts` specs:
  - `auto` (**the default**): run reqshape, use its profile only when `shape.reqs >=`
    `SHAPE_MIN_REQS` (both named in `constants/shape.ts`), else the fixed workload.
  - `measured`: force reqshape regardless of sample (bare `--shape` maps to this in `map.ts`).
  - `off`: fixed workload (also `""`).
  - anything else: a path to a saved `reqshape --format json` payload.
- The profile is reqshape's **combined per-req vector** — the top-level `profile`, or
  `shape.perReq` on an older payload — rounded to one `Workload` for **both** plans (`collect`
  prices both sides on `shape.workload ?? options.workload`), so the footer line and the table
  show the same digits and `req/mo` stays comparable. It is measured from **one source**,
  opencode's own store; mpc no longer reads reqshape's per-side split.
- `loadShapes` returns `{ workload?, note }` and never throws: a missing binary, an unreadable
  file or a bad payload degrades to the fixed workload. The `note` is the footer's `shape` line —
  it must say plainly **whether reqshape was used**, the sample behind `auto`'s decision, and the
  alternative flag (`--shape measured` / `--shape off`).
- **A consumer that only wants mpc's catalog must pass `--shape off`.** `auto` shells out to
  reqshape, and reqshape itself runs `mpc --json`, so a bare `mpc --json` from a sibling recurses
  (mpc -> reqshape -> mpc -> ...). reqshape's `loadMpc` and the opencode plugin's sidebar both pass
  `--shape off` for this reason. As a backstop, `loadShapes` sets `SHAPE_GUARD_ENV`
  (`MPC_SHAPE_RESOLVING`) on the reqshape child; a nested mpc that sees it keeps the fixed workload,
  so the cycle breaks even for a caller that never passes the flag (a published sibling on the old
  default).
- The footer prints the `shape` line after **one** workload line (both sides share a shape); the
  second workload line remains for the case where `ReportMeta.workloads` sides ever diverge.

## Ability scores

- `data/bench/` (`index.ts`/`resolve.ts`) resolves benchmark scores; `--bench` picks the scheme.
  `constants/cli.ts`'s `BENCH_DEFAULT` makes the default **contextual: `aa` when an AA key is
  present (`AA_API_KEY` or `--aa-key`), else `cc`**. An explicit `--bench` always wins — a key only
  chooses the default and upgrades the API path.
- **Fill order after the lead: the same benchmark's keyless `aa-web` scrape, then CommandCode (last
  resort).** So an `aa` primary merges `aa-web` then `cc`; a `cc` primary merges AA (API when keyed,
  else `aa-web`); `aa-web`/`file`/`url` fall back to `cc`. The `cc`-primary path re-merges `loadCc()`
  (a no-op — the primary already loaded it) before AA; CC's pages dropped `Tok/s`, so a `cc` primary
  usually still needs the AA fill for speed. `--no-fallback` disables the fills entirely.
- `data/sources/aa/` parses the `{label, intelligenceIndex, detailsUrl}` dataset
  embedded in AA flight JSON. That page only embeds its chart top-N, so `aa-web` is **partial**;
  full coverage needs `AA_API_KEY` (`--bench aa`), which is **paginated** (`pagination.has_more`,
  page_size 200) — follow every page or most models silently miss. The API row shape is
  `{name, slug, evaluations.artificial_analysis_intelligence_index,
  performance.median_output_tokens_per_second}`, one row per reasoning variant, so keep the best
  per key. AA slugs normalize cleanly via `normalizeKey`
  (`qwen3-8-max-0902` -> `qwen38max0902`); slug keys win over label keys to keep variant suffixes.
- `aa-web` caches to `$XDG_CACHE_HOME/mpc/ability-aa-web.json` (7d TTL, `--refresh` busts).
- CC's `Intelligence` and AA's index are the *same* benchmark (agree to ~2dp), so a `cc` primary
  with its own throughput returns early without an AA round-trip; otherwise it, and every non-`cc`
  primary, fills from `aa-web` and then CC per the order above.
- Ability and speed come from one source: CC's `Intelligence` and `Tok/s` columns (`BenchData`).
  A model with no speed figure gets the neutral 0.5 in VAL, not a penalty.
- `VAL` uses `abilityWeight` (default 0.35) and `tpsWeight` (default 0.10); remaining weight splits
  volume/cache/output 50/25/25.
  Unscored models get `valueIndex = null`; never coerce a missing score to zero.
- `lookupAbility` makes speed variants (`...Fast`, `...HighSpeed`, `...UltraSpeed`) inherit the base
  model's ability, since the weights are the same. `...FlashX` is the exception: it is the faster tier
  of `...Flash`, so it inherits `...Flash`, not the base. `lookupTps` gives a variant with no
  throughput of its own the base's ×`SPEED_TPS_FACTOR`: serving differs, but leaving it `null`
  scored a Fast model at the neutral 0.5 — as if it were mid-pack — which ranked DeepSeek V4.1
  Flash Fast below its slower base. Add a suffix to `SPEED_SUFFIXES` in `constants/scoring.ts` only when the
  weights really are shared.

## Rendering

- `src/view/schema.ts` owns the column registry (`COLUMNS`) and the grouped table; the tiers
  (`MINIMAL_COLUMNS`, `MEDIUM_COLUMNS`, `DETAIL_COLUMNS`) live in `src/constants/view.ts`.
  Group banner = provider (`planTitle`), so column headers
  stay unprefixed.
- Provider names: `providerName` (OpenCode/CommandCode, used in banners and the footer) and
  `shortProviderName` (OC/CC, used in the WIN column). Use these helpers, not literals.
- Default sort is `val` (desc). `--metric cost|perreq` ascend, `val|req` descend, `--asc` flips;
  rows with no VAL always sort last. `cost` sorts by the COST index, `perreq` by `$/req`.
- Column selection is `cli/flow/columns.ts`: `--columns` (exact) > `--preset` (config) >
  the tier flags > the default. **The default tier is `DETAIL_COLUMNS` trimmed to width** —
  the old untrimmed 12-column `DEFAULT_COLUMNS` is now `--medium`, and `--minimal` is the
  5-column answer (model + req/mo both sides + win + val). `--detail` is the same content as
  the default, untrimmed, so the default and `--detail` differ only by trimming.
- Trimming is on by default (`fit: true`), which is what `--fit` used to be: `trimsToWidth`
  is false only for `--detail`, an exact `--columns` list, or `--no-fit`. Two tier flags at
  once throws rather than silently picking one.
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

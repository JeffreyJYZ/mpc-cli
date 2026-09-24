# mpc — model price compare

Compare what the same model actually costs you on **OpenCode Go** vs **CommandCode**
(GOAT / Pro / Max), using one fixed per-request workload.

Both providers sell the same shape of thing: a monthly subscription that grants a pool of
usage credits, with a per-model allowance priced at API token rates. `mpc` normalises both
onto one table so you can see, per model, how many requests a month each plan buys and what
each request really costs you.

## Usage

```sh
mpc                                   # oc-go Go vs CommandCode GOAT, default workload
mpc --cc-plan pro                     # compare against CommandCode Pro
mpc --cc-plan go                      # ...or the $1 Go plan
mpc --detail                          # add raw token rates + allowances
mpc --model 'kimi|glm' --metric req   # filter, sort by requests/month
mpc --in 2000 --cache 80000 --out 400 # override the fixed workload
mpc --fit                             # widest column set that fits the terminal
mpc --detail                          # every column, untrimmed (for copy/paste or agents)
mpc --bench aa-web                    # ability scores from Artificial Analysis
mpc --json                            # machine-readable output
mpc --check                           # validate live sources and report drift
```

Flags are parsed with [cac](https://github.com/cacjs/cac); `--help` and `--version` come from it.
Unknown flags and out-of-range values are rejected.

Run it directly with Bun (`bun run src/index.ts ...`) or link the binary:

```sh
bun link
mpc --help
```

## Your real usage (`--usage`)

Project what you actually ran onto both plans, from the local CommandCode session logs
(offline). `--usage-window` picks the range — `period` (the billing cycle, default), `all`, or
`<n>d`:

```sh
mpc --usage
mpc --usage --usage-window all
mpc --usage --usage-file ./usage.json            # your own mix (see caveat below)
mpc --usage --usage-months 2                     # scale a partial window to a month
mpc --usage --json                               # full projection
```

Sources, merged when more than one is present:

| source | covers |
| --- | --- |
| **opencode's message store** (`~/.local/share/opencode/opencode.db`, `--usage-db`, `OPENCODE_DB`) | every request opencode ran, for every provider — complete and backfilled |
| external per-request log (`--usage-log`, `MPC_USAGE_LOG`, default `$XDG_CACHE_HOME/mpc/usage.jsonl`) | any harness that writes one JSON line per request; consulted only when the DB is absent |
| `cmduse model --json --since <ISO>` (cmduse 0.6.x+) | CommandCode CLI sessions on this machine |
| session-log scan (`~/.commandcode/projects`) | fallback when cmduse lacks the window |
| `--usage-file` | anything else you have |

The DB is read-only via `bun:sqlite`; assistant messages carry `cost`, `tokens` and
`modelID`/`providerID`, so no plugin is required for the opencode side. Set `CMDUSE_BIN` to test
against a dev cmduse (`cmdusedev`).

**Scope caveat.** Only *local* sources exist — the account API exposes totals, not per-model
usage, and Studio's API surface is the same endpoint. The report prints a coverage line
(`local usage N of M account requests (x%)`) and warns below 90%, so a partial mix is visible
rather than silently wrong.

```
MODEL          your req    your $    CC $/req  CC $/mo    OC $/req  OC $/mo  cheaper
GLM-5.2             142  $15.7237     $0.0158  $2.2462     $0.0185  $2.6206  CC
GLM-5.3 Flash        29   $0.7203  $0.0062091  $0.1801  $0.0041394    $0.12  OC
totals  CC $2.4761/mo · OpenCode $2.7686/mo · cheaper CommandCode by $0.2925 (12%)
```

Usage is per-model **totals**, so `your $` is the list value of the tokens, `CC $/mo` is what that
subscription would cost you, and models that exceed a plan's allowance are flagged `over cap`.
Unknown models are listed, never dropped. Accepts the cmduse shape, `{"entries": [...]}`, or a bare
array of `{ model, requests, tokensIn, cacheRead, tokensOut }`.

## Config file

Every flag persists. `mpc` reads `~/.config/mpc/config.json` (or `$XDG_CONFIG_HOME/mpc/config.json`),
overridden by CLI flags, and `--config <path>` / `--no-config` control it. Keys are the camelCase
flag names, negations are plain booleans:

```json
{
  "ccPlan": "goat",
  "columns": ["model", "oc-per1k", "cc-per1k", "val"],
  "presets": { "cheap": ["model", "oc-per1k", "cc-per1k", "cost"] },
  "metric": "val",
  "benchWeight": 0.4,
  "valWeights": [0.4, 0.1, 0.25, 0.15, 0.1],
  "color": false,
  "plugins": ["./work.json", "mpc-preset-openai"]
}
```

`--print-config` prints the effective settings.

### Plugins

`plugins` (or `--plugin a,b`) layer config fragments between the defaults and your config:

```
defaults  <  plugins (listed order)  <  user config  <  CLI flags
```

Relative paths resolve against the config file's directory. A plugin is a `.json` file, or a
`.js`/`.ts`/package whose default export is a config object (or a sync/async function returning
one, given `{ env, cwd, configDir }`). JS plugins run code — same trust as your shell.

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--cc-plan <id>` | `goat` | CommandCode plan: `go`, `goat`, `pro`, `max10`, `max20` |
| `--in <n>` | `800` | fixed input tokens per request |
| `--cache <n>` | `50000` | fixed cache-read tokens per request |
| `--out <n>` | `200` | fixed output tokens per request |
| `--metric <name>` | `val` | sort by `val`, `cost`, `perreq`, `req` or `name`; `cost` and `perreq` ascend (lower better), `val`/`req` descend, `--asc` flips; rows with no `VAL` always sort last |
| `--model <re>` | — | filter rows by name (regex, substring fallback) |
| `--only <scope>` | `all` | `all` = union of both catalogs, `both` = only shared models |
| `--width <n>` | terminal | force table width; otherwise auto-detect and drop optional columns (`rates`, `req/$`, `5h`/`wk`) to fit |
| `--fit` | off | show the widest column set that fits the terminal |
| `--columns <ids>` | preset | comma-separated columns to show, in order (overrides presets); `--columns help` lists ids |
| `--bench <src>` | `cc` | ability scores: `cc`, `aa`, `aa-web`, `file:<path>`, `url:<url>` |
| `--bench-weight <n>` | `0.35` | ability share of `VAL`, 0-1 |
| `--tps-weight <n>` | `0.10` | output-speed share of `VAL`, 0-1 |
| `--bench-name <label>` | source | footer label for the ability source |
| `--bench-key <key>` | `AA_API_KEY` | Artificial Analysis API key |
| `--no-fallback` | off | with `--bench cc`, skip the Artificial Analysis fill |
| `--refresh` | off | ignore the `aa-web` cache |
| `--no-ability` | off | hide `ability` and `VAL` |
| `--preset <name>` | — | named column set from `presets` in config |
| `--idx-weights <a,b,c>` | `0.6,0.2,0.2` | COST weights (volume, cache, output), normalised |
| `--val-weights <a,b,c,d,e>` | see above | VAL weights (ability, tps, volume, cache, output) |
| `--scale <mode>` | `log` | `log` or `linear` normalisation for skewed terms |
| `--inherit-suffixes <s>` | built-in | speed-variant suffixes that inherit ability |
| `--window <five,week>` | derived | override rolling-window ratios |
| `--cost-thresholds <g,y>` | `30,60` | COST colour cut-offs |
| `--val-thresholds <y,g>` | `40,70` | VAL colour cut-offs |
| `--format <name>` | `table` | `table`, `json`, `csv`, `md` |
| `--color <mode>` | `auto` | `auto`, `always`, `never` |
| `--config <path>` | XDG | config file |
| `--no-config` | off | ignore config and plugins |
| `--plugin <paths>` | — | extra config plugins, comma-separated |
| `--print-config` | — | print effective settings and exit |
| `-h, --help` | — | generated help (cac) |
| `-v, --version` | — | print version |
| `--peak` | off | use peak-rate rows instead of off-peak (DeepSeek) |
| `--asc` | off | sort ascending |
| `--detail` | off | preset: adds token rates and 5h/week columns |
| `--json` | off | emit JSON instead of a table |
| `--no-color` | off | disable ANSI colour |
| `--check` | off | validate sources, list unmatched models, exit |

## Data sources (all fetched live)

| Source | Provides |
| --- | --- |
| `cmduse plans --json` | CommandCode plan price, credits, 5h/weekly windows |
| `commandcode.ai/docs/plans/{goat,pro,max}` | per-model credits + token rates |
| `opencode.ai/docs/go/` | oc-go per-model monthly limit + token rates |
| `opencode.ai/zen/go/v1/models` | oc-go live model list (`--check` drift) |

## Reading the table

| Column | Meaning |
| --- | --- |
| `in/out/cache` (`--detail`) | model token rates, USD per 1M tokens |
| `allow` | monthly credits this plan devotes to that model |
| `req/5h`, `req/wk` (`--detail`) | requests the plan's rolling 5-hour / weekly window allows |
| `req/mo` | requests the allowance buys (`allowance / costPerRequest`) |
| `$/1K` | what 1,000 requests cost you on the plan |
| `req/$` | requests one dollar of subscription buys |
| `ability` | benchmark score for the model |
| `tps` | output tokens per second |
| `WIN` | side with the lower per-request cost |
| `COST` | 0-100 cost index, **lower is better** (no ability) |
| `VAL` | 0-100 ability-aware value score |

`--columns a,b,c` picks and orders columns; ids are listed under `--columns help`, and `cc-*` mirrors the `oc-*` set.

Rolling-window columns scale the monthly figure by each plan's own window ratio (OpenCode Go fixes 5h = 20%, weekly = 50%; CommandCode derives it from the plan's 5h/weekly dollar caps — 20%/50% on GOAT and Pro, 30%/60% on the Max plans).

`--json` reports the raw `costPerRequest`, `payPerRequest`, `requestsPerMonth`, `requestsPerFiveHour`, `requestsPerWeek`, `multiplier` and `index` per model-provider, plus a `tally` object.

The footer keeps a running **win tally** over head-to-head models (`oc-go N · cc M · tie T`) plus exclusive counts for models only one provider carries.

## How the numbers are computed

For a fixed workload of `IN` input, `CACHE` cache-read and `OUT` output tokens:

```
costPerRequest   = (IN*input + CACHE*cacheRead + OUT*output) / 1e6   # USD, list rates
requestsPerMonth = allowance / costPerRequest
payPerRequest    = planPrice * costPerRequest / allowance            # what you really pay
multiplier       = allowance / planPrice                             # $usage per $paid
```

The **index** is a 0-100 blended value score across every model-provider entry:

```
index = 100 * (0.60*volume + 0.20*cachePrice + 0.20*outputPrice)
```

where `volume` is min-max normalised `log10(requestsPerMonth)` and the two price terms are
min-max normalised and inverted (cheaper scores higher). Free models get `∞` requests and
`index = 100`.

## Ability scores (`VAL`)

`VAL` reuses the `COST` recipe with a benchmark term:

```
COST = 100 - 100·(0.60*volume + 0.20*cache + 0.20*output)   # inverted: 0 is best
VAL = 100 * (0.35*ability + 0.10*tps + 0.25*volume + 0.15*cache + 0.15*output)
```

`--bench-weight` and `--tps-weight` set the ability and speed shares; the remaining weight
splits volume/cache/output 50/25/25. Ability and `tps` come from the same source, so `--bench cc`
reads both CommandCode's `Intelligence` and `Tok/s` columns.
Speed variants (`…Fast`, `…HighSpeed`, `…UltraSpeed`, `…FlashX`) inherit their base model's
ability — same weights — but not its throughput. Unscored models show `ability —` and `VAL —` and
are excluded from the ability normalisation range.

| `--bench` | source | coverage |
| --- | --- | --- |
| `cc` (default) | CommandCode's `Intelligence` column | every matched model |
| `aa` | Artificial Analysis API (paginated) | full; needs `AA_API_KEY` |
| `aa-web` | Artificial Analysis models page scrape | partial (only the models AA embeds) |
| `file:<path>` / `url:<url>` | your JSON, `{ "model": score }` or `[{ model, score }]` | whatever you supply |

Default is `cc`. Because CC's `Intelligence` column and Artificial Analysis publish the same
index, CC is used alone — no second round-trip. Pick `--bench aa` for AA's own catalog; other
sources fall back to CC, then to `--no-fallback` to disable. The `aa-web` result is cached under
`$XDG_CACHE_HOME/mpc/` (or `~/.cache/mpc/`) for 7 days; `--refresh` busts it.

## Model matching

Names from the two catalogs are collapsed onto one canonical key (lowercase, vendor prefix
stripped, punctuation removed, parenthetical qualifiers dropped), with a small alias table
for branding differences (`Tencent Hy3` ↔ `hy3`, `…Vision (exp)` ↔ `…vision-exp`). Models
present on only one side still appear; the other column shows `—`.

## Notes and limits

- CommandCode plans are read from their docs pages: `goat`, `pro` and the Max plans list
  explicit per-model credits; the **Go** ($1) plan publishes only a rate list, so every model
  draws on the plan's whole $10 credit pool.
- Models CommandCode lists with rates but no explicit credits row (the "older models also
  available" set) use the documented standard allowance ($20 on GOAT, $30 on Pro).
- OpenCode Go has no shared credit pool; each model carries its own monthly limit, so the
  plan's "credits" figure is the sum of those limits (an upper bound, not a pool).
- `$/1K` and `req/$` are plan-relative: they divide by the plan's own price, so a cheaper
  subscription can post a lower per-request cost while buying fewer requests. Compare
  `req/mo` for volume and `$/1K` for the effective rate.
- Values reflect the docs at fetch time; active deals are picked up automatically.

## Development

```sh
bun install
bun test          # unit tests (parsers, normalisation, metrics)
bun run typecheck # tsc --noEmit
bun run check     # biome format + lint (write)
```

# mpc — model price compare

Compare what the same model actually costs you on **opencode Go** vs **Command Code**
(GOAT / Pro / Max), using one fixed per-request workload.

Both providers sell the same shape of thing: a monthly subscription that grants a pool of
usage credits, with a per-model allowance priced at API token rates. `mpc` normalises both
onto one table so you can see, per model, how many requests a month each plan buys and what
each request really costs you.

## Usage

```sh
mpc                                   # oc-go Go vs Command Code GOAT, default workload
mpc --cc-plan pro                     # compare against Command Code Pro
mpc --cc-plan go                      # ...or the $1 Go plan
mpc --detail                          # add raw token rates + allowances
mpc --model 'kimi|glm' --metric req   # filter, sort by requests/month
mpc --in 2000 --cache 80000 --out 400 # override the fixed workload
mpc --json                            # machine-readable output
mpc --check                           # validate live sources and report drift
```

Run it directly with Bun (`bun run src/index.ts ...`) or link the binary:

```sh
bun link
mpc --help
```

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--cc-plan <id>` | `goat` | Command Code plan: `go`, `goat`, `pro`, `max10`, `max20` |
| `--in <n>` | `800` | fixed input tokens per request |
| `--cache <n>` | `50000` | fixed cache-read tokens per request |
| `--out <n>` | `200` | fixed output tokens per request |
| `--metric <name>` | `index` | sort by `index`, `req`, `cost` or `name` |
| `--model <re>` | — | filter rows by name (regex, substring fallback) |
| `--only <scope>` | `all` | `all` = union of both catalogs, `both` = only shared models |
| `--width <n>` | terminal | force table width; otherwise auto-detect and drop optional columns (`rates`, `req/$`, `5h`/`wk`) to fit |
| `--columns <ids>` | preset | comma-separated columns to show, in order (overrides `--detail` and auto-fit); `--columns help` lists ids |
| `--peak` | off | use peak-rate rows instead of off-peak (DeepSeek) |
| `--asc` | off | sort ascending |
| `--detail` | off | preset: adds token rates and 5h/week columns |
| `--json` | off | emit JSON instead of a table |
| `--no-color` | off | disable ANSI colour |
| `--check` | off | validate sources, list unmatched models, exit |

## Data sources (all fetched live)

| Source | Provides |
| --- | --- |
| `cmduse plans --json` | Command Code plan price, credits, 5h/weekly windows |
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
| `WIN` | side with the lower per-request cost |
| `IDX` | 0-100 blended value score |

`--columns a,b,c` picks and orders columns; ids are listed under `--columns help`, and `cc-*` mirrors the `oc-*` set.

Rolling-window columns scale the monthly figure by each plan's own window ratio (opencode Go fixes 5h = 20%, weekly = 50%; Command Code derives it from the plan's 5h/weekly dollar caps — 20%/50% on GOAT and Pro, 30%/60% on the Max plans).

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

## Model matching

Names from the two catalogs are collapsed onto one canonical key (lowercase, vendor prefix
stripped, punctuation removed, parenthetical qualifiers dropped), with a small alias table
for branding differences (`Tencent Hy3` ↔ `hy3`, `…Vision (exp)` ↔ `…vision-exp`). Models
present on only one side still appear; the other column shows `—`.

## Notes and limits

- Command Code plans are read from their docs pages: `goat`, `pro` and the Max plans list
  explicit per-model credits; the **Go** ($1) plan publishes only a rate list, so every model
  draws on the plan's whole $10 credit pool.
- Models Command Code lists with rates but no explicit credits row (the "older models also
  available" set) use the documented standard allowance ($20 on GOAT, $30 on Pro).
- opencode Go has no shared credit pool; each model carries its own monthly limit, so the
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

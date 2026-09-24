import { COLUMN_IDS } from "../render.ts";
import { CC_PLANS } from "../sources/commandcode.ts";
import { DEFAULTS } from "./args.ts";

export const USAGE = `mpc — compare model pricing across OpenCode Go and CommandCode plans

Usage: mpc [options]

Options:
  --cc-plan <id>   CommandCode plan: ${Object.keys(CC_PLANS).join(", ")} (default goat)
  --in <n>         fixed input tokens per request (default ${DEFAULTS.input})
  --cache <n>      fixed cache-read tokens per request (default ${DEFAULTS.cacheRead})
  --out <n>        fixed output tokens per request (default ${DEFAULTS.output})
  --metric <name>  sort by: val | cost | perreq | req | name (default val)
                   cost ascends (0 is best), perreq ascends ($/req), val/req descend;
                   --asc flips; rows with no VAL always sort last
  --model <re>     only rows whose name matches (regex, falls back to substring)
  --only <scope>   both = models on both providers, all = union (default all)
  --fit            show the widest column set that fits the terminal
  --bench <src>    ability scores: cc | aa | aa-web | file:<path> | url:<url>
  --bench-weight   ability share of VAL, 0-1 (default 0.35)
  --tps-weight     output-speed share of VAL, 0-1 (default 0.1)
  --bench-name     footer label for the source (else source's own)
  --bench-key      Artificial Analysis API key (else AA_API_KEY)
  --no-fallback    with --bench cc, do not fill from other sources
  --refresh        ignore the aa-web cache
  --no-ability     hide ability and VAL
  --peak           use peak-rate rows (OpenCode Go DeepSeek off/on-peak)
  --asc            sort ascending instead of descending
  --detail         every column, untrimmed
  --width <n>      force table width; otherwise auto-detect and drop optional
                   columns (rates, req/$, 5h/wk) to fit the terminal
  --columns <ids>  comma-separated columns, in order (overrides --detail)
                   ids: ${COLUMN_IDS.join(", ")}
                   use --columns help for descriptions
  --json           machine-readable output
  --no-color       disable ANSI colour
  --check          validate live sources, report drift, then exit
  -h, --help       show this help`;

export const COLUMN_HELP = `Available columns (--columns a,b,c):
  model            model name
  oc-rates         OpenCode in/out/cache token rates ($/M)
  oc-allow         OpenCode monthly allowance for the model
  oc-req5h         requests the OpenCode 5-hour window allows
  oc-reqwk         requests the OpenCode weekly window allows
  oc-reqmo         requests the OpenCode monthly allowance buys
  oc-per1k         OpenCode cost per 1,000 requests
  oc-reqdollar     OpenCode requests per $1 of subscription
  cc-*             the same set for the CommandCode plan
  ability          benchmark score for the model
  tps              output tokens per second
  win              side with the lower per-request cost
  cost             0-100 cost index, lower is better
  val              0-100 ability-aware value score

Presets: default = model + allow/reqmo/per1k/reqdollar for both sides + win + cost + val
         --detail = every column, untrimmed
         --fit = every column, trimmed to the terminal width`;

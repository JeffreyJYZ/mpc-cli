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

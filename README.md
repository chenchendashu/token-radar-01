[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chenchendashu/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chenchendashu/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A make.fun **token-radar-01** entry: a program that reads a frozen DefiLlama
snapshot of the protocol universe and ranks every pre-token protocol by an
implied value derived from the snapshot's own figures, each with a concrete
farm plan, plus a static dashboard to explore the board.

## How it works

- **Coverage.** Every protocol whose record shows no token is ranked, except
  wrapped/bridged asset products and exchange wrappers (the asset they
  represent already trades), versioned pools, and exchanges — mirroring the
  snapshot's own watchlist definition. On the sealed snapshot that is 227
  protocols, including all 40 watchlist protocols. Protocols whose token
  already trades are shown separately, at market value.
- **Implied value.** `implied FDV = TVL x category multiple x growth
  multiplier x maturity multiplier`. The category multiple is the median
  market-cap/TVL of the snapshot's own tokenized protocols in the same
  category (the global median when a category has fewer than three such
  peers) — no hardcoded per-protocol values. Growth uses the 7-day TVL
  change (clamped, weight 0.5); maturity grows with the protocol's age.
- **Expected airdrop.** Each row also carries a launch probability heuristic
  (age and growth) and an expected airdrop value assuming a 7.5% community
  allocation.
- **Farm plans.** 7–9 steps per protocol, generated from its category,
  chains, TVL tier and age, each with a cost and a time estimate.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. Node 22+, standard library only.
Open `dashboard/index.html` from the output directory to explore the board:
sortable and filterable, with a detail view per protocol and a separate
live-tokens view.

// One snapshot, full pre-token coverage. Category multiples are medians of reported mcap/TVL
// among the snapshot's tokenized peers; categories with fewer than three use the global median.
// Ranking uses full precision. Only board.json's model display fields are rounded to four decimals.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Shared growth and maturity rules. Valuation multiples are calibrated separately, never fixed. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 48;

export interface CategoryMultiple {
  multiple: number;
  peers: number; // Zero means the global median was used.
}

export interface Calibration {
  global_multiple: number;
  global_peers: number;
  categories: Map<string | null, CategoryMultiple>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** Dashboard rows retain the snapshot facts and the exact board farm plan. */
export interface RadarRow extends SnapshotProtocol {
  rank: number;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_probability: number;
  expected_airdrop_usd: number;
  farm_steps: string[];
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_peers: number;
  peer_min_tvl_usd: number;
  category_min_peers: number;
  community_allocation: number;
  protocol_count: number;
  watchlist: string[];
  watchlist_covered: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median preserves each snapshot observation, including signed reported market caps. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const PEER_MIN_TVL = 5_000_000;
const CATEGORY_MIN_PEERS = 3;
const COMMUNITY_ALLOCATION = 0.075;

/** A missing or zero market cap offers no observed valuation ratio. All tokenized categories count. */
export function categoryMultiples(snapshot: Snapshot): Calibration {
  const groups = new Map<string | null, number[]>();
  const ratios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd === 0 || !Number.isFinite(p.mcap_usd) || p.tvl_usd < PEER_MIN_TVL) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    ratios.push(ratio);
    const group = groups.get(p.category) ?? [];
    group.push(ratio);
    groups.set(p.category, group);
  }
  if (ratios.length === 0) throw new SnapshotError('snapshot has no tokenized peers with a reported market cap and TVL of at least $5M');
  const global = median(ratios);
  if (!Number.isFinite(global) || global <= 0) throw new SnapshotError('snapshot has no positive global median valuation');
  const categories = new Map<string | null, CategoryMultiple>();
  for (const p of snapshot.protocols) {
    if (categories.has(p.category)) continue;
    const group = groups.get(p.category) ?? [];
    categories.set(p.category, group.length >= CATEGORY_MIN_PEERS
      ? { multiple: median(group), peers: group.length }
      : { multiple: global, peers: 0 });
  }
  return { global_multiple: global, global_peers: ratios.length, categories };
}

/** The implied value is rounded once, after multiplying unrounded factors. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, multiple: number, model: ModelConstants = MODEL): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Asset-product name rules from the snapshot's watchlist definition. */
const ASSET_PRODUCT_NAME = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Rank pre-token protocols, excluding exchanges, versioned pools and existing-asset products. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX'
    && p.category !== 'Bridge' && p.category !== 'Canonical Bridge'
    && !VERSIONED.test(p.name) && !ASSET_PRODUCT_NAME.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, calibration: Calibration = categoryMultiples(snapshot)): BoardRow[] {
  const scored = snapshot.protocols.filter(isRankable).map((p) => {
    const multiple = calibration.categories.get(p.category)!.multiple;
    const score = impliedValue(p, snapshot.as_of, multiple, model);
    return { p, multiple, ...score };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(s.multiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const tail = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const action = step.text.length + tail.length > 600 ? `${step.text.slice(0, 597 - tail.length)}...` : step.text;
  let s = `${action}${tail}`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Per-action gas estimates, not quotes. Unlisted chains use the stated $1 estimate. */
const CHAIN_GAS: Record<string, number> = {
  Ethereum: 6, Arbitrum: 0.4, Base: 0.25, Optimism: 0.3, Solana: 0.05,
  BSC: 0.2, Polygon: 0.05, Avalanche: 0.3,
};

export function gasFor(chain: string): number { return CHAIN_GAS[chain] ?? 1; }
const dollars = (n: number): string => `$${Number(n.toFixed(2))}`;

interface CategoryActions {
  main: string;
  second: string;
  weekly: string;
  mainActions: number;
  secondActions: number;
  secondTime: string;
  fees: string;
}

/** Category-specific actions use only the record's category, first chain and TVL-derived budget. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): CategoryActions {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = dollars(capital / 5);
  const common = { mainActions: 2, secondActions: 2, secondTime: '15 minutes after one week', fees: 'product fees extra; check the quote first' };
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return {
    ...common, mainActions: 5,
    main: `Supply $${capital} of USDC (or ${chain}'s main stable) to ${name} on ${chain}. Borrow 35% against it, then repay once to register both sides of the market; leave the original supply open.`,
    second: `On ${name}, borrow 30% against the same supply for one week, monitor the collateral health, and repay principal plus accrued interest. Avoid recursive borrowing.`,
    weekly: `Make one small stablecoin supply top-up to ${name}, using funds from your existing budget.`,
    fees: 'borrow interest extra; check the rate before confirming', secondTime: '10 minutes to borrow, one week holding, 10 minutes to repay',
  };
  if (c.includes('dex') || c.includes('amm')) return {
    ...common, mainActions: 5, secondActions: 3,
    main: `Swap part of the $${capital} budget through ${name}'s main pairs on ${chain} in both directions. Then provide the budget as liquidity to its main stable pair and keep the LP position.`,
    second: `Rebalance 10% of the ${name} stable-pair LP: remove that share, restore the pair's required proportions, and add it back while leaving the rest invested.`,
    weekly: `Make one ${small} swap through a main ${name} pair from the same budget.`, fees: 'swap fees and slippage extra; use a 0.5% slippage ceiling',
  };
  if (c.includes('bridge') || c.includes('cross chain')) return {
    ...common, mainActions: 3,
    main: `Bridge $${capital} of stablecoins to ${chain} through ${name}, then deposit a small portion in one destination app and keep the rest available for the return route.`,
    second: `After one week, bridge ${small} back through ${name}'s return route. Record both source and destination transaction hashes, keeping the remaining capital on ${chain}.`,
    weekly: `Make one ${small} transfer through ${name} on an available route with the same wallet.`,
    fees: 'bridge fees and source-chain gas extra; check both route quotes',
  };
  if (c.includes('stak')) {
    const restaker = c.includes('restak') || c.includes('restaked');
    return {
      ...common, mainActions: restaker ? 3 : 2,
      main: `Stake $${capital} of ${chain}'s native asset through ${name} on ${chain} and hold the receipt token.${restaker ? ' Restake that receipt once in the protocol\'s supported restaking route.' : ''}`,
      second: restaker
        ? `Review ${name}'s available restaking operators and move 10% to a second supported allocation once. If reallocation is unavailable, make one small restaking top-up instead.`
        : `Redeem ${small} of ${name}'s staking receipt and stake the recovered native asset again after the exit queue clears; keep the remaining receipt position.`,
      weekly: `Make one small ${restaker ? 'restaking' : 'native-asset staking'} top-up through ${name} from the same budget.`,
      secondTime: restaker ? '15 minutes after one week' : '15 minutes plus the published exit queue',
      fees: 'staking or exit fees extra; check the published queue',
    };
  }
  if (c.includes('derivative') || c.includes('perpetual')) return {
    ...common, mainActions: 4, secondActions: 2,
    main: `Use a $${capital} budget on ${chain}: deposit ${dollars(capital / 2)} as ${name} margin, buy ${dollars(capital / 4)} of matching spot elsewhere, and short the same small perp notional. Target $${capital * 4} total traded volume over four weeks, within funded margin.`,
    second: `Close the first ${name} hedge and open a small matched spot/short-perp hedge in a second liquid market. Check liquidation distance and funding before each trade.`,
    weekly: `Make one small position reduction or adjustment on ${name}, keeping the spot and short-perp exposures matched.`,
    fees: 'trading fees, funding and spot-venue gas extra; check before trading',
  };
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('farm')) return {
    ...common, secondTime: '15 minutes after at least 30 days',
    main: `Deposit $${capital} into one ${name} vault on ${chain}. Choose its main stable-asset strategy, read withdrawal terms, and keep the vault shares.`,
    second: `After one month, redeem ${small} of the first ${name} vault's shares and move that recovered capital once to a second vault; keep both share positions.`,
    weekly: `Make one small deposit into the chosen ${name} vault using the same budget.`, fees: 'vault performance or withdrawal fees extra; check the terms',
  };
  if (c.includes('rwa')) return {
    ...common,
    main: `Mint or buy $${capital} of ${name}'s yield asset on ${chain} and hold it. Confirm identity checks, jurisdiction access and minimum purchase sizes on the protocol's own pages before funding.`,
    second: `Use ${name}'s supported redemption route for ${small}, then buy or mint that amount again once settlement completes; retain the rest of the yield asset.`,
    weekly: `Make one small eligible yield-asset purchase through ${name} if its minimum order fits the budget.`,
    secondTime: '15 minutes plus the published settlement window', fees: 'issuance and redemption fees extra; check the minimum order',
  };
  if (c.includes('prediction')) return {
    ...common, mainActions: 4,
    main: `Fund ${name} on ${chain} with a $${capital} budget. Place small ${dollars(capital / 10)} positions in at least three different liquid markets and keep most of the budget uncommitted.`,
    second: `Settle one resolved ${name} position, then use only its recovered proceeds in a fourth market; log the market IDs and avoid repeatedly trading against yourself.`,
    weekly: `Place one small ${name} market position from the same funded balance.`, fees: 'market fees extra; the stake can be lost',
    secondTime: '10 minutes once a market resolves',
  };
  if (c.includes('stable')) return {
    ...common, mainActions: 3,
    main: `Use $${capital} as collateral to mint ${name}'s stable asset on ${chain}, or deposit that budget into its stability pool. Keep the stable asset or pool receipt and monitor collateral requirements.`,
    second: `Burn or redeem ${small} through ${name}'s mint/redemption route and mint it again, or withdraw and redeposit that share of the stability pool.`,
    weekly: `Make one small stability-pool deposit or stable-asset mint through ${name} from the same budget.`, fees: 'mint or redemption fees extra; check collateral ratios',
  };
  if (c.includes('insurance')) return {
    ...common, mainActions: 1, secondActions: 1,
    main: `Buy one ${name} cover policy on ${chain} sized to $${capital} of exposure for at least 30 days. Read exclusions and buy only if the quoted premium fits a ${dollars(capital * 0.05)} premium budget.`,
    second: `Extend the ${name} policy at renewal or add ${small} of cover to the same insured exposure if supported. Keep the policy ID and avoid letting the cover lapse.`,
    weekly: `Make one small cover top-up or renewal on ${name} when supported; otherwise keep the existing policy active until renewal.`,
    secondTime: '10 minutes at the policy renewal date', fees: `quoted premium extra, capped at ${dollars(capital * 0.05)} for the initial policy`,
  };
  return {
    ...common,
    main: `Deposit $${capital} into ${name}'s main product on ${chain}. Use its default deposit asset, confirm withdrawal terms, and keep the resulting position open.`,
    second: `Withdraw ${small} from ${name}'s main product and redeposit those recovered funds once on ${chain}, leaving the remaining position open.`,
    weekly: `Make one small deposit to ${name}'s main product from the same capital budget.`,
  };
}

/** Seven steps, or eight for TVL >= $1B. Candidate interactions never promise eligibility. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const actions = actionsFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Set up one fresh wallet for ${p.name} on ${chain}; keep its seed offline, bookmark the protocol's own app, and send a small $5 test amount before funding the planned position. Review approvals before signing.`,
      cost: `$5 test capital, reused in the position, plus about ${dollars(gas)} gas (one action estimate)`,
      time: '10 minutes',
    },
    {
      text: actions.main,
      cost: `$${capital} capital budget plus about ${dollars(gas * actions.mainActions)} gas (${actions.mainActions} action estimates); ${actions.fees}`,
      time: '20 minutes to set up; follow the product settlement window',
    },
    {
      text: actions.second,
      cost: `reuse the original capital plus about ${dollars(gas * actions.secondActions)} gas (${actions.secondActions} action estimates); ${actions.fees}`,
      time: actions.secondTime,
    },
    {
      text: `Once a week, complete one candidate qualifying action: ${actions.weekly} Verify the protocol's published eligibility rules rather than assuming each transaction earns rewards.`,
      cost: `about ${dollars(gas)} gas per action on ${chain}; multi-action routes and product fees cost extra`,
      time: '10 minutes each week',
    },
    {
      text: `Keep the ${p.name} position for at least ${hold} days and across at least two monthly snapshots. Extend the hold beyond that minimum until both snapshots pass; maintain margin, collateral or cover where needed.`,
      cost: `$${capital} capital remains committed; interest, funding or policy premiums may continue`,
      time: `${hold} days minimum; allow 30-60+ days for two monthly snapshots`,
    },
    {
      text: `Check only ${p.name}'s own points or rewards pages for eligibility and announced dates. Never pay to claim rewards; beware phishing clones, unsolicited claim links and requests for your seed.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a ${p.name} farm log with the wallet address, chain, dates, transaction hashes, positions, gas and product costs. Record each monthly snapshot and the withdrawal route before unwinding.`,
      cost: '$0 for a local log',
      time: '5 minutes to start, 2 minutes after each action',
    },
  ];
  if (p.tvl_usd >= 1_000_000_000) steps.push({
    text: `Participate in ${p.name}'s own community forum: read one proposal and contribute a substantive comment. Where it has governance and your wallet is eligible, cast one vote using that same wallet.`,
    cost: `$0 for forum or offchain voting; about ${dollars(gas)} gas for an onchain vote if available`,
    time: '20 minutes monthly',
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The launch probability is a stated age/growth heuristic, not a forecast calibrated to outcomes. */
export function launchProbability(age: number | null, growth: number | null): number {
  const days = age ?? MODEL.unknown_age_days;
  const pct = growth ?? 0;
  let probability = 0.25;
  if (days >= 730) probability += 0.25;
  else if (days >= 365) probability += 0.15;
  if (pct >= 20) probability += 0.15;
  else if (pct >= 0) probability += 0.05;
  if (pct <= -20) probability -= 0.15;
  return round4(Math.min(0.9, Math.max(0.05, probability)));
}

/** The dashboard keeps unrounded multipliers so its breakdown describes the board's exact score. */
export function radarRow(row: BoardRow, snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): RadarRow {
  const category = calibration.categories.get(row.category)!;
  const score = impliedValue(row, snapshot.as_of, category.multiple, model);
  const probability = launchProbability(row.age_days, row.change_7d);
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    gecko_id: row.gecko_id,
    symbol: row.symbol,
    token_status: row.token_status,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: category.multiple,
    category_peers: category.peers,
    growth_multiplier: score.growthMult,
    maturity_multiplier: score.maturityMult,
    launch_probability: probability,
    expected_airdrop_usd: Math.round(row.implied_value_usd * COMMUNITY_ALLOCATION * probability),
    farm_steps: row.farm_steps,
    watchlist: snapshot.watchlist.includes(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = categoryMultiples(snapshot);
  const board = buildBoard(snapshot, model, calibration);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.tvl_usd < snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: calibration.global_multiple,
    global_peers: calibration.global_peers,
    peer_min_tvl_usd: PEER_MIN_TVL,
    category_min_peers: CATEGORY_MIN_PEERS,
    community_allocation: COMMUNITY_ALLOCATION,
    protocol_count: snapshot.protocols.length,
    watchlist: snapshot.watchlist,
    watchlist_covered: board.filter((r) => snapshot.watchlist.includes(r.slug)).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => radarRow(row, snapshot, calibration, model)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

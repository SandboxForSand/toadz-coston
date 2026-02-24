# Toadz Coston2 Dev Handoff

Last updated: 2026-02-24

## 1) Environment
- Frontend: Vite app in `/Users/dantian/toadz-coston/site`
- Contracts: Hardhat project in `/Users/dantian/toadz-coston/contracts`
- Network in active use: **Coston2** (`chainId 114`, `0x72`)
- RPC: `https://coston2-api.flare.network/ext/C/rpc`
- Live test site: `https://sandboxforsand.github.io/toadz-coston/`

## 2) Current Coston2 Contract Addresses
- `WFLR`: `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`
- `POND` (proxy): `0x410c65DAb32709046B1BA63caBEB4d2824D9E902`
- `Buffer` (proxy): `0xB5cF60df70BDD3E343f7A4be2053140b26273427`
- `BoostRegistry` (proxy): `0x958aEEC535974465109f8f3411fA576249bd06ef`
- `ToadzStake` (proxy): `0xd973E756fCcB640108aAf17B3465a387802A6E49`
- `ToadzMarket` (proxy): `0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F`
- `ZapDeposit`: `0xBeA2995513DCc193C39241E6Cd55AF53172a711E`

Reference file: `/Users/dantian/toadz-coston/site/src/contracts.js`

## 3) Core Mechanics (Current)
- Native token is `C2FLR` (gas token), but staking system runs on `WFLR` (ERC20).
- New stake (no active position): routed via `ZapDeposit.zapDeposit(...)` for one transaction.
- Existing staker deposits: `addToStake(...)`.
- POND requirement logic derives from stake amount using `getPondRequired(...)`.
- Restake requires lock expiry and does:
  - reward update
  - 10% POND buyback flow (via Buffer WFLR)
  - burns buyback POND
  - compounds into stake
  - resets lock based on selected tier

### PGS behavior
- PGS enters ToadzStake via `receivePGS(...)` from POND buy flow.
- Rewards are distributed by `rewardIndex`.
- Current source now auto-compounds pending rewards into principal (`wflrStaked`) in `_updateRewards(...)`.
- Lock terms are preserved during reward compounding:
  - lock expiry unchanged
  - lock multiplier unchanged

Contract file: `/Users/dantian/toadz-coston/contracts/ToadzStakeV5.sol`

## 3.1) Security Patch Set (Source Updated, Upgrade Pending)
- `POND.burn` / `burnForMint` now prevent non-stake callers from burning staked POND and require exact staked accounting for stake-origin burns.
- `ToadzStake.addToStake` now enforces per-user `maxDeposit` across cumulative deposits (`totalDeposited + add <= maxDeposit`).
- `ToadzStake.emergencyWithdraw` now requires no active stake accounting (`totalWflrStaked`, `totalWeightedShares`, `totalEffectiveShares` must be zero).
- `ToadzStake.emergencyPushPosition` now:
  - reconciles global totals against old position
  - sets `rewardDebt = (effective * rewardIndex) / PRECISION` instead of zero.

## 4) Frontend Behavior Highlights
- RPC pressure reduction:
  - shifted heavy reads to dedicated JSON RPC provider instead of wallet provider
  - guarded overlapping reads
  - reduced polling frequency
- Inflow history:
  - reads on-chain events (`eth_getLogs`) from ToadzStake + Buffer
  - bounded fast recent-window scan for responsiveness
  - no persistent "syncing" text
  - row labels simplified to category pill only (`PGS`, `FTSO`, `POND burn`)
- Restake protections:
  - precheck lock expiry before submit
  - precheck buffer liquidity for buyback path
- Preflight simulation added before key writes:
  - zap deposit
  - deposit/addToStake
  - withdraw/exit
- Test helper exists in stake UI:
  - `Wrap + Fund Buffer` button (wraps C2FLR, transfers WFLR to Buffer)

Main frontend file: `/Users/dantian/toadz-coston/site/src/App.jsx`

## 5) Recent Key Commits
- `25e556e5` Align stake source with live auto-compounding logic and principal UI
- `ad20a468` Remove buffer health metric UI and related reads
- `0545a489` Add transaction preflight checks and protocol buffer health metric (later removed UI part)
- `2b9bba10` Speed up inflow event sync and remove persistent syncing label
- `f5dbe931` Precheck restake buyback buffer liquidity
- `3aea0bd8` Fix restake expiry checks and reduce MetaMask RPC pressure
- `82b6f444` Enable one-transaction zap staking on Coston2

## 6) Known Operational Realities
- Restake failures with `Insufficient balance` are usually **Buffer WFLR liquidity**, not user wallet issue.
- Inflow panel is protocol event-derived, not strictly per-user attribution.
- Coston2 RPC can still intermittently rate limit under bursty usage.

## 7) Pending / Recommended Next Tasks
- Decide if test helper `Wrap + Fund Buffer` stays visible or should be admin-only/hidden.
- Add/expand contract tests for:
  - auto-compounding invariants
  - lock expiry invariants
  - referral + compounding interactions
  - restake buyback edge cases
- Add E2E smoke script for staking flows on Coston2 testnet.
- If mainnet prep starts:
  - storage layout checks on upgrades
  - ProxyAdmin ownership/multisig verification
  - deployment/rollback runbook and monitoring alerts

## 8) Useful Commands
- Compile contracts:
  - `npx hardhat compile`
- Build frontend:
  - `npm run build --prefix site`
- Deploy zap (Coston2):
  - `npx hardhat run scripts/deploy-zap-coston2.js --network coston2`
- Upgrade stake proxy (Coston2):
  - `npx hardhat run scripts/upgrade-stake-coston2.js --network coston2`
- Upgrade POND proxy (Coston2):
  - `npx hardhat run scripts/upgrade-pond-coston2.js --network coston2`
- Upgrade stake + POND together (Coston2):
  - `npx hardhat run scripts/upgrade-core-coston2.js --network coston2`
- Pre-upgrade consistency check (Coston2):
  - `npx hardhat run scripts/check-pond-stake-consistency-coston2.js --network coston2` (default scans recent window)
  - `FROM_BLOCK=1 npx hardhat run scripts/check-pond-stake-consistency-coston2.js --network coston2` (full-history; slower on Coston2 RPC)
  - `CHECK_USERS=0xUser1,0xUser2 npx hardhat run scripts/check-pond-stake-consistency-coston2.js --network coston2` (targeted check)

## 9) Important Files
- Frontend app:
  - `/Users/dantian/toadz-coston/site/src/App.jsx`
- Frontend addresses/ABIs:
  - `/Users/dantian/toadz-coston/site/src/contracts.js`
- Stake contract:
  - `/Users/dantian/toadz-coston/contracts/ToadzStakeV5.sol`
- Zap deploy script:
  - `/Users/dantian/toadz-coston/scripts/deploy-zap-coston2.js`
- Stake upgrade script:
  - `/Users/dantian/toadz-coston/scripts/upgrade-stake-coston2.js`
- POND upgrade script:
  - `/Users/dantian/toadz-coston/scripts/upgrade-pond-coston2.js`
- Combined core upgrade script:
  - `/Users/dantian/toadz-coston/scripts/upgrade-core-coston2.js`
- POND/Stake consistency checker:
  - `/Users/dantian/toadz-coston/scripts/check-pond-stake-consistency-coston2.js`

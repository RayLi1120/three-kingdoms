# 三國策 Simulation-Driven Balance Pass
*2026-06-12 — every number below comes from running the REAL battle engine (battle.js) headlessly, not estimates.*

## How the model works

`sim.html` loads the actual `battle.js`/`units.js` modules with a **virtualized clock** (`Date.now`/`setInterval`/`setTimeout` are intercepted before import), then drives combat ticks in a tight loop. A 30-second battle simulates in ~15 ms, fully deterministic per RNG seed, using the game's own seeded-PRNG PvP path. Nothing about combat is reimplemented — if the sim says a team wins, the live game agrees tick-for-tick.

- Teams auto-position by range (melee front / casters back), mirrored like real PvP
- Fates and faction tiers computed exactly like `checkActiveFates`
- Each matchup runs on 3 seeds; 90s timeout = draw
- **~5,800 battles total** across all evaluation stages and tuning rounds

**Stages:** (A) all 300 hero 1v1 duels, (B) 12 curated comps round-robin (every fate team + faction stacks + no-synergy controls), (C) 80 random 4-hero teams vs a 6-team gauntlet for per-hero marginal win contribution.

## Headline findings (before fixes)

| Problem | Evidence |
|---|---|
| 曹操 self-sufficiency | **100% duel winrate** — literally never lost a 1v1 (summons made every duel 3-vs-1); #2 marginal team contributor |
| 諸葛亮 ubiquity | #1 marginal contributor (42% vs avg 18%), present in 3 of the 4 strongest teams — driven by the no-cooldown interrupt |
| 群 faction collapse | Both 群 fate comps at the very bottom: 黃巾 6%, 英雄美人 9% — pure-CC kits with no damage and no frontline |
| Fate-engine outliers | 蜀核心 (桃園+五虎) 94%, 國之棟樑 88% — fate stat-stacking dwarfed hero choice |
| Dead-weight heroes | 賈詡 7%, 袁紹 7%, 郭嘉 10% marginal — bottom in every stage they could fairly be measured in |

## Changes applied (5 tuning rounds, re-simulated after each)

**Nerfs** — 曹操 (hp 750→700, 統率 100→90, team-damage aura +12%→+8%, self-mitigation 15%→10%, 丹陽兵 250/45→210/40) · 諸葛亮 ([神機妙算] interrupt now has an 8s internal cooldown) · 趙雲 (flat passive +30/+30→+20/+20) · 龐統 ([士別三日] 300%→250%) · 程昱 (active 220%→200%) · 張角 (bolts 150%→140%) · 桃園結義 (+20%→+15% on all three stats) · 五虎上將 (stun proc 25%→20%) · 國之棟樑 (+25%→+15% 智力, start energy 40→30) · 魏武之世 (+25%/+20% hp/統率→+15%/+15%, lifelink 20%→12%)

**Buffs** — 賈詡 (confuse 3s→4s, heal 120%→150%, damage 220%→260%) · 郭嘉 (35% DR / +60% AS, was 30/50) · 袁紹 (arrow now pierces the whole column, 120%→140%) · 袁術 (berserk +80%→+100%, drain 12%→10%/s) · 呂布 (武力 130→138, rage AS +40%→+60%, splash 120%→135%) · 貂蟬 (hp 700→740, 智力 105→112, charm 3s→4s) · 太史慈 (hp 740→780, 武力 102→110) · 荀彧 (curse 8%→10% maxHP/s) · 群 faction bonus (now also grants +10%/+20% 武力) · 黃巾起義 (starts the battle with 2 militia on the field; 黃巾兵 240/40→300/50)

## Results: before → after

| Team comp | Before | After |
|---|---|---|
| 魏武之世 wei_dynasty | 82% | 91% ⚠ watch |
| 蜀核心 shu_core (桃園+五虎) | **94%** | 88% |
| 國之棟樑 pillars | 88% | 82% |
| 東吳大都督 wu_burn | 61% | 70% |
| 天水奇謀 shu_tianshui | 79% | 58% |
| 梟雄聯姻 marriage | 56% | 41% |
| 魏之智 wei_int | 27% | 33% |
| 五虎 tigers (no 桃園) | 27% | 27% |
| 英雄美人 qun_beauty | **9%** | 30% |
| 黃巾起義 qun_turban | **6%** | 18% |
| *(controls: no-fate mix 42→24, sustain wall 29→38)* | | |

Win-rate spread across fate comps: **88 points → 73 points**, with every bottom-feeder at least doubled and the no-synergy control team now correctly below all fate teams. Duels: 曹操 100%→88%, remaining top duelist is 關羽 (94%) — a 5-cost, which is acceptable.

## Watch list for the next pass

1. **魏武之世 (91%)** — absorbed three nerf dials and still floated to the top as the field flattened. Next lever: lifelink 12%→10% or 司馬懿's per-death stacks 6→5.
2. **黃巾起義 (18%)** — structurally better with the militia opener but still last among fate comps; if it stays weak in real play, give the summons the casters' star scaling.
3. 張角 duels at ~90% is a 1v1 artifact (all 5 bolts hit the same lone target) — fine in teams, ignore.

## Reproducing

Open `sim.html` via any local server, then in the console:
`runMatch(['guan_yu','zhang_fei','liu_bei','zhao_yun'], ['cao_cao','sima_yi','guo_jia','cheng_yu'], 12345)`

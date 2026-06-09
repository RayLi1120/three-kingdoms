import { UNIT_TEMPLATES, getStatsForStar } from './units.js';

// Local references to game state and callbacks to avoid circular imports
let logCallback = null;
let endBattleCallback = null;
let currentRound = 1;


// ==========================================
// BATTLE ENGINE STATE
// ==========================================
let activeUnits = []; // Active participants in the current battle
let activeFates = []; // Active synergies/fates passed from game.js
let activeFactions = { shu: 0, wei: 0, wu: 0, qun: 0 };
let settings = { audio: true, speed: 1 };
let battleTimer = null;
let combatTickInterval = 150; // Logic runs every 150ms
let lastTime = 0;

// ==========================================
// WEB AUDIO SYNTHESIZER
// ==========================================
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export function playSound(type) {
    if (!settings.audio) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        
        const now = ctx.currentTime;
        
        switch (type) {
            case 'attack': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
                
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            }
            case 'hit': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.setValueAtTime(80, now + 0.05);
                
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            }
            case 'skill': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(850, now + 0.22);
                
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.28);
                break;
            }
            case 'heal': {
                const notes = [440, 554, 659];
                notes.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                    
                    gain.gain.setValueAtTime(0.06, now + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.06 + 0.15);
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.06);
                    osc.stop(now + idx * 0.06 + 0.15);
                });
                break;
            }
            case 'shield': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(550, now);
                osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
                
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.005, now + 0.18);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.18);
                break;
            }
            case 'victory': {
                const notes = [523.25, 659.25, 783.99, 1046.50];
                notes.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    const playTime = now + idx * 0.12;
                    osc.frequency.setValueAtTime(freq, playTime);
                    
                    gain.gain.setValueAtTime(0.1, playTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, playTime + 0.25);
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(playTime);
                    osc.stop(playTime + 0.25);
                });
                break;
            }
            case 'defeat': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.linearRampToValueAtTime(110, now + 0.50);
                
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.50);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.50);
                break;
            }
        }
    } catch (e) {
        console.error('Audio Synthesizer Error:', e);
    }
}

// Grid cell dimensions for floating numbers
const CELL_SIZE = 56;

// ==========================================
// WAVE GENERATOR
// ==========================================
function generateEnemyWave(round) {
    const wave = [];
    
    // Position helper: y=0, 1, 2, 3 are enemy zones
    if (round === 1) {
        // Simple wave: 3 Yellow Turban Grunts
        wave.push(createEnemy('yellow_turban_grunt', 2, 1));
        wave.push(createEnemy('yellow_turban_grunt', 4, 1));
        wave.push(createEnemy('yellow_turban_grunt', 5, 2));
    } else if (round === 2) {
        // Grunts + Archer
        wave.push(createEnemy('yellow_turban_grunt', 1, 1));
        wave.push(createEnemy('yellow_turban_grunt', 3, 2));
        wave.push(createEnemy('yellow_turban_grunt', 6, 1));
        wave.push(createEnemy('yellow_turban_archer', 4, 0));
    } else if (round === 3) {
        // Captain Wave!
        wave.push(createEnemy('yellow_turban_captain', 3, 1));
        wave.push(createEnemy('yellow_turban_grunt', 2, 2));
        wave.push(createEnemy('yellow_turban_grunt', 5, 2));
        wave.push(createEnemy('yellow_turban_archer', 1, 0));
        wave.push(createEnemy('yellow_turban_archer', 6, 0));
    } else if (round === 4) {
        // More grunts and archers
        wave.push(createEnemy('yellow_turban_captain', 2, 1));
        wave.push(createEnemy('yellow_turban_captain', 5, 1));
        wave.push(createEnemy('yellow_turban_grunt', 1, 2));
        wave.push(createEnemy('yellow_turban_grunt', 6, 2));
        wave.push(createEnemy('yellow_turban_archer', 3, 0));
        wave.push(createEnemy('yellow_turban_archer', 4, 0));
    } else if (round === 5) {
        // Big Boss Dong Zhuo
        wave.push(createEnemy('boss_dong_zhuo', 4, 1));
        wave.push(createEnemy('yellow_turban_captain', 2, 2));
        wave.push(createEnemy('yellow_turban_captain', 6, 2));
        wave.push(createEnemy('yellow_turban_archer', 1, 0));
        wave.push(createEnemy('yellow_turban_archer', 3, 0));
        wave.push(createEnemy('yellow_turban_archer', 5, 0));
    } else {
        // Infinite scaling rounds: procedurally generated
        const bossChance = Math.min((round - 5) * 0.15, 0.6);
        const hasBoss = Math.random() < bossChance;
        
        let budget = round * 3 + 2;
        
        if (hasBoss) {
            wave.push(createEnemy('boss_dong_zhuo', 3 + Math.floor(Math.random()*2), 1));
            budget -= 6;
        }
        
        // Spawn Captains
        while (budget >= 3 && wave.length < 5) {
            const rx = Math.floor(Math.random() * 8);
            const ry = Math.floor(Math.random() * 2) + 1;
            if (!wave.some(e => e.x === rx && e.y === ry)) {
                wave.push(createEnemy('yellow_turban_captain', rx, ry));
                budget -= 3;
            }
        }
        
        // Spawn Archers
        while (budget >= 2 && wave.length < 7) {
            const rx = Math.floor(Math.random() * 8);
            const ry = 0;
            if (!wave.some(e => e.x === rx && e.y === ry)) {
                wave.push(createEnemy('yellow_turban_archer', rx, ry));
                budget -= 2;
            }
        }
        
        // Spawn Grunts
        while (budget >= 1 && wave.length < 8) {
            const rx = Math.floor(Math.random() * 8);
            const ry = Math.floor(Math.random() * 2) + 2;
            if (!wave.some(e => e.x === rx && e.y === ry)) {
                wave.push(createEnemy('yellow_turban_grunt', rx, ry));
                budget -= 1;
            }
        }
    }
    
    return wave;
}

// Local helper wrappers to delegate logging and end battle triggers to game controller
function addLog(message, type) {
    if (logCallback) logCallback(message, type);
}

function endBattle(victory) {
    if (endBattleCallback) endBattleCallback(victory);
}

function createEnemy(templateId, x, y) {
    const template = UNIT_TEMPLATES[templateId];
    // scale boss and captains slightly based on round logic
    const scaleFactor = currentRound > 5 ? 1 + (currentRound - 5) * 0.08 : 1.0;
    const stats = getStatsForStar(template, 1);
    
    return {
        id: `enemy_${templateId}_${Math.random().toString(36).substr(2, 5)}`,
        templateId,
        name: template.name,
        star: 1,
        skillLevel: 1,
        x,
        y,
        team: 'enemy',
        hp: Math.round(stats.hpMax * scaleFactor),
        hpMax: Math.round(stats.hpMax * scaleFactor),
        shield: 0,
        energy: 0,
        stats: {
            hpMax: Math.round(stats.hpMax * scaleFactor),
            wuli: Math.round(stats.wuli * scaleFactor),
            zhili: Math.round(stats.zhili * scaleFactor),
            tongshuai: Math.round(stats.tongshuai * scaleFactor),
            atkSpeed: stats.atkSpeed,
            range: stats.range
        },
        isBuilding: template.isBuilding,
        color: template.color || '#ff4757',
        avatarText: template.avatarText,
        isDead: false,
        lastAttackTime: 0,
        tauntTarget: null, // Lock target on taunt
        statusEffects: [] // Active statuses: { type, val, expiry }
    };
}

// ==========================================
// BATTLE INITIALIZATION
// ==========================================
export function initBattle(playerDeployedUnits, round, endCallback, logCallbackFn, playerActiveFates, playerActiveFactions, gameSettings) {
    currentRound = round;
    endBattleCallback = endCallback;
    logCallback = logCallbackFn;
    activeUnits = [];
    activeFates = playerActiveFates || [];
    activeFactions = playerActiveFactions || { shu: 0, wei: 0, wu: 0, qun: 0 };
    settings = gameSettings || { audio: true, speed: 1 };
    
    combatTickInterval = Math.round(150 / settings.speed);
    
    // 1. Setup copies of player units to avoid mutating board coordinates permanent
    playerDeployedUnits.forEach((u, index) => {
        const template = UNIT_TEMPLATES[u.templateId];
        const stats = getStatsForStar(template, u.star);
        
        // Apply Faction Synergies!
        if (template.faction === 'shu' && activeFactions.shu > 0) {
            const mult = activeFactions.shu === 2 ? 1.30 : 1.15;
            stats.hpMax = Math.round(stats.hpMax * mult);
        }
        if (template.faction === 'wei' && activeFactions.wei > 0) {
            const mult = activeFactions.wei === 2 ? 1.30 : 1.15;
            stats.zhili = Math.round(stats.zhili * mult);
        }
        if (template.faction === 'wu' && activeFactions.wu > 0) {
            const mult = activeFactions.wu === 2 ? 1.30 : 1.15;
            stats.atkSpeed = stats.atkSpeed * mult;
        }
        if (template.faction === 'qun' && activeFactions.qun > 0) {
            const mult = activeFactions.qun === 2 ? 1.30 : 1.15;
            stats.tongshuai = Math.round(stats.tongshuai * mult);
        }
        
        // Apply Zhao Yun secondary passive [一身是膽] stats buff
        if (u.templateId === 'zhao_yun') {
            stats.wuli += 30;
            stats.tongshuai += 30;
        }

        // Apply Fate synergy stat multipliers!
        if (activeFates.includes('peach_garden') && ['liu_bei', 'guan_yu', 'zhang_fei'].includes(u.templateId)) {
            stats.hpMax = Math.round(stats.hpMax * 1.20);
            stats.wuli = Math.round(stats.wuli * 1.20);
            stats.tongshuai = Math.round(stats.tongshuai * 1.20);
        }
        if (activeFates.includes('wei_intellects') && ['cao_cao', 'guo_jia', 'xun_yu'].includes(u.templateId)) {
            stats.zhili = Math.round(stats.zhili * 1.20);
        }
        if (activeFates.includes('wu_commander') && ['sun_quan', 'zhou_yu', 'lu_xun'].includes(u.templateId)) {
            stats.atkSpeed = stats.atkSpeed * 1.20;
        }
        if (activeFates.includes('yellow_turban') && ['zhang_jiao', 'yuan_shao', 'yuan_shu'].includes(u.templateId)) {
            stats.hpMax = Math.round(stats.hpMax * 1.20);
        }
        if (activeFates.includes('hero_beauty')) {
            if (u.templateId === 'lu_bu') {
                stats.wuli = Math.round(stats.wuli * 1.25);
            } else if (u.templateId === 'diao_chan') {
                stats.hpMax = Math.round(stats.hpMax * 1.25);
            }
        }
        
        activeUnits.push({
            id: `player_${u.templateId}_${index}`,
            templateId: u.templateId,
            name: template.name,
            star: u.star,
            skillLevel: u.skillLevel,
            x: u.x,
            y: u.y,
            team: 'player',
            hp: u.isBuilding ? Math.min(u.hp, stats.hpMax) : stats.hpMax,
            hpMax: stats.hpMax,
            shield: 0,
            energy: 0,
            stats,
            isBuilding: u.isBuilding,
            color: template.color,
            avatarText: template.avatarText,
            isDead: false,
            lastAttackTime: 0,
            tauntTarget: null,
            statusEffects: [],
            boardReference: u // Keep reference to update building HP later
        });
    });
    
    // Apply Zhao Yun一身是膽 CC Immunity and stat buff (has already been added to stats in loop, now apply immunity)
    activeUnits.forEach(unit => {
        if (unit.team === 'player' && unit.templateId === 'zhao_yun') {
            applyStatusEffect(unit, 'insight', 0, 9999999);
        }
    });

    // Apply Guo Jia [十勝遺計] start-of-combat buff to highest Wuli ally
    const guoJia = activeUnits.find(u => u.team === 'player' && u.templateId === 'guo_jia');
    if (guoJia) {
        let targetAlly = null;
        let maxWuli = -1;
        activeUnits.forEach(other => {
            if (other.team === 'player' && other.stats.wuli > maxWuli) {
                maxWuli = other.stats.wuli;
                targetAlly = other;
            }
        });
        if (targetAlly) {
            applyStatusEffect(targetAlly, 'insight', 0, 6000);
            applyStatusEffect(targetAlly, 'lifesteal', 30, 6000);
            createFloatingNumber(targetAlly, '十勝遺計', 'shield');
            addLog(`🛡️ 郭嘉的 [十勝遺計] 赋予 ${targetAlly.name} 免疫控制與 30% 倒戈（吸血）效果，持續 6 秒！`, 'skill');
        }
    }

    // Apply Diao Chan [傾國傾城] start-of-combat target selection
    const diaoChan = activeUnits.find(u => u.team === 'player' && u.templateId === 'diao_chan');
    if (diaoChan) {
        const enemies = activeUnits.filter(u => u.team !== 'player');
        // Choose 2 random enemies
        const limit = Math.min(enemies.length, 2);
        for (let i = 0; i < limit; i++) {
            const idx = Math.floor(Math.random() * enemies.length);
            const enemy = enemies.splice(idx, 1)[0];
            enemy.qingGuoTarget = true;
            addLog(`🌸 貂蟬對 ${enemy.name} 施展 [傾國傾城]！`, 'skill');
        }
    }

    // Apply Yuan Shao [鋒矢陣] formation placement buffs
    const yuanShao = activeUnits.find(u => u.team === 'player' && u.templateId === 'yuan_shao');
    if (yuanShao) {
        activeUnits.forEach(unit => {
            if (unit.team === 'player') {
                if (unit.y <= 7 && (unit.x === 3 || unit.x === 4)) {
                    applyStatusEffect(unit, 'formation_fengshi_front', 0, 9999999);
                    addLog(`📐 袁紹的 [鋒矢陣] 將 ${unit.name} 置于前排中路（獲得攻速加成，但受到的傷害增加 15%）。`, 'skill');
                } else if (unit.y >= 8) {
                    applyStatusEffect(unit, 'formation_fengshi_back', 0, 9999999);
                }
            }
        });
    }

    // 1.5 Apply Peach Garden shield at start of combat
    if (activeFates.includes('peach_garden')) {
        activeUnits.forEach(unit => {
            if (unit.team === 'player' && ['liu_bei', 'guan_yu', 'zhang_fei'].includes(unit.templateId)) {
                const shieldAmt = Math.round(unit.hpMax * 0.15);
                unit.shield = shieldAmt;
                unit.statusEffects.push({ type: 'shield_dur', val: shieldAmt, expiry: Date.now() + 999999 });
            }
        });
    }
    
    // 2. Generate enemy wave
    const wave = generateEnemyWave(round);
    activeUnits.push(...wave);
    
    // Render starting battlefield units
    renderBattlefield();
}

export function startBattle() {
    lastTime = Date.now();
    battleTimer = setInterval(combatTick, combatTickInterval);
}

// ==========================================
// MAIN COMBAT TICK LOOP
// ==========================================
function combatTick() {
    const now = Date.now();
    
    // 1. Tick status effects
    activeUnits.forEach(u => {
        if (u.isDead) return;
        u.statusEffects = u.statusEffects.filter(eff => {
            if (now >= eff.expiry) {
                // Remove effect
                if (eff.type === 'taunt') u.tauntTarget = null;
                if (eff.type === 'stat_steal_buff') {
                    u.stats.wuli = Math.max(1, u.stats.wuli - eff.wuliSteal);
                    u.stats.zhili = Math.max(1, u.stats.zhili - eff.zhiliSteal);
                    u.stats.tongshuai = Math.max(1, u.stats.tongshuai - eff.tongshuaiSteal);
                }
                if (eff.type === 'stat_steal_debuff') {
                    u.stats.wuli += eff.wuliSteal;
                    u.stats.zhili += eff.zhiliSteal;
                    u.stats.tongshuai += eff.tongshuaiSteal;
                }
                return false;
            }
            return true;
        });
        
        // Burn Damage over time Tick
        const burnEffect = u.statusEffects.find(e => e.type === 'burn');
        if (burnEffect && Math.random() < 0.3) {
            takeDamage(u, burnEffect.val, 'burn');
        }

        // Poison DoT Tick
        const poisonEffect = u.statusEffects.find(e => e.type === 'poison');
        if (poisonEffect && Math.random() < 0.3) {
            takeDamage(u, poisonEffect.val, 'poison');
        }

        // Bleed DoT Tick
        const bleedEffect = u.statusEffects.find(e => e.type === 'bleed');
        if (bleedEffect && Math.random() < 0.3) {
            takeDamage(u, bleedEffect.val, 'bleed');
        }

        // Sima Yi Passive Ramp DoT [用武通神]
        if (u.templateId === 'sima_yi') {
            if (!u.lastYongWuTime) {
                u.lastYongWuTime = now;
                u.yongWuCount = 0;
            }
            if (now - u.lastYongWuTime >= 4000) {
                u.lastYongWuTime = now;
                u.yongWuCount = Math.min(u.yongWuCount + 1, 4);
                const multipliers = [1.0, 1.5, 2.0, 2.5];
                const mult = multipliers[u.yongWuCount - 1] || 2.5;
                
                const enemies = activeUnits.filter(other => !other.isDead && other.team !== u.team);
                if (enemies.length > 0) {
                    createFloatingNumber(u, '用武通神', 'skill');
                    addLog(`🦅 司马懿触發 [用武通神]（第 ${u.yongWuCount} 阶段）！`, 'skill');
                    const limit = Math.min(enemies.length, 2);
                    for (let i = 0; i < limit; i++) {
                        const idx = Math.floor(Math.random() * enemies.length);
                        const enemy = enemies.splice(idx, 1)[0];
                        const dmg = Math.round(u.stats.zhili * mult * (1 + (u.skillLevel - 1) * 0.25));
                        takeDamage(enemy, dmg, 'skill', u, false);
                        createFloatingNumber(enemy, '用武通神', 'dmg');
                    }
                }
            }
        }

        // Diao Chan Passive [傾國傾城] confusion trigger
        if (u.qingGuoTarget && !u.isDead) {
            if (!u.lastQingGuoCheckTime) {
                u.lastQingGuoCheckTime = now;
            }
            if (now - u.lastQingGuoCheckTime >= 4000) {
                u.lastQingGuoCheckTime = now;
                if (Math.random() < 0.30) {
                    applyStatusEffect(u, 'confusion', 0, 2000);
                    createFloatingNumber(u, '混亂', 'shield');
                    addLog(`🌸 ${u.name} 受到 [傾國傾城] 的混亂效果影響，可能會攻擊友軍！`, 'skill');
                }
            }
        }

        // Liu Bei Passive [攜手禦敵] continuous heal & disarm
        if (u.templateId === 'liu_bei') {
            if (!u.lastXieShouTime) {
                u.lastXieShouTime = now;
            }
            if (now - u.lastXieShouTime >= 3000) {
                u.lastXieShouTime = now;
                // Heal lowest HP ally
                let lowestAlly = null;
                let minHpRatio = 1.1;
                activeUnits.forEach(other => {
                    if (other.isDead || other.team !== u.team) return;
                    const ratio = other.hp / other.hpMax;
                    if (ratio < minHpRatio) {
                        minHpRatio = ratio;
                        lowestAlly = other;
                    }
                });
                if (lowestAlly) {
                    const healAmt = Math.round(u.stats.zhili * 0.8 * (1 + (u.skillLevel - 1) * 0.25));
                    healUnit(lowestAlly, healAmt);
                    createFloatingNumber(lowestAlly, '攜手禦敵', 'heal');
                }
                // Disarm 15%
                if (Math.random() < 0.15) {
                    const enemies = activeUnits.filter(other => !other.isDead && other.team !== u.team);
                    if (enemies.length > 0) {
                        const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        applyStatusEffect(randEnemy, 'disarm', 0, 2000);
                        createFloatingNumber(randEnemy, '繳械', 'shield');
                        addLog(`🤝 刘備的 [攜手禦敵] 使 ${randEnemy.name} 繳械 2 秒！`, 'skill');
                    }
                }
            }
        }

        // Xun Yu Curse DoT Tick
        const curseEffect = u.statusEffects.find(e => e.type === 'xun_yu_curse');
        if (curseEffect) {
            if (!curseEffect.lastTick || now - curseEffect.lastTick >= 1000) {
                curseEffect.lastTick = now;
                const skillLvlMult = curseEffect.level || 1;
                const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                const dmgAmt = Math.round(u.hpMax * 0.08 * multiplier);
                
                addLog(`💀 荀彧的驱虎吞狼诅咒對 ${u.name} 造成了 ${dmgAmt} 點傷害！`, 'damage');
                takeDamage(u, dmgAmt, 'skill');
                
                // Splash 50% damage to adjacent enemies
                activeUnits.forEach(other => {
                    if (other.isDead || other.team === u.team || other === u) return;
                    if (getDistance(u, other) <= 1) {
                        takeDamage(other, Math.round(dmgAmt * 0.5), 'skill');
                    }
                });
            }
        }

        // Yuan Shu HP Drain Tick
        const ysBuffEffect = u.statusEffects.find(e => e.type === 'yuan_shu_buff');
        if (ysBuffEffect) {
            if (!ysBuffEffect.lastTick || now - ysBuffEffect.lastTick >= 1000) {
                ysBuffEffect.lastTick = now;
                const drainAmt = Math.round(u.hp * 0.15);
                if (drainAmt > 0) {
                    addLog(`🩸 袁術的反噬效果對自己造成了 ${drainAmt} 點自損傷害！`, 'damage');
                    takeDamage(u, drainAmt, 'skill');
                }
            }
        }
    });
    
    // 2. Clean dead units
    activeUnits.forEach(u => {
        if (!u.isDead && u.hp <= 0) {
            u.isDead = true;
            u.hp = 0;
            addLog(`${u.name} 已被擊敗！`, u.team === 'player' ? 'damage' : 'victory');
            
            // If it is a player building, update the reference in game.js so it gets removed from the board!
            if (u.team === 'player' && u.boardReference) {
                u.boardReference.isDead = true;
            }
            
            // Sima Yi passive stats stack
            activeUnits.forEach(other => {
                if (!other.isDead && other.templateId === 'sima_yi') {
                    if (!other.simaYiDeathsCount) other.simaYiDeathsCount = 0;
                    if (other.simaYiDeathsCount < 8) {
                        other.simaYiDeathsCount++;
                        other.stats.wuli = Math.round(other.stats.wuli * 1.10);
                        other.stats.zhili = Math.round(other.stats.zhili * 1.10);
                        other.stats.tongshuai = Math.round(other.stats.tongshuai * 1.10);
                        
                        const hpBonus = Math.round(other.hpMax * 0.10);
                        other.hpMax += hpBonus;
                        other.hp += hpBonus;
                        
                        createFloatingNumber(other, '吸魂', 'heal');
                        addLog(`🦅 司马懿吸取敗將之魂！疊加層數: ${other.simaYiDeathsCount}/8（全屬性增加 10%）`, 'skill');
                    }
                }
            });
            
            // Remove DOM elements immediately
            const dom = document.getElementById(u.id);
            if (dom) dom.remove();
        }
    });
    
    // Check game over conditions
    const alivePlayer = activeUnits.some(u => u.team === 'player' && !u.isDead);
    const aliveEnemy = activeUnits.some(u => u.team === 'enemy' && !u.isDead);
    
    if (!alivePlayer || !aliveEnemy) {
        clearInterval(battleTimer);
        battleTimer = null;
        const victory = alivePlayer;
        playSound(victory ? 'victory' : 'defeat');
        setTimeout(() => {
            // Remove all leftover temporary battle assets
            document.querySelectorAll('.floating-number').forEach(f => f.remove());
            document.querySelectorAll('.grid-unit').forEach(u => u.remove());
            
            // Hand control back to game manager
            endBattle(victory);
        }, 1500);
        return;
    }
    
    // 3. Process each unit's combat logic
    activeUnits.forEach(u => {
        if (u.isDead) return;
        
        // Stun Check: stunned units skip actions
        const isStunned = u.statusEffects.some(eff => eff.type === 'stun');
        if (isStunned) {
            if (Math.random() < 0.15) {
                createFloatingNumber(u, '震懾', 'shield');
            }
            return;
        }
        
        // Target locking: Confusion and Taunt overrides
        let target = null;
        const isConfused = u.statusEffects.some(eff => eff.type === 'confusion');
        if (isConfused) {
            target = findClosestTargetAnyTeam(u);
        } else if (u.tauntTarget && !u.tauntTarget.isDead) {
            target = u.tauntTarget;
        } else {
            target = findClosestEnemy(u);
        }
        
        if (!target) return; // No targets (shouldn't happen because of checks above)
        
        const dist = getDistance(u, target);
        
        // Check range
        if (dist <= u.stats.range) {
            // Attack!
            let effectiveAtkSpeed = u.stats.atkSpeed;
            if (u.statusEffects.some(e => e.type === 'guo_jia_buff')) effectiveAtkSpeed *= 1.50;
            if (u.statusEffects.some(e => e.type === 'sun_quan_buff')) effectiveAtkSpeed *= 1.30;
            if (u.statusEffects.some(e => e.type === 'lu_bu_rage')) effectiveAtkSpeed *= 2.00;
            
            if (effectiveAtkSpeed > 0 && now - u.lastAttackTime >= (1000 / effectiveAtkSpeed)) {
                performAttack(u, target, now);
                
                // Double Attack (連擊) trigger
                if (u.statusEffects.some(e => e.type === 'double_attack')) {
                    setTimeout(() => {
                        if (!u.isDead && target && !target.isDead) {
                            performAttack(u, target, now);
                        }
                    }, 100);
                }
            }
        } else {
            // Move! (Buildings cannot move)
            if (!u.isBuilding) {
                moveTowards(u, target);
            }
        }
        
        // Skill execution at 100 energy
        if (u.energy >= 100) {
            castSkill(u);
        }
    });
    
    // 4. Redraw health, shield, and energy values on UI
    updateGridVisuals();
}

// ==========================================
// TARGETING & PATHFINDING
// ==========================================
function findClosestEnemy(unit) {
    let closest = null;
    let minDist = Infinity;
    
    const isCharmed = unit.statusEffects.some(e => e.type === 'charm');
    const targetTeam = isCharmed ? unit.team : (unit.team === 'player' ? 'enemy' : 'player');
    
    activeUnits.forEach(other => {
        if (other.isDead || other.team !== targetTeam || other === unit) return;
        const dist = getDistance(unit, other);
        if (dist < minDist) {
            minDist = dist;
            closest = other;
        }
    });
    
    return closest;
}

function findClosestTargetAnyTeam(unit) {
    let closest = null;
    let minDist = Infinity;
    activeUnits.forEach(other => {
        if (other.isDead || other === unit) return;
        const dist = getDistance(unit, other);
        if (dist < minDist) {
            minDist = dist;
            closest = other;
        }
    });
    return closest;
}

// Chebyshev distance representing 8-directional board cells
function getDistance(u1, u2) {
    return Math.max(Math.abs(u1.x - u2.x), Math.abs(u1.y - u2.y));
}

// Move 1 step towards target cell, prioritizing cells closest in Euclidean distance and avoiding obstacles
function moveTowards(unit, target) {
    const currentDistSq = Math.pow(unit.x - target.x, 2) + Math.pow(unit.y - target.y, 2);
    const moves = [];
    
    // Check all 8 adjacent directions
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = unit.x + dx;
            const ny = unit.y + dy;
            
            // Boundary and terrain check (cannot walk into river water)
            if (isCellWalkable(nx, ny) && !isCellOccupied(nx, ny)) {
                // Calculate Euclidean distance squared from candidate cell to target
                const distSq = Math.pow(nx - target.x, 2) + Math.pow(ny - target.y, 2);
                moves.push({ x: nx, y: ny, distSq });
            }
        }
    }
    
    if (moves.length === 0) return; // Fully blocked, stand still
    
    // Sort moves by distance to target ascending
    moves.sort((a, b) => a.distSq - b.distSq);
    
    // Move to the cell that is closest to the enemy
    const bestMove = moves[0];
    
    // Only move if it is a progress-making step or lateral slide (don't walk backwards away from enemy)
    if (bestMove.distSq <= currentDistSq + 1) {
        unit.x = bestMove.x;
        unit.y = bestMove.y;
    }
}

function isCellOccupied(x, y) {
    return activeUnits.some(u => !u.isDead && u.x === x && u.y === y);
}

// Restricts movement through water, units must cross river (rows index 4 and 5) via bridge (col index 3 and 4)
function isCellWalkable(x, y) {
    if (x < 0 || x >= 8 || y < 0 || y >= 10) return false;
    // River rows are 4 and 5. Only columns 3 and 4 are the wooden bridge
    if (y === 4 || y === 5) {
        return x === 3 || x === 4;
    }
    return true;
}

// ==========================================
// COMBAT ENGAGEMENTS (Attack, Damage, Heal)
// ==========================================
function performAttack(attacker, target, now) {
    const isStunned = attacker.statusEffects.some(eff => eff.type === 'stun');
    const isDisarmed = attacker.statusEffects.some(eff => eff.type === 'disarm');
    if (isStunned || isDisarmed) return;

    attacker.lastAttackTime = now;
    
    playSound('attack');
    
    // Trigger visual swing swing effect animation class
    const dom = document.getElementById(attacker.id);
    if (dom) {
        const directionClass = target.x >= attacker.x ? 'attacking-right' : 'attacking-left';
        dom.classList.add(directionClass);
        setTimeout(() => dom.classList.remove(directionClass), 200);
    }
    
    // Calculate basic physical damage using attacker's 武力 (Martial Power)
    let damage = attacker.stats.wuli;
    
    if (attacker.statusEffects.some(e => e.type === 'sun_quan_buff')) {
        damage = Math.round(damage * 1.30);
    }
    if (attacker.statusEffects.some(e => e.type === 'yuan_shu_buff')) {
        damage = Math.round(damage * 1.80);
    }
    if (attacker.statusEffects.some(e => e.type === 'gang_yong')) {
        damage = Math.round(damage * 1.20);
    }
    if (attacker.statusEffects.some(e => e.type === 'guan_yu_wuli_buff')) {
        damage = Math.round(damage * 1.20);
    }
    
    if (attacker.templateId === 'ballista_tower') {
        damage = attacker.stats.wuli; // Heavy bolt
    }
    
    // Roll for Critical Hit
    let isCrit = false;
    let critChance = 0.05; // Base 5%
    if (attacker.statusEffects.some(e => e.type === 'passive_energy_crit')) {
        critChance += 0.20; // Zhang Jiao passive
    }
    if (Math.random() < critChance) {
        isCrit = true;
        damage = Math.round(damage * 1.5);
    }

    // Apply Guan Yu secondary passive [千里走單騎] on attack
    if (attacker.templateId === 'guan_yu' && Math.random() < 0.30) {
        applyStatusEffect(attacker, 'resist', 1, 999999);
        applyStatusEffect(attacker, 'guan_yu_wuli_buff', 20, 3000);
        createFloatingNumber(attacker, '抵禦', 'shield');
        addLog(`🐎 關羽触發 [千里走單騎]！獲得抵禦效果與武力提升。`, 'skill');
    }

    // Apply damage to target
    takeDamage(target, damage, 'attack', attacker, isCrit);
    
    // Lu Bu Splash damage
    if (attacker.statusEffects.some(e => e.type === 'lu_bu_rage')) {
        const splashMult = 1.5;
        const splashDmg = Math.round(damage * splashMult);
        activeUnits.forEach(other => {
            if (other.isDead || other.team === attacker.team || other === target) return;
            if (getDistance(target, other) <= 1) {
                takeDamage(other, splashDmg, 'attack', attacker, false);
                createFloatingNumber(other, '溅射', 'dmg');
            }
        });
    }
    
    // Trigger Assault Skills immediately after basic attack
    const template = UNIT_TEMPLATES[attacker.templateId];
    if (template && template.extraSkillConfig && template.extraSkillConfig.type === 'assault') {
        const config = template.extraSkillConfig;
        if (Math.random() < config.chance) {
            triggerAssaultSkill(attacker, target, config);
        }
    }

    // Attack generates energy for attacker (+10) and defender (+5)
    let energyAttacker = 10;
    let energyTarget = 5;
    
    if (attacker.templateId === 'zhang_jiao') {
        energyAttacker = Math.round(energyAttacker * 1.25); // Zhang Jiao passive energy speed
    }

    if (activeFates.includes('wei_intellects')) {
        if (['cao_cao', 'guo_jia', 'xun_yu'].includes(attacker.templateId)) {
            energyAttacker = Math.round(energyAttacker * 1.3);
        }
        if (['cao_cao', 'guo_jia', 'xun_yu'].includes(target.templateId)) {
            energyTarget = Math.round(energyTarget * 1.2);
        }
    }
    
    if (!attacker.isBuilding) {
        attacker.energy = Math.min(attacker.energy + energyAttacker, 100);
    }
    if (!target.isBuilding) {
        target.energy = Math.min(target.energy + energyTarget, 100);
    }
    
    // Fates / Synergies: Wu Commanders burn on attack
    if (activeFates.includes('wu_commander') && ['sun_quan', 'zhou_yu', 'lu_xun'].includes(attacker.templateId)) {
        if (Math.random() < 0.35) {
            const burnDmg = Math.round(attacker.stats.zhili * 0.15);
            applyStatusEffect(target, 'burn', burnDmg, 3000);
            createFloatingNumber(target, '灼燒', 'skill');
        }
    }
    
    // Hero Unique Attack Mechanics
    if (attacker.templateId === 'zhuge_liang') {
        const burnDmg = Math.round(attacker.stats.zhili * 0.1);
        applyStatusEffect(target, 'burn', burnDmg, 3000);
        
        // 2. Heal lowest HP ally for 50% damage dealt
        const healAmt = Math.round(damage * 0.5);
        healLowestAlly(attacker, healAmt);
    }
}

function triggerAssaultSkill(attacker, target, config) {
    const levelMult = 1 + (attacker.skillLevel - 1) * 0.25;
    const name = UNIT_TEMPLATES[attacker.templateId].extraSkillName;
    addLog(`⚡ 突擊戰法！${attacker.name} 發动戰法 [${name}]（${attacker.skillLevel} 級）！`, 'skill');

    switch (attacker.templateId) {
        case 'sun_quan': {
            const dmg = Math.round(attacker.stats.zhili * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '兵無常勢', 'skill');
            takeDamage(target, dmg, 'skill', attacker, false);
            healUnit(attacker, dmg);
            break;
        }
        case 'lu_xun': {
            const dmg = Math.round(attacker.stats.zhili * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '克敵制勝', 'skill');
            takeDamage(target, dmg, 'skill', attacker, false);
            if (target.statusEffects.some(e => e.type === 'burn') && Math.random() < config.stunChance) {
                applyStatusEffect(target, 'stun', 0, config.stunDurationSec * 1000);
                createFloatingNumber(target, '震懾', 'shield');
            }
            break;
        }
        case 'yuan_shu': {
            const dmg = Math.round(attacker.stats.wuli * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '手起刀落', 'skill');
            takeDamage(target, dmg, 'skill', attacker, false);
            break;
        }
        case 'lu_bu': {
            const dmg = Math.round(attacker.stats.wuli * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '百騎劫營', 'skill');
            takeDamage(target, dmg, 'skill', attacker, false);
            
            // Splash to lowest HP enemy
            let lowestEnemy = null;
            let minHP = Infinity;
            activeUnits.forEach(other => {
                if (other.isDead || other.team === attacker.team) return;
                if (other.hp < minHP) {
                    minHP = other.hp;
                    lowestEnemy = other;
                }
            });
            if (lowestEnemy) {
                const splashDmg = Math.round(dmg * config.splashPct);
                takeDamage(lowestEnemy, splashDmg, 'skill', attacker, false);
                createFloatingNumber(lowestEnemy, '溅射', 'dmg');
            }
            break;
        }
    }
}

export function takeDamage(unit, amount, type = 'attack', source = null, isCrit = false) {
    if (unit.isDead) return;
    
    // 1. Weakness Check: deals 0 damage
    if (source && source.statusEffects.some(e => e.type === 'weakness')) {
        createFloatingNumber(unit, '虛弱', 'shield');
        return;
    }

    // 2. Resist Check: completely blocks next instance of damage
    const resistIdx = unit.statusEffects.findIndex(e => e.type === 'resist');
    if (resistIdx !== -1) {
        const stack = unit.statusEffects[resistIdx].val;
        if (stack > 1) {
            unit.statusEffects[resistIdx].val--;
        } else {
            unit.statusEffects.splice(resistIdx, 1);
        }
        createFloatingNumber(unit, '格擋', 'shield');
        return;
    }

    // 3. Evasion Check
    const evadeEffect = unit.statusEffects.find(e => e.type === 'evade');
    if (evadeEffect && Math.random() < (evadeEffect.val / 100)) {
        createFloatingNumber(unit, '規避', 'shield');
        return;
    }

    let netDmg = amount;
    
    // Apply damage reduction defenses from Command (tongshuai)
    let defense = unit.stats.tongshuai;
    
    // Buff defenses
    const ysBuff = unit.statusEffects.find(e => e.type === 'yuan_shao_def_buff');
    if (ysBuff) defense = Math.round(defense * 1.4);
    
    const sqBuff = unit.statusEffects.find(e => e.type === 'sun_quan_buff');
    if (sqBuff) defense = Math.round(defense * 1.3);
    
    if (unit.statusEffects.some(e => e.type === 'shred')) {
        defense = Math.round(defense * 0.75); // Zhang Fei armor shred
    }

    // Xun Yu Wang Zuo defense aura: +20% Tongshuai to adjacent allies
    const hasAdjXunYu = activeUnits.some(u => !u.isDead && u.team === unit.team && u.templateId === 'xun_yu' && getDistance(unit, u) <= 1);
    if (hasAdjXunYu) {
        defense = Math.round(defense * 1.20);
    }

    let reductionMult = 1 - (defense / (defense + 250));
    
    // Cao Cao Aura Check: Cao Cao takes 15% less damage
    if (unit.templateId === 'cao_cao') {
        reductionMult *= 0.85;
    }
    // Cao Cao Aura Check: Cao Cao allies deal 12% more damage
    if (source) {
        const hasCaoCao = activeUnits.some(u => !u.isDead && u.team === source.team && u.templateId === 'cao_cao');
        if (hasCaoCao) {
            netDmg = Math.round(netDmg * 1.12);
        }
    }

    // Yuan Shao Formation check (Fengshi)
    const frontlineFengshi = unit.statusEffects.find(e => e.type === 'formation_fengshi_front');
    if (frontlineFengshi) {
        reductionMult *= 1.15; // Frontline center takes +15% damage
    }
    const backlineFengshi = unit.statusEffects.find(e => e.type === 'formation_fengshi_back');
    if (backlineFengshi) {
        reductionMult *= 0.85; // Backline takes -15% damage
    }

    // Liu Bei Skill damage reduction
    const lbBuff = unit.statusEffects.find(e => e.type === 'liu_bei_buff');
    if (lbBuff) {
        reductionMult *= (1 - (lbBuff.val / 100));
    }
    
    // Guo Jia Skill damage reduction
    const gjBuff = unit.statusEffects.find(e => e.type === 'guo_jia_buff');
    if (gjBuff) {
        reductionMult *= 0.70;
    }
    
    // Zhao Yun Skill damage reduction override
    if (unit.templateId === 'zhao_yun') {
        const diveReduction = unit.statusEffects.find(e => e.type === 'zhao_yun_dive');
        if (diveReduction) {
            reductionMult *= 0.50; // Flat 50% decrease
            
            // Extra 50% of Command (tongshuai) reduction if attacker is one of pushed units
            if (source && diveReduction.pushedIds.includes(source.id)) {
                const commandDmgReduction = Math.min(unit.stats.tongshuai / 200, 0.5); // Max 50% extra
                reductionMult *= (1 - commandDmgReduction);
            }
        }
    }
    
    netDmg = Math.round(netDmg * reductionMult);
    if (netDmg <= 0) netDmg = 1; // Minimum 1 damage
    
    // Handle Shield absorption first
    if (unit.shield > 0) {
        if (unit.shield >= netDmg) {
            unit.shield -= netDmg;
            createFloatingNumber(unit, netDmg, 'shield');
            playSound('hit');
            return;
        } else {
            const bleedDmg = netDmg - unit.shield;
            unit.shield = 0;
            netDmg = bleedDmg;
        }
    }
    
    unit.hp = Math.max(unit.hp - netDmg, 0);
    
    if (isCrit) {
        createFloatingNumber(unit, `💥 ${netDmg} 暴擊!`, 'dmg');
    } else {
        createFloatingNumber(unit, netDmg, 'dmg');
    }
    playSound('hit');
    
    // Xun Yu Wang Zuo passive: Heal adjacent allies on crit hit
    if (isCrit && type === 'attack') {
        const xunYu = activeUnits.find(u => !u.isDead && u.team === unit.team && u.templateId === 'xun_yu');
        if (xunYu && getDistance(unit, xunYu) <= 1) {
            const healAmt = Math.round(xunYu.stats.zhili * 0.8 * (1 + (xunYu.skillLevel - 1) * 0.25));
            healUnit(unit, healAmt);
            createFloatingNumber(unit, '王佐之才', 'heal');
            addLog(`🏥 荀彧的 [王佐之才] 在 ${unit.name} 受到暴擊後為其恢復 ${healAmt} 生命值！`, 'skill');
        }
    }

    // Zhang Fei counter passive [剛勇無前] on taking damage
    if (unit.templateId === 'zhang_fei') {
        applyStatusEffect(unit, 'gang_yong', 20, 3000);
        if (source) {
            applyStatusEffect(source, 'shred', 25, 3000);
            createFloatingNumber(source, '破防', 'dmg');
        }
    }

    // Lifesteal (倒戈) check
    if (source && type === 'attack') {
        const lifestealEffect = source.statusEffects.find(e => e.type === 'lifesteal');
        if (lifestealEffect) {
            const healAmt = Math.round(netDmg * (lifestealEffect.val / 100));
            if (healAmt > 0) {
                healUnit(source, healAmt);
            }
        }
    }

    // Update reference HP for surviving buildings in state
    if (unit.team === 'player' && unit.boardReference) {
        unit.boardReference.hp = unit.hp;
    }
}

function healUnit(unit, amount) {
    if (unit.isDead) return;
    
    const healVal = Math.min(amount, unit.hpMax - unit.hp);
    if (healVal <= 0) return;
    
    unit.hp += healVal;
    createFloatingNumber(unit, healVal, 'heal');
    playSound('heal');
    
    if (unit.team === 'player' && unit.boardReference) {
        unit.boardReference.hp = unit.hp;
    }
}

function addShield(unit, amount, durationSec = 4) {
    if (unit.isDead) return;
    
    unit.shield = Math.min(unit.shield + amount, unit.hpMax); // Shield cap at max hp
    createFloatingNumber(unit, amount, 'shield');
    playSound('shield');
    
    applyStatusEffect(unit, 'shield_dur', amount, durationSec * 1000);
}

function healLowestAlly(healer, amount) {
    let target = null;
    let minHpRatio = 1.0;
    
    activeUnits.forEach(u => {
        if (u.isDead || u.team !== healer.team) return;
        const ratio = u.hp / u.hpMax;
        if (ratio < minHpRatio) {
            minHpRatio = ratio;
            target = u;
        }
    });
    
    if (target) {
        healUnit(target, amount);
    }
}

function applyStatusEffect(unit, type, val, durationMs, extra = null) {
    const ccTypes = ['stun', 'disarm', 'silence', 'taunt', 'confusion', 'charm'];
    if (ccTypes.includes(type) && unit.statusEffects.some(e => e.type === 'insight')) {
        return; // CC Immune under Insight (洞察)
    }

    const expiry = Date.now() + durationMs;
    // Check duplicate
    const index = unit.statusEffects.findIndex(e => e.type === type);
    if (index !== -1) {
        unit.statusEffects[index].val = val;
        unit.statusEffects[index].expiry = expiry;
        if (extra) Object.assign(unit.statusEffects[index], extra);
    } else {
        unit.statusEffects.push({ type, val, expiry, ...extra });
    }
}

// ==========================================
// ACTIVE HERO SKILLS CASTING
// ==========================================
function castSkill(unit) {
    const isSilenced = unit.statusEffects.some(eff => eff.type === 'silence');
    if (isSilenced) {
        createFloatingNumber(unit, '計窮', 'shield');
        return;
    }

    // Zhuge Liang [神機妙算] silence counter check before enemy casts
    if (unit.team !== 'player') {
        const zhuge = activeUnits.find(u => !u.isDead && u.team === 'player' && u.templateId === 'zhuge_liang');
        if (zhuge && Math.random() < 0.35) {
            addLog(`🔮 诸葛亮触發 [神機妙算]，成功打斷並計窮了 ${unit.name}！`, 'skill');
            createFloatingNumber(unit, '施法中斷', 'shield');
            applyStatusEffect(unit, 'silence', 0, 2000);
            const counterDmg = Math.round(zhuge.stats.zhili * 1.5 * (1 + (zhuge.skillLevel - 1) * 0.25));
            takeDamage(unit, counterDmg, 'skill', zhuge, false);
            unit.energy = 0; // Consume their energy anyway
            return;
        }
    }

    unit.energy = 0; // Consume energy
    
    const template = UNIT_TEMPLATES[unit.templateId];
    if (!template || !template.skillConfig) return;
    
    const config = template.skillConfig;
    const skillLvlMult = 1 + (unit.skillLevel - 1) * 0.25; // +25% per level
    
    playSound('skill');
    
    // Trigger flash animation
    const dom = document.getElementById(unit.id);
    if (dom) {
        dom.classList.add('casting-skill');
        setTimeout(() => dom.classList.remove('casting-skill'), 400);
    }
    
    createFloatingNumber(unit, template.skillName, 'skill');
    addLog(`✨ ${unit.name} 發动主动戰法 [${template.skillName}]（${unit.skillLevel} 級）！`, 'skill');
    
    switch (config.type) {
        case 'sima_yi_aoe': {
            const dmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
            let totalDmgDealt = 0;
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                let defense = other.stats.tongshuai;
                const ysBuff = other.statusEffects.find(e => e.type === 'yuan_shao_def_buff');
                if (ysBuff) defense = Math.round(defense * 1.4);
                const sqBuff = other.statusEffects.find(e => e.type === 'sun_quan_buff');
                if (sqBuff) defense = Math.round(defense * 1.3);
                
                let reductionMult = 1 - (defense / (defense + 250));
                const lbBuff = other.statusEffects.find(e => e.type === 'liu_bei_buff');
                if (lbBuff) reductionMult *= (1 - (lbBuff.val / 100));
                const gjBuff = other.statusEffects.find(e => e.type === 'guo_jia_buff');
                if (gjBuff) reductionMult *= 0.70;
                
                let netDmg = Math.round(dmg * reductionMult);
                if (netDmg <= 0) netDmg = 1;
                
                totalDmgDealt += netDmg;
                takeDamage(other, netDmg, 'skill', unit);
            });
            if (totalDmgDealt > 0) {
                healUnit(unit, totalDmgDealt);
                addLog(`🦅 司马懿的 [鹰视狼顾] 共造成 ${totalDmgDealt} 點傷害，並為自身治療 ${totalDmgDealt} 生命值！`, 'skill');
            }
            break;
        }

        case 'lu_bu_rage': {
            const stunDur = config.stunDurationSec * 1000;
            const buffDur = config.durationSec * 1000;
            
            // Stun adjacent enemies
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                if (getDistance(unit, other) <= 1) {
                    applyStatusEffect(other, 'stun', 0, stunDur);
                    createFloatingNumber(other, '震懾', 'shield');
                }
            });
            
            // Gain Lu Bu rage buff
            applyStatusEffect(unit, 'lu_bu_rage', 1, buffDur);
            createFloatingNumber(unit, '天下無雙', 'skill');
            break;
        }

        case 'diao_chan_charm': {
            let highestDmgEnemy = null;
            let highestPower = -1;
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                const power = Math.max(other.stats.wuli, other.stats.zhili);
                if (power > highestPower) {
                    highestPower = power;
                    highestDmgEnemy = other;
                }
            });
            
            if (highestDmgEnemy) {
                const charmDur = config.charmDurationSec * 1000;
                applyStatusEffect(highestDmgEnemy, 'charm', 0, charmDur);
                createFloatingNumber(highestDmgEnemy, '魅惑', 'shield');
                addLog(`🌸 貂蟬魅惑了 ${highestDmgEnemy.name} 3 秒！`, 'skill');
                
                if (activeFates.includes('hero_beauty')) {
                    const luBu = activeUnits.find(u => !u.isDead && u.team === unit.team && u.templateId === 'lu_bu');
                    if (luBu) {
                        const transferPct = config.statTransferPct;
                        const wuliTransfer = Math.round(highestDmgEnemy.stats.wuli * transferPct);
                        const zhiliTransfer = Math.round(highestDmgEnemy.stats.zhili * transferPct);
                        const tongshuaiTransfer = Math.round(highestDmgEnemy.stats.tongshuai * transferPct);
                        
                        luBu.stats.wuli += wuliTransfer;
                        luBu.stats.zhili += zhiliTransfer;
                        luBu.stats.tongshuai += tongshuaiTransfer;
                        
                        highestDmgEnemy.stats.wuli = Math.max(1, highestDmgEnemy.stats.wuli - wuliTransfer);
                        highestDmgEnemy.stats.zhili = Math.max(1, highestDmgEnemy.stats.zhili - zhiliTransfer);
                        highestDmgEnemy.stats.tongshuai = Math.max(1, highestDmgEnemy.stats.tongshuai - tongshuaiTransfer);
                        
                        createFloatingNumber(luBu, '英雄增益', 'heal');
                        createFloatingNumber(highestDmgEnemy, '屬性吸取', 'dmg');
                        addLog(`💖 英雄美人！吕布继承了 ${highestDmgEnemy.name} 50% 的屬性。`, 'skill');
                    }
                }
            }
            break;
        }
        case 'aoe_dmg_heal':
            // Zhuge Liang: AoE centered on closest enemy target
            const centerEnemy = findClosestEnemy(unit);
            if (centerEnemy) {
                const dmgValue = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
                const healValue = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
                
                // Explode visual indicator logic (we log it, and trigger a brief colored indicator)
                activeUnits.forEach(other => {
                    if (other.isDead) return;
                    const cellDist = getDistance(centerEnemy, other);
                    if (cellDist <= config.radius) {
                        if (other.team !== unit.team) {
                            takeDamage(other, dmgValue, 'skill', unit);
                        } else {
                            healUnit(other, healValue);
                        }
                    }
                });
            }
            break;
            
        case 'taunt_shield_sweep':
            // Zhang Fei: 2x3 grid area in front.
            // "In front" means towards y-axis where enemies reside.
            // Player units are at bottom (larger Y, e.g. y=8), enemy units at top (smaller Y, e.g. y=1).
            // So Zhang Fei casts towards y - 1, y - 2, y - 3.
            const directionY = unit.team === 'player' ? -1 : 1;
            const targetRows = [unit.y + directionY, unit.y + (directionY * 2), unit.y + (directionY * 3)];
            const targetCols = [unit.x - 1, unit.x, unit.x + 1];
            
            const sweepDmg = Math.round(unit.stats.wuli * config.dmgMult * skillLvlMult);
            const shieldVal = Math.round(unit.stats.tongshuai * config.shieldMult * skillLvlMult);
            
            // Add self shield
            addShield(unit, shieldVal, config.durationSec);
            
            // Sweep damage & taunt
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                
                // Check if target is inside the 2x3 range in front
                if (targetRows.includes(other.y) && targetCols.includes(other.x)) {
                    takeDamage(other, sweepDmg, 'skill', unit);
                    
                    // Taunt target
                    other.tauntTarget = unit;
                    applyStatusEffect(other, 'taunt', 0, config.durationSec * 1000);
                    createFloatingNumber(other, '嘲諷', 'shield');
                }
            });
            break;
            
        case 'summon_buff':
            // Cao Cao: Summons 2 Danyang soldiers, shields and heals allies
            const caoShield = Math.round(unit.stats.tongshuai * config.shieldMult * skillLvlMult);
            const caoHeal = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
            
            // 1. Spawn summons on open spots
            let summonedCount = 0;
            const spawnOffset = [
                {x:-1, y:0}, {x:1, y:0}, {x:0, y:1}, {x:0, y:-1}
            ];
            
            for (const offset of spawnOffset) {
                if (summonedCount >= config.summonCount) break;
                const sx = unit.x + offset.x;
                const sy = unit.y + offset.y;
                
                if (isCellWalkable(sx, sy) && !isCellOccupied(sx, sy)) {
                    spawnSummon('danyang_soldier', sx, sy, unit.team, skillLvlMult);
                    summonedCount++;
                }
            }
            
            // 2. Heal and shield all allies
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team) return;
                healUnit(other, caoHeal);
                addShield(other, caoShield, 4);
            });
            break;
            
        case 'push_dive':
            // Zhao Yun: pushes front enemies back 2 cells, gains dmg reduction
            const dirY = unit.team === 'player' ? -1 : 1;
            
            // Collect all enemies directly in column in front of Zhao Yun
            const pushedEnemies = [];
            
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                // Check if in same column x, and in front (direction-wise)
                if (other.x === unit.x) {
                    const isFront = dirY === -1 ? other.y < unit.y : other.y > unit.y;
                    if (isFront) {
                        pushedEnemies.push(other);
                    }
                }
            });
            
            // Push them back
            const pushedIds = [];
            pushedEnemies.forEach(enemy => {
                pushedIds.push(enemy.id);
                // Push back (increase/decrease y towards outer edge)
                const newY = enemy.y + (dirY * config.pushDist);
                const clampedY = Math.max(0, Math.min(newY, 9));
                
                // Set coordinate (only if destination is walkable and empty)
                if (isCellWalkable(enemy.x, clampedY) && !isCellOccupied(enemy.x, clampedY)) {
                    enemy.y = clampedY;
                }
                
                // Force target to lock Zhao Yun
                enemy.tauntTarget = unit;
                applyStatusEffect(enemy, 'taunt', 0, config.durationSec * 1000);
            });
            
            // Apply Zhao Yun dive buff
            applyStatusEffect(unit, 'zhao_yun_dive', 0, config.durationSec * 1000, { pushedIds });
            break;

        case 'liu_bei_heal':
            const lbHealVal = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team) return;
                if (getDistance(unit, other) <= config.radius) {
                    healUnit(other, lbHealVal);
                    applyStatusEffect(other, 'liu_bei_buff', Math.round(config.dmgReduc * 100), config.durationSec * 1000);
                    createFloatingNumber(other, '護盾', 'shield');
                }
            });
            break;

        case 'guan_yu_aoe':
            const gyDmg = Math.round(unit.stats.wuli * config.dmgMult * skillLvlMult);
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                if (getDistance(unit, other) <= config.radius) {
                    takeDamage(other, gyDmg, 'skill', unit);
                    applyStatusEffect(other, 'stun', 0, config.stunDurationSec * 1000);
                    createFloatingNumber(other, '震懾', 'shield');
                }
            });
            break;

        case 'guo_jia_buff':
            let bestAlly = null;
            let bestPower = -1;
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team || other === unit) return;
                const power = Math.max(other.stats.wuli, other.stats.zhili);
                if (power > bestPower) {
                    bestPower = power;
                    bestAlly = other;
                }
            });
            if (bestAlly) {
                applyStatusEffect(bestAlly, 'guo_jia_buff', Math.round(config.dmgReduc * 100), config.durationSec * 1000, { level: unit.skillLevel });
                createFloatingNumber(bestAlly, '洞察', 'shield');
                addLog(`🛡️ 郭嘉輔助 ${bestAlly.name}！使其免疫控制並提升 50% 攻擊速度。`, 'skill');
            }
            break;

        case 'xun_yu_curse':
            let maxHPEnergyEnemy = null;
            let maxHP = -1;
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                if (other.hp > maxHP) {
                    maxHP = other.hp;
                    maxHPEnergyEnemy = other;
                }
            });
            if (maxHPEnergyEnemy) {
                applyStatusEffect(maxHPEnergyEnemy, 'xun_yu_curse', 0, config.durationSec * 1000, { level: unit.skillLevel });
                createFloatingNumber(maxHPEnergyEnemy, '诅咒', 'dmg');
                addLog(`💀 荀彧對 ${maxHPEnergyEnemy.name} 施加了驱虎吞狼诅咒！`, 'skill');
            }
            break;

        case 'sun_quan_buff':
            applyStatusEffect(unit, 'sun_quan_buff', Math.round(config.buffPct * 100), config.durationSec * 1000);
            createFloatingNumber(unit, '坐斷東南', 'shield');
            break;

        case 'zhou_yu_fire':
            const zyDmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
            const zyBurn = Math.round(unit.stats.zhili * config.burnMult * skillLvlMult);
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                takeDamage(other, zyDmg, 'skill', unit, false);
                applyStatusEffect(other, 'burn', zyBurn, config.durationSec * 1000);
                createFloatingNumber(other, '灼燒', 'dmg');
            });

            // Zhou Yu secondary passive [奪魂挾魄]
            if (Math.random() < 0.50) {
                let targetEnemy = null;
                let maxHP = -1;
                activeUnits.forEach(other => {
                    if (other.isDead || other.team === unit.team) return;
                    if (other.hp > maxHP) {
                        maxHP = other.hp;
                        targetEnemy = other;
                    }
                });
                if (targetEnemy) {
                    const wuliSteal = Math.round(targetEnemy.stats.wuli * 0.15);
                    const zhiliSteal = Math.round(targetEnemy.stats.zhili * 0.15);
                    const tongshuaiSteal = Math.round(targetEnemy.stats.tongshuai * 0.15);
                    
                    unit.stats.wuli += wuliSteal;
                    unit.stats.zhili += zhiliSteal;
                    unit.stats.tongshuai += tongshuaiSteal;
                    
                    targetEnemy.stats.wuli = Math.max(1, targetEnemy.stats.wuli - wuliSteal);
                    targetEnemy.stats.zhili = Math.max(1, targetEnemy.stats.zhili - zhiliSteal);
                    targetEnemy.stats.tongshuai = Math.max(1, targetEnemy.stats.tongshuai - tongshuaiSteal);
                    
                    applyStatusEffect(unit, 'stat_steal_buff', 0, 4000, { wuliSteal, zhiliSteal, tongshuaiSteal });
                    applyStatusEffect(targetEnemy, 'stat_steal_debuff', 0, 4000, { wuliSteal, zhiliSteal, tongshuaiSteal });
                    
                    createFloatingNumber(unit, '夺魂', 'heal');
                    createFloatingNumber(targetEnemy, '屬性吸取', 'dmg');
                    addLog(`🔥 周瑜触發 [奪魂挾魄] 夺取了 ${targetEnemy.name} 15% 的屬性！`, 'skill');
                }
            }
            break;

        case 'lu_xun_explode':
            let targetEnemy = activeUnits.find(other => !other.isDead && other.team !== unit.team && other.statusEffects.some(e => e.type === 'burn'));
            if (!targetEnemy) {
                targetEnemy = findClosestEnemy(unit);
            }
            if (targetEnemy) {
                const lxDmg = Math.round(unit.stats.zhili * config.targetDmgMult * skillLvlMult);
                const isBurned = targetEnemy.statusEffects.some(e => e.type === 'burn');
                addLog(`🔥 陆逊對 ${targetEnemy.name} 發动火燒連營！`, 'skill');
                takeDamage(targetEnemy, lxDmg, 'skill', unit);
                
                if (isBurned) {
                    addLog(`💥 火势蔓延！從 ${targetEnemy.name} 身上爆裂並扩散了灼燒状态！`, 'skill');
                    const splashDmg = Math.round(unit.stats.zhili * config.splashDmgMult * skillLvlMult);
                    const burnVal = Math.round(unit.stats.zhili * 0.15 * skillLvlMult);
                    activeUnits.forEach(other => {
                        if (other.isDead || other.team === unit.team || other === targetEnemy) return;
                        if (getDistance(targetEnemy, other) <= 1) {
                            takeDamage(other, splashDmg, 'skill', unit);
                            applyStatusEffect(other, 'burn', burnVal, 4000);
                            createFloatingNumber(other, '灼燒扩散', 'dmg');
                        }
                    });
                }
            }
            break;

        case 'zhang_jiao_lightning':
            let isSkillCrit = Math.random() < 0.20; // Zhang Jiao passive +20% active skill crit
            const zjDmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult * (isSkillCrit ? 1.5 : 1.0));
            const enemies = activeUnits.filter(other => !other.isDead && other.team !== unit.team);
            for (let i = 0; i < config.boltCount; i++) {
                if (enemies.length === 0) break;
                const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                takeDamage(randEnemy, zjDmg, 'skill', unit, isSkillCrit);
                createFloatingNumber(randEnemy, isSkillCrit ? '⚡ 奇謀五雷' : '⚡ 雷擊', 'skill');
                if (Math.random() < config.stunChance) {
                    applyStatusEffect(randEnemy, 'stun', 0, config.stunDurationSec * 1000);
                    createFloatingNumber(randEnemy, '震懾', 'shield');
                }
            }
            break;

        case 'yuan_shao_line':
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team) return;
                applyStatusEffect(other, 'yuan_shao_def_buff', 1, config.durationSec * 1000);
                createFloatingNumber(other, '防禦提升', 'shield');
            });
            const dir = unit.team === 'player' ? -1 : 1;
            const lineCols = [unit.x];
            const lineRows = [unit.y + dir, unit.y + (dir * 2), unit.y + (dir * 3)];
            const ysDmg = Math.round(unit.stats.wuli * config.dmgMult * skillLvlMult);
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                if (lineCols.includes(other.x) && lineRows.includes(other.y)) {
                    takeDamage(other, ysDmg, 'skill', unit);
                    createFloatingNumber(other, 'ARROW VOLLEY', 'dmg');
                }
            });
            break;

        case 'yuan_shu_sacrifice':
            applyStatusEffect(unit, 'yuan_shu_buff', 1, config.durationSec * 1000, { level: unit.skillLevel });
            createFloatingNumber(unit, 'SACRIFICE BUFF', 'shield');
            break;
    }

    // Yellow Turban Synergy Summon Trigger
    if (activeFates.includes('yellow_turban') && ['zhang_jiao', 'yuan_shao', 'yuan_shu'].includes(unit.templateId)) {
        let spawned = false;
        const spawnOffsets = [{x:-1, y:0}, {x:1, y:0}, {x:0, y:1}, {x:0, y:-1}];
        for (const offset of spawnOffsets) {
            const sx = unit.x + offset.x;
            const sy = unit.y + offset.y;
            if (isCellWalkable(sx, sy) && !isCellOccupied(sx, sy)) {
                spawnSummon('yellow_turban_grunt', sx, sy, unit.team, skillLvlMult);
                addLog(`⚡ 黃巾起義效果生效，召喚了一名黃巾兵！`, 'skill');
                spawned = true;
                break;
            }
        }
    }
}

function spawnSummon(templateId, x, y, team, scaleMult) {
    const template = UNIT_TEMPLATES[templateId];
    const stats = getStatsForStar(template, 1);
    
    // Scale stats of summon based on skill level
    const hpMax = Math.round(stats.hpMax * scaleMult);
    
    const summon = {
        id: `summon_${templateId}_${Math.random().toString(36).substr(2, 5)}`,
        templateId,
        name: template.name,
        star: 1,
        skillLevel: 1,
        x,
        y,
        team,
        hp: hpMax,
        hpMax: hpMax,
        shield: 0,
        energy: 0,
        stats: {
            hpMax,
            wuli: Math.round(stats.wuli * scaleMult),
            zhili: Math.round(stats.zhili * scaleMult),
            tongshuai: Math.round(stats.tongshuai * scaleMult),
            atkSpeed: stats.atkSpeed,
            range: stats.range
        },
        isBuilding: false,
        color: template.color,
        avatarText: template.avatarText,
        isDead: false,
        lastAttackTime: 0,
        tauntTarget: null,
        statusEffects: []
    };
    
    activeUnits.push(summon);
    
    // Spawn element dynamically in DOM
    const elGrid = document.getElementById('battle-grid');
    const unitEl = document.createElement('div');
    unitEl.id = summon.id;
    unitEl.className = `grid-unit ${team}-team summon-unit`;
    unitEl.style.left = `calc(${summon.x} * 100% / 8)`;
    unitEl.style.top = `calc(${summon.y} * 100% / 10)`;
    
    unitEl.innerHTML = `
        <div class="unit-token" style="background-color: ${template.color}44; border-color: ${template.color}; transform: scale(0.9);">
            <span style="font-family: var(--font-header); font-size:0.9rem; color:#fff;">${template.avatarText}</span>
        </div>
        <div class="unit-bars">
            <div class="bar"><div class="bar-fill hp-fill" style="transform: scaleX(1)"></div></div>
        </div>
    `;
    
    elGrid.appendChild(unitEl);
    addLog(`已在 ${String.fromCharCode(65 + x)} 列召喚 ${template.name}！`, 'system');
}

// ==========================================
// RENDER & DOM BINDINGS
// ==========================================
function renderBattlefield() {
    const elGrid = document.getElementById('battle-grid');
    
    // Clean old player markers, but keep cells. Just remove previous .grid-unit
    elGrid.querySelectorAll('.grid-unit').forEach(u => u.remove());
    
    // Draw all participants
    activeUnits.forEach(unit => {
        const template = UNIT_TEMPLATES[unit.templateId];
        if (!template) return;
        
        const unitEl = document.createElement('div');
        unitEl.id = unit.id;
        unitEl.className = `grid-unit ${unit.team}-team star-${unit.star}`;
        if (template.isBuilding) unitEl.classList.add('building');
        
        unitEl.style.left = `calc(${unit.x} * 100% / 8)`;
        unitEl.style.top = `calc(${unit.y} * 100% / 10)`;
        
        const tokenStyle = template.portrait
            ? `background-image: url('${template.portrait}'); border-color: ${unit.color}; background-size: cover; background-position: top center;`
            : `background-color: ${unit.color}33; border-color: ${unit.color}; display:flex; align-items:center; justify-content:center;`;
        
        unitEl.innerHTML = `
            <div class="unit-stars">${unit.team === 'player' ? '★'.repeat(unit.star) : ''}</div>
            <div class="unit-token" style="${tokenStyle}">
                ${template.portrait ? '' : `<span style="font-family: var(--font-header); font-size:1.1rem; color:#fff; text-shadow:0 0 6px ${unit.color}aa">${unit.avatarText}</span>`}
            </div>
            <div class="unit-bars">
                <div class="bar"><div class="bar-fill hp-fill" style="transform: scaleX(1)"></div></div>
                <div class="bar" style="display:none;"><div class="bar-fill shield-fill" style="transform: scaleX(0)"></div></div>
                ${!template.isBuilding ? `<div class="bar"><div class="bar-fill energy-fill" style="transform: scaleX(0)"></div></div>` : ''}
            </div>
        `;
        
        elGrid.appendChild(unitEl);
    });
}

function updateGridVisuals() {
    activeUnits.forEach(unit => {
        if (unit.isDead) return;
        
        const dom = document.getElementById(unit.id);
        if (!dom) return;
        
        // Update grid positions (moving elements smoothly)
        dom.style.left = `calc(${unit.x} * 100% / 8)`;
        dom.style.top = `calc(${unit.y} * 100% / 10)`;
        
        // Bars update
        const hpBar = dom.querySelector('.hp-fill');
        if (hpBar) hpBar.style.transform = `scaleX(${unit.hp / unit.hpMax})`;
        
        const shieldBarContainer = dom.querySelectorAll('.bar')[1];
        if (shieldBarContainer) {
            const shieldBar = shieldBarContainer.querySelector('.shield-fill') || shieldBarContainer.querySelector('.bar-fill');
            if (unit.shield > 0) {
                shieldBarContainer.style.display = 'block';
                shieldBar.style.transform = `scaleX(${unit.shield / unit.hpMax})`;
            } else {
                shieldBarContainer.style.display = 'none';
            }
        }
        
        const energyBar = dom.querySelector('.energy-fill');
        if (energyBar) energyBar.style.transform = `scaleX(${unit.energy / 100})`;
    });
}

// ==========================================
// VISUAL EFFECTS (FLOATING NUMBERS)
// ==========================================
function createFloatingNumber(unit, text, type) {
    const elGrid = document.getElementById('battle-grid');
    if (!elGrid) return;
    
    const floatEl = document.createElement('div');
    floatEl.className = `floating-number ${type}`;
    floatEl.textContent = text;
    
    // Get target unit cell pixels offset to center float
    // col -> x, row -> y
    const posX = unit.x * CELL_SIZE + (CELL_SIZE / 4);
    const posY = unit.y * CELL_SIZE - 10;
    
    floatEl.style.left = `${posX}px`;
    floatEl.style.top = `${posY}px`;
    
    elGrid.appendChild(floatEl);
    
    // Auto cleanup after fade animation completes
    setTimeout(() => {
        floatEl.remove();
    }, 800);
}

// ==========================================
// DYNAMIC SETTINGS MODIFIERS
// ==========================================
export function setCombatSpeed(speed) {
    settings.speed = speed;
    combatTickInterval = Math.round(150 / speed);
    if (battleTimer) {
        clearInterval(battleTimer);
        battleTimer = setInterval(combatTick, combatTickInterval);
    }
}

export function setCombatAudio(audio) {
    settings.audio = audio;
}

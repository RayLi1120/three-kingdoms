import { UNIT_TEMPLATES, FATE_TEMPLATES, getStatsForStar, SKILL_TEMPLATES } from './units.js?v=18';

// Local references to game state and callbacks to avoid circular imports
let logCallback = null;
let endBattleCallback = null;
let currentRound = 1;

// Seeded random number generator for deterministic combat results in PvP
let currentSeed = 12345;
const originalRandom = Math.random;

function seededRandom() {
    // Simple LCG PRNG
    currentSeed = (1103515245 * currentSeed + 12345) % 2147483648;
    return currentSeed / 2147483648;
}


// ==========================================
// BATTLE ENGINE STATE
// ==========================================
let activeUnits = []; // Active participants in the current battle
let activeFates = []; // Active synergies/fates passed from game.js
let oppActiveFates = []; // Active synergies/fates for opponent in PvP
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
    Math.random = originalRandom; // Restore original Math.random
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
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
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
export function initBattle(playerDeployedUnits, round, endCallback, logCallbackFn, playerActiveFates, playerActiveFactions, gameSettings, pvpConfig = null) {
    currentRound = round;
    endBattleCallback = endCallback;
    logCallback = logCallbackFn;
    activeUnits = [];
    activeFates = playerActiveFates || [];
    activeFactions = playerActiveFactions || { shu: 0, wei: 0, wu: 0, qun: 0 };
    settings = gameSettings || { audio: true, speed: 1 };
    
    // Override Math.random with deterministic seeded PRNG for PvP
    if (pvpConfig && typeof pvpConfig.seed === 'number') {
        currentSeed = pvpConfig.seed;
        Math.random = seededRandom;
    } else {
        Math.random = originalRandom;
    }
    
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
            stats.hpMax = Math.round(stats.hpMax * mult);
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
        if (activeFates.includes('wei_intellects') && ['guo_jia', 'xun_yu', 'jia_xu', 'cheng_yu'].includes(u.templateId)) {
            stats.zhili = Math.round(stats.zhili * 1.30);
        }
        if (activeFates.includes('wu_commander') && ['zhou_yu', 'lu_xun', 'lu_su'].includes(u.templateId)) {
            stats.zhili = Math.round(stats.zhili * 1.20);
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
        if (activeFates.includes('royal_marriage') && ['liu_bei', 'sun_shangxiang'].includes(u.templateId)) {
            stats.hpMax = Math.round(stats.hpMax * 1.20);
            stats.wuli = Math.round(stats.wuli * 1.20);
        }
        if (activeFates.includes('five_tigers') && ['guan_yu', 'zhang_fei', 'zhao_yun', 'ma_chao'].includes(u.templateId)) {
            stats.wuli = Math.round(stats.wuli * 1.20);
            stats.atkSpeed = stats.atkSpeed * 1.20;
        }
        if (activeFates.includes('tianshui_miracle') && ['zhuge_liang', 'zhao_yun', 'jiang_wei'].includes(u.templateId)) {
            stats.wuli = Math.round(stats.wuli * 1.20);
            stats.zhili = Math.round(stats.zhili * 1.20);
        }
        if (activeFates.includes('pillars_state') && ['sima_yi', 'zhou_yu', 'zhuge_liang'].includes(u.templateId)) {
            stats.zhili = Math.round(stats.zhili * 1.25);
            stats.tongshuai = Math.round(stats.tongshuai * 1.15);
        }
        if (activeFates.includes('wei_dynasty') && ['cao_cao', 'sima_yi'].includes(u.templateId)) {
            stats.hpMax = Math.round(stats.hpMax * 1.25);
            stats.tongshuai = Math.round(stats.tongshuai * 1.20);
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
            shield: u.templateId === 'sentry_tower' ? currentRound * 100 : 0,
            energy: 0,
            damageDealt: 0,
            damageTaken: 0,
            healingDone: 0,
            stats,
            isBuilding: u.isBuilding,
            color: template.color,
            avatarText: template.avatarText,
            isDead: false,
            lastAttackTime: 0,
            tauntTarget: null,
            statusEffects: [],
            boardReference: u, // Keep reference to update building HP later
            equippedSkill: u.equippedSkill || null
        });
    });

    // Calculate opponent active fates and factions if in PvP
    const oppActiveFactions = { shu: 0, wei: 0, wu: 0, qun: 0 };
    oppActiveFates = [];
    if (pvpConfig && pvpConfig.opponentUnits) {
        const oppCountedTemplates = new Set();
        const oppFactionUniqueCount = { shu: 0, wei: 0, wu: 0, qun: 0 };
        pvpConfig.opponentUnits.forEach(u => {
            if (oppCountedTemplates.has(u.templateId)) return;
            oppCountedTemplates.add(u.templateId);
            const template = UNIT_TEMPLATES[u.templateId];
            if (template && oppFactionUniqueCount[template.faction] !== undefined) {
                oppFactionUniqueCount[template.faction]++;
            }
        });
        
        for (const faction in oppFactionUniqueCount) {
            const count = oppFactionUniqueCount[faction];
            if (count >= 4) {
                oppActiveFactions[faction] = 2;
            } else if (count >= 2) {
                oppActiveFactions[faction] = 1;
            }
        }
        
        const oppDeployedIds = new Set(pvpConfig.opponentUnits.map(u => u.templateId));
        for (const key in FATE_TEMPLATES) {
            const fate = FATE_TEMPLATES[key];
            const minNeeded = fate.minCount || fate.requiredIds.length;
            const matchingCount = fate.requiredIds.filter(id => oppDeployedIds.has(id)).length;
            if (matchingCount >= minNeeded) {
                oppActiveFates.push(fate.id);
            }
        }
    }

    // Load enemy/opponent units
    if (pvpConfig && pvpConfig.opponentUnits) {
        pvpConfig.opponentUnits.forEach((u, index) => {
            const template = UNIT_TEMPLATES[u.templateId];
            if (!template) return;
            const stats = getStatsForStar(template, u.star);
            
            // Apply Faction Synergies for opponent!
            if (template.faction === 'shu' && oppActiveFactions.shu > 0) {
                const mult = oppActiveFactions.shu === 2 ? 1.30 : 1.15;
                stats.hpMax = Math.round(stats.hpMax * mult);
            }
            if (template.faction === 'wei' && oppActiveFactions.wei > 0) {
                const mult = oppActiveFactions.wei === 2 ? 1.30 : 1.15;
                stats.zhili = Math.round(stats.zhili * mult);
            }
            if (template.faction === 'wu' && oppActiveFactions.wu > 0) {
                const mult = oppActiveFactions.wu === 2 ? 1.30 : 1.15;
                stats.atkSpeed = stats.atkSpeed * mult;
            }
            if (template.faction === 'qun' && oppActiveFactions.qun > 0) {
                const mult = oppActiveFactions.qun === 2 ? 1.30 : 1.15;
                stats.tongshuai = Math.round(stats.tongshuai * mult);
                stats.hpMax = Math.round(stats.hpMax * mult);
            }
            
            // Apply Zhao Yun secondary passive [一身是膽] stats buff
            if (u.templateId === 'zhao_yun') {
                stats.wuli += 30;
                stats.tongshuai += 30;
            }

            // Apply Fate synergy stat multipliers!
            if (oppActiveFates.includes('peach_garden') && ['liu_bei', 'guan_yu', 'zhang_fei'].includes(u.templateId)) {
                stats.hpMax = Math.round(stats.hpMax * 1.20);
                stats.wuli = Math.round(stats.wuli * 1.20);
                stats.tongshuai = Math.round(stats.tongshuai * 1.20);
            }
            if (oppActiveFates.includes('wei_intellects') && ['guo_jia', 'xun_yu', 'jia_xu', 'cheng_yu'].includes(u.templateId)) {
                stats.zhili = Math.round(stats.zhili * 1.30);
            }
            if (oppActiveFates.includes('wu_commander') && ['zhou_yu', 'lu_xun', 'lu_su'].includes(u.templateId)) {
                stats.zhili = Math.round(stats.zhili * 1.20);
                stats.atkSpeed = stats.atkSpeed * 1.20;
            }
            if (oppActiveFates.includes('yellow_turban') && ['zhang_jiao', 'yuan_shao', 'yuan_shu'].includes(u.templateId)) {
                stats.hpMax = Math.round(stats.hpMax * 1.20);
            }
            if (oppActiveFates.includes('hero_beauty')) {
                if (u.templateId === 'lu_bu') {
                    stats.wuli = Math.round(stats.wuli * 1.25);
                } else if (u.templateId === 'diao_chan') {
                    stats.hpMax = Math.round(stats.hpMax * 1.25);
                }
            }
            if (oppActiveFates.includes('royal_marriage') && ['liu_bei', 'sun_shangxiang'].includes(u.templateId)) {
                stats.hpMax = Math.round(stats.hpMax * 1.20);
                stats.wuli = Math.round(stats.wuli * 1.20);
            }
            if (oppActiveFates.includes('five_tigers') && ['guan_yu', 'zhang_fei', 'zhao_yun', 'ma_chao'].includes(u.templateId)) {
                stats.wuli = Math.round(stats.wuli * 1.20);
                stats.atkSpeed = stats.atkSpeed * 1.20;
            }
            if (oppActiveFates.includes('tianshui_miracle') && ['zhuge_liang', 'zhao_yun', 'jiang_wei'].includes(u.templateId)) {
                stats.wuli = Math.round(stats.wuli * 1.20);
                stats.zhili = Math.round(stats.zhili * 1.20);
            }
            if (oppActiveFates.includes('pillars_state') && ['sima_yi', 'zhou_yu', 'zhuge_liang'].includes(u.templateId)) {
                stats.zhili = Math.round(stats.zhili * 1.25);
                stats.tongshuai = Math.round(stats.tongshuai * 1.15);
            }
            if (oppActiveFates.includes('wei_dynasty') && ['cao_cao', 'sima_yi'].includes(u.templateId)) {
                stats.hpMax = Math.round(stats.hpMax * 1.25);
                stats.tongshuai = Math.round(stats.tongshuai * 1.20);
            }
            
            // Mirror coordinate placement
            const mirroredX = 7 - u.x;
            const mirroredY = 9 - u.y;

            activeUnits.push({
                id: `enemy_${u.templateId}_${index}`,
                templateId: u.templateId,
                name: template.name,
                star: u.star,
                skillLevel: u.skillLevel,
                x: mirroredX,
                y: mirroredY,
                team: 'enemy',
                hp: stats.hpMax,
                hpMax: stats.hpMax,
                shield: 0,
                energy: 0,
                damageDealt: 0,
                damageTaken: 0,
                healingDone: 0,
                stats,
                isBuilding: template.isBuilding,
                color: template.color || '#ff4757',
                avatarText: template.avatarText,
                isDead: false,
                lastAttackTime: 0,
                tauntTarget: null,
                statusEffects: [],
                boardReference: null,
                equippedSkill: u.equippedSkill || null
            });
        });
    } else {
        // 2. Generate procedural enemy wave (Singleplayer)
        const wave = generateEnemyWave(round);
        activeUnits.push(...wave);
    }

    // Apply Zhao Yun [一身是膽] CC Immunity (both player and enemy Zhao Yun)
    activeUnits.forEach(unit => {
        if (unit.templateId === 'zhao_yun') {
            applyStatusEffect(unit, 'insight', 0, 9999999);
        }
    });

    // Apply Guo Jia [十勝遺計] start-of-combat buff to highest Wuli ally (symmetrically per team)
    ['player', 'enemy'].forEach(teamName => {
        const guoJia = activeUnits.find(u => u.team === teamName && u.templateId === 'guo_jia');
        if (guoJia) {
            let targetAlly = null;
            let maxWuli = -1;
            activeUnits.forEach(other => {
                if (other.team === teamName && other.stats.wuli > maxWuli) {
                    maxWuli = other.stats.wuli;
                    targetAlly = other;
                }
            });
            if (targetAlly) {
                applyStatusEffect(targetAlly, 'insight', 0, 6000);
                applyStatusEffect(targetAlly, 'lifesteal', 30, 6000);
                createFloatingNumber(targetAlly, '十勝遺計', 'shield');
                addLog(`🛡️ ${teamName === 'player' ? '己方' : '敵方'}郭嘉的 [十勝遺計] 賦予 ${targetAlly.name} 免疫控制與 30% 倒戈（吸血）效果，持續 6 秒！`, 'skill');
            }
        }
    });

    // Apply Diao Chan [傾國傾城] start-of-combat target selection (symmetrically per team)
    ['player', 'enemy'].forEach(teamName => {
        const diaoChan = activeUnits.find(u => u.team === teamName && u.templateId === 'diao_chan');
        if (diaoChan) {
            const enemies = activeUnits.filter(u => u.team !== teamName);
            const limit = Math.min(enemies.length, 2);
            const enemiesCopy = [...enemies];
            for (let i = 0; i < limit; i++) {
                const idx = Math.floor(Math.random() * enemiesCopy.length);
                const enemy = enemiesCopy.splice(idx, 1)[0];
                enemy.qingGuoTarget = true;
                addLog(`🌸 ${teamName === 'player' ? '己方' : '敵方'}貂蟬對 ${enemy.name} 施展 [傾國傾城]！`, 'skill');
            }
        }
    });

    // Apply Yuan Shao [鋒矢陣] formation placement buffs (symmetrically per team, accounting for mirrored coordinates)
    ['player', 'enemy'].forEach(teamName => {
        const yuanShao = activeUnits.find(u => u.team === teamName && u.templateId === 'yuan_shao');
        if (yuanShao) {
            activeUnits.forEach(unit => {
                if (unit.team === teamName) {
                    if (teamName === 'player') {
                        if (unit.y <= 7 && (unit.x === 3 || unit.x === 4)) {
                            applyStatusEffect(unit, 'formation_fengshi_front', 0, 9999999);
                            addLog(`📐 己方袁紹的 [鋒矢陣] 將 ${unit.name} 置於前排中路（獲得攻速加成，但受到的傷害增加 15%）。`, 'skill');
                        } else if (unit.y >= 8) {
                            applyStatusEffect(unit, 'formation_fengshi_back', 0, 9999999);
                        }
                    } else {
                        // Enemy team (mirrored grid, front row is y>=2, back row is y<=1)
                        if (unit.y >= 2 && (unit.x === 3 || unit.x === 4)) {
                            applyStatusEffect(unit, 'formation_fengshi_front', 0, 9999999);
                            addLog(`📐 敵方袁紹的 [鋒矢陣] 將 ${unit.name} 置於前排中路（獲得攻速加成，但受到的傷害增加 15%）。`, 'skill');
                        } else if (unit.y <= 1) {
                            applyStatusEffect(unit, 'formation_fengshi_back', 0, 9999999);
                        }
                    }
                }
            });
        }
    });

    // Apply Peach Garden shield at start of combat (both player and enemy)
    if (activeFates.includes('peach_garden')) {
        activeUnits.forEach(unit => {
            if (unit.team === 'player' && ['liu_bei', 'guan_yu', 'zhang_fei'].includes(unit.templateId)) {
                const shieldAmt = Math.round(unit.hpMax * 0.15);
                unit.shield = shieldAmt;
                unit.statusEffects.push({ type: 'shield_dur', val: shieldAmt, expiry: Date.now() + 999999 });
            }
        });
    }
    if (oppActiveFates && oppActiveFates.includes('peach_garden')) {
        activeUnits.forEach(unit => {
            if (unit.team === 'enemy' && ['liu_bei', 'guan_yu', 'zhang_fei'].includes(unit.templateId)) {
                const shieldAmt = Math.round(unit.hpMax * 0.15);
                unit.shield = shieldAmt;
                unit.statusEffects.push({ type: 'shield_dur', val: shieldAmt, expiry: Date.now() + 999999 });
            }
        });
    }



    // Helper to get random sub-array
    const getRandomTargets = (arr, count) => {
        const arrCopy = [...arr];
        const results = [];
        const limit = Math.min(arr.length, count);
        for (let i = 0; i < limit; i++) {
            const idx = Math.floor(Math.random() * arrCopy.length);
            results.push(arrCopy.splice(idx, 1)[0]);
        }
        return results;
    };

    // Apply Command and Passive combat-start hooks
    activeUnits.forEach(unit => {
        if (unit.isDead || !unit.equippedSkill) return;
        const skill = unit.equippedSkill;
        const level = skill.level || 1;
        const team = unit.team;
        const enemies = activeUnits.filter(u => u.team !== team && !u.isDead && !u.isBuilding);
        const allies = activeUnits.filter(u => u.team === team && !u.isDead && !u.isBuilding);
        
        if (skill.id === 'shengqi_lingdi') {
            const chance = [0.35, 0.45, 0.55][level - 1] || 0.35;
            if (Math.random() < chance) {
                const targets = getRandomTargets(enemies, 2);
                targets.forEach(target => {
                    applyStatusEffect(target, 'disarm', 0, 3000);
                    createFloatingNumber(target, '繳械', 'debuff');
                    addLog(`⚡ ${team === 'player' ? '己方' : '敵方'}${unit.name} 裝備的 [盛氣凌敵] 使 ${target.name} 繳械，持續 3 秒！`, 'skill');
                });
            }
        }
        else if (skill.id === 'bamen_jinsuo') {
            const reducVal = [0.25, 0.35, 0.45][level - 1] || 0.25;
            const targets = [...enemies].sort((a, b) => b.stats.wuli - a.stats.wuli).slice(0, 2);
            targets.forEach(target => {
                applyStatusEffect(target, 'bamen_debuff', reducVal, 5000);
                createFloatingNumber(target, '八門金鎖', 'debuff');
                addLog(`📐 ${team === 'player' ? '己方' : '敵方'}${unit.name} 裝備的 [八門金鎖陣] 降低 ${target.name} ${Math.round(reducVal * 100)}% 造成傷害，持續 5 秒！`, 'skill');
            });
        }
        else if (skill.id === 'zanbi_qifeng') {
            const reducVal = [0.30, 0.40, 0.50][level - 1] || 0.30;
            let highestZhiliUnit = allies.reduce((max, u) => u.stats.zhili > max.stats.zhili ? u : max, allies[0]);
            let highestWuliUnit = allies.reduce((max, u) => u.stats.wuli > max.stats.wuli ? u : max, allies[0]);
            
            if (highestZhiliUnit) {
                applyStatusEffect(highestZhiliUnit, 'zanbi_phys_reduc', reducVal, 5000);
                createFloatingNumber(highestZhiliUnit, '暫避其鋒', 'shield');
                addLog(`🛡️ ${team === 'player' ? '己方' : '敵方'}${unit.name} 裝備的 [暫避其鋒] 賦予 ${highestZhiliUnit.name} ${Math.round(reducVal * 100)}% 物理免傷，持續 5 秒！`, 'skill');
            }
            if (highestWuliUnit) {
                applyStatusEffect(highestWuliUnit, 'zanbi_magic_reduc', reducVal, 5000);
                createFloatingNumber(highestWuliUnit, '暫避其鋒', 'shield');
                addLog(`🛡️ ${team === 'player' ? '己方' : '敵方'}${unit.name} 裝備的 [暫避其鋒] 賦予 ${highestWuliUnit.name} ${Math.round(reducVal * 100)}% 謀略免傷，持續 5 秒！`, 'skill');
            }
        }
        else if (skill.id === 'yudi_pingzhang') {
            const reducVal = [0.15, 0.20, 0.25][level - 1] || 0.15;
            const targets = getRandomTargets(allies, 2);
            targets.forEach(target => {
                applyStatusEffect(target, 'yudi_reduc', reducVal, 5000);
                createFloatingNumber(target, '禦敵屏障', 'shield');
                addLog(`🛡️ ${team === 'player' ? '己方' : '敵方'}${unit.name} 裝備的 [禦敵屏障] 賦予 ${target.name} ${Math.round(reducVal * 100)}% 傷害減免，持續 5 秒！`, 'skill');
            });
        }
    });

    // Apply starting energy for Wei Intellects and Pillars of the State
    activeUnits.forEach(unit => {
        if (unit.team === 'player') {
            if (activeFates.includes('wei_intellects') && ['guo_jia', 'xun_yu', 'jia_xu', 'cheng_yu'].includes(unit.templateId)) {
                unit.energy = Math.min(100, unit.energy + 50);
            }
            if (activeFates.includes('pillars_state') && ['sima_yi', 'zhou_yu', 'zhuge_liang'].includes(unit.templateId)) {
                unit.energy = Math.min(100, unit.energy + 40);
            }
        } else if (unit.team === 'enemy') {
            if (oppActiveFates && oppActiveFates.includes('wei_intellects') && ['guo_jia', 'xun_yu', 'jia_xu', 'cheng_yu'].includes(unit.templateId)) {
                unit.energy = Math.min(100, unit.energy + 50);
            }
            if (oppActiveFates && oppActiveFates.includes('pillars_state') && ['sima_yi', 'zhou_yu', 'zhuge_liang'].includes(unit.templateId)) {
                unit.energy = Math.min(100, unit.energy + 40);
            }
        }
    });
    
    // Render starting battlefield units
    renderBattlefield();
}

export function startBattle() {
    lastTime = Date.now();
    battleTimer = setInterval(combatTick, combatTickInterval);
}

// ==========================================
// CUSTOM DYNAMIC TIMED ACTIVE SKILLS
// ==========================================
function castDuohunXiepo(caster) {
    if (caster.isDead) return;
    const isSilenced = caster.statusEffects.some(eff => eff.type === 'silence');
    if (isSilenced) return;

    const level = (caster.equippedSkill && caster.equippedSkill.level) || 1;
    const stealPct = [0.15, 0.19, 0.23][level - 1] || 0.15;
    
    const enemies = activeUnits.filter(u => u.team !== caster.team && !u.isDead && !u.isBuilding);
    if (enemies.length === 0) return;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    
    const stealWuli = Math.round(target.stats.wuli * stealPct);
    const stealZhili = Math.round(target.stats.zhili * stealPct);
    const stealTongshuai = Math.round(target.stats.tongshuai * stealPct);
    
    target.stats.wuli = Math.max(1, target.stats.wuli - stealWuli);
    target.stats.zhili = Math.max(1, target.stats.zhili - stealZhili);
    target.stats.tongshuai = Math.max(1, target.stats.tongshuai - stealTongshuai);
    
    caster.stats.wuli += stealWuli;
    caster.stats.zhili += stealZhili;
    caster.stats.tongshuai += stealTongshuai;
    
    applyStatusEffect(caster, 'stat_steal_buff', 0, 4000, {
        wuliSteal: stealWuli,
        zhiliSteal: stealZhili,
        tongshuaiSteal: stealTongshuai
    });
    
    applyStatusEffect(target, 'stat_steal_debuff', 0, 4000, {
        wuliSteal: stealWuli,
        zhiliSteal: stealZhili,
        tongshuaiSteal: stealTongshuai
    });
    
    createFloatingNumber(caster, '奪魂', 'shield');
    createFloatingNumber(target, '奪魂', 'dmg');
    addLog(`✨ ${caster.name} 發動戰法 [奪魂挾魄]，偷取 ${target.name} ${Math.round(stealPct * 100)}% 屬性（武力+${stealWuli}，智力+${stealZhili}，統率+${stealTongshuai}），持續 4 秒！`, 'skill');
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
                if (eff.type === 'wuli_shred') {
                    u.stats.wuli += eff.val;
                }
                if (eff.type === 'zhili_shred') {
                    u.stats.zhili += eff.val;
                }
                if (eff.type === 'tongshuai_shred') {
                    u.stats.tongshuai += eff.val;
                }
                if (eff.type === 'ma_chao_wuli_buff') {
                    u.stats.wuli = Math.max(1, u.stats.wuli - eff.val);
                }
                if (eff.type === 'zhechong_debuff') {
                    u.stats.zhili += eff.zhiliShred;
                    u.stats.tongshuai += eff.tongshuaiShred;
                }
                if (eff.type === 'lu_su_transfer_self') {
                    u.stats.wuli += eff.wuliLost;
                    u.stats.zhili += eff.zhiliLost;
                    u.stats.tongshuai += eff.tongshuaiLost;
                }
                if (eff.type === 'lu_su_transfer_ally') {
                    u.stats.wuli = Math.max(1, u.stats.wuli - eff.wuliGained);
                    u.stats.zhili = Math.max(1, u.stats.zhili - eff.zhiliGained);
                    u.stats.tongshuai = Math.max(1, u.stats.tongshuai - eff.tongshuaiGained);
                }
                if (eff.type === 'luli_tongxin_buff') {
                    u.stats.tongshuai = Math.max(1, u.stats.tongshuai - eff.val);
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
                    addLog(`🦅 司馬懿觸發 [用武通神]（第 ${u.yongWuCount} 階段）！`, 'skill');
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
                    healUnit(lowestAlly, healAmt, u);
                    createFloatingNumber(lowestAlly, '攜手禦敵', 'heal');
                }
                // Disarm 15%
                if (Math.random() < 0.15) {
                    const enemies = activeUnits.filter(other => !other.isDead && other.team !== u.team);
                    if (enemies.length > 0) {
                        const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        applyStatusEffect(randEnemy, 'disarm', 0, 2000);
                        createFloatingNumber(randEnemy, '繳械', 'shield');
                        addLog(`🤝 劉備的 [攜手禦敵] 使 ${randEnemy.name} 繳械 2 秒！`, 'skill');
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
                
                addLog(`💀 荀彧的驅虎吞狼詛咒對 ${u.name} 造成了 ${dmgAmt} 點傷害！`, 'damage');
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

        // Yuan Shu HP Drain Tick (Tuned down from 15% to 12% in balance pass)
        const ysBuffEffect = u.statusEffects.find(e => e.type === 'yuan_shu_buff');
        if (ysBuffEffect) {
            if (!ysBuffEffect.lastTick || now - ysBuffEffect.lastTick >= 1000) {
                ysBuffEffect.lastTick = now;
                const drainAmt = Math.round(u.hp * 0.12);
                if (drainAmt > 0) {
                    addLog(`🩸 袁術的反噬效果對自己造成了 ${drainAmt} 點自損傷害！`, 'damage');
                    takeDamage(u, drainAmt, 'skill');
                }
            }
        }

        // Cheng Yu Poison Command Tick [四面楚歌]
        if (u.templateId === 'cheng_yu' && !u.isDead) {
            if (!u.lastPoisonTime) {
                u.lastPoisonTime = now;
            }
            if (now - u.lastPoisonTime >= 5000) {
                u.lastPoisonTime = now;
                const enemies = activeUnits.filter(other => !other.isDead && other.team !== u.team);
                if (enemies.length > 0) {
                    createFloatingNumber(u, '四面楚歌', 'skill');
                    addLog(`💀 ${u.team === 'player' ? '己方' : '敵方'}程昱發動 [四面楚歌]！`, 'skill');
                    const limit = Math.min(enemies.length, 2);
                    const enemiesCopy = [...enemies];
                    for (let i = 0; i < limit; i++) {
                        const idx = Math.floor(Math.random() * enemiesCopy.length);
                        const enemy = enemiesCopy.splice(idx, 1)[0];
                        const dotVal = Math.round(u.stats.zhili * 0.3 * (1 + (u.skillLevel - 1) * 0.25));
                        applyStatusEffect(enemy, 'poison', dotVal, 3000);
                        createFloatingNumber(enemy, '中毒', 'dmg');
                    }
                }
            }
        }

        // Escape Bleed DoT Tick (Cheng Yu Active skill)
        const escapeEffect = u.statusEffects.find(e => e.type === 'escape_bleed');
        if (escapeEffect) {
            if (!escapeEffect.lastTick || now - escapeEffect.lastTick >= 1000) {
                escapeEffect.lastTick = now;
                takeDamage(u, escapeEffect.val, 'true_damage', escapeEffect.source);
            }
        }

        // Pang Tong Passive [士別三日] disarm/evade & explosion event
        if (u.templateId === 'pang_tong' && !u.isDead) {
            if (!u.combatStartTime) {
                u.combatStartTime = now;
                u.hasExploded = false;
                applyStatusEffect(u, 'disarm', 0, 4000);
                applyStatusEffect(u, 'evade', 40, 4000);
            }
            if (!u.hasExploded && now - u.combatStartTime >= 5000) {
                u.hasExploded = true;
                const enemies = activeUnits.filter(other => !other.isDead && other.team !== u.team);
                const baseDmg = Math.round(u.stats.zhili * 3.0 * (1 + (u.skillLevel - 1) * 0.25));
                createFloatingNumber(u, '士別三日', 'skill');
                addLog(`💥 ${u.team === 'player' ? '己方' : '敵方'}龐統觸發 [士別三日] 爆裂，對所有敵軍造成巨大謀略傷害！`, 'skill');
                enemies.forEach(enemy => {
                    takeDamage(enemy, baseDmg, 'skill', u);
                    createFloatingNumber(enemy, '士別三日', 'dmg');
                });
            }
        }

        // Custom Active/Periodic Skill [奪魂挾魄] (Duohun Xiepo) - Trigger every 5.5 seconds
        if (u.equippedSkill && u.equippedSkill.id === 'duohun_xiepo') {
            if (!u.lastDuohunTime) {
                u.lastDuohunTime = now;
            }
            if (now - u.lastDuohunTime >= 5500) {
                u.lastDuohunTime = now;
                const target = findClosestEnemy(u);
                if (target) {
                    const lvl = u.equippedSkill.level || 1;
                    const pct = [0.15, 0.19, 0.23][lvl - 1] || 0.15;
                    
                    const wuliSteal = Math.round(target.stats.wuli * pct);
                    const zhiliSteal = Math.round(target.stats.zhili * pct);
                    const tongshuaiSteal = Math.round(target.stats.tongshuai * pct);
                    
                    u.stats.wuli += wuliSteal;
                    u.stats.zhili += zhiliSteal;
                    u.stats.tongshuai += tongshuaiSteal;
                    
                    target.stats.wuli = Math.max(1, target.stats.wuli - wuliSteal);
                    target.stats.zhili = Math.max(1, target.stats.zhili - zhiliSteal);
                    target.stats.tongshuai = Math.max(1, target.stats.tongshuai - tongshuaiSteal);
                    
                    applyStatusEffect(u, 'stat_steal_buff', 0, 4000, { wuliSteal, zhiliSteal, tongshuaiSteal });
                    applyStatusEffect(target, 'stat_steal_debuff', 0, 4000, { wuliSteal, zhiliSteal, tongshuaiSteal });
                    
                    createFloatingNumber(u, '奪魂', 'heal');
                    createFloatingNumber(target, '屬性吸取', 'dmg');
                    addLog(`🔮 ${u.name} 裝備的 [奪魂挾魄] 奪取了 ${target.name} ${Math.round(pct * 100)}% 的屬性！`, 'skill');
                }
            }
        }

        // Custom Passive Skill [擊其惰歸] (Jiqi Duogui) - offensive trigger after 6 seconds of xu_wei
        const xuWeiIndex = u.statusEffects.findIndex(e => e.type === 'xu_wei');
        if (xuWeiIndex !== -1) {
            const eff = u.statusEffects[xuWeiIndex];
            if (now - eff.createdAt >= 6000) {
                u.statusEffects.splice(xuWeiIndex, 1);
                
                const lvl = (u.equippedSkill && u.equippedSkill.level) || 1;
                const mult = [2.15, 2.65, 3.15][lvl - 1] || 2.15;
                const dmg = Math.round(u.stats.wuli * mult);
                
                createFloatingNumber(u, '擊其惰歸', 'skill');
                addLog(`⚔️ [擊其惰歸] 進攻觸發：${u.name} 的「蓄威」滿 6 秒未受重創，對敵方全體造成物理蓄力重擊！`, 'skill');
                
                activeUnits.forEach(other => {
                    if (other.isDead || other.team === u.team) return;
                    takeDamage(other, dmg, 'skill', u, false);
                    createFloatingNumber(other, '擊其惰歸', 'dmg');
                });
            }
        }
    });
    
    // 2. Clean dead units
    activeUnits.forEach(u => {
        if (!u.isDead && u.hp <= 0) {
            u.isDead = true;
            u.hp = 0;
            addLog(`${u.team === 'player' ? '己方' : '敵方'}${u.name} 已被擊敗！`, u.team === 'player' ? 'damage' : 'victory');
            
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
                        addLog(`🦅 司馬懿吸取敗將之魂！疊加層數: ${other.simaYiDeathsCount}/8（全屬性增加 10%）`, 'skill');
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
            const gjBuff = u.statusEffects.find(e => e.type === 'guo_jia_buff');
            if (gjBuff) {
                const skillLvlMult = gjBuff.level || 1;
                const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                effectiveAtkSpeed *= (1 + 0.50 * multiplier);
            }
            const sqBuff = u.statusEffects.find(e => e.type === 'sun_quan_buff');
            if (sqBuff) {
                const skillLvlMult = sqBuff.level || 1;
                const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                effectiveAtkSpeed *= (1 + 0.30 * multiplier);
            }
            const rageBuff = u.statusEffects.find(e => e.type === 'lu_bu_rage');
            if (rageBuff) {
                const skillLvlMult = rageBuff.level || 1;
                const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                effectiveAtkSpeed *= (1 + 1.0 * multiplier);
            }
            
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
    
    const sqBuff = attacker.statusEffects.find(e => e.type === 'sun_quan_buff');
    if (sqBuff) {
        const skillLvlMult = sqBuff.level || 1;
        const multiplier = 1 + (skillLvlMult - 1) * 0.25;
        damage = Math.round(damage * (1 + 0.30 * multiplier));
    }
    const ysBuff = attacker.statusEffects.find(e => e.type === 'yuan_shu_buff');
    if (ysBuff) {
        const skillLvlMult = ysBuff.level || 1;
        const multiplier = 1 + (skillLvlMult - 1) * 0.25;
        damage = Math.round(damage * (1 + 0.80 * multiplier));
    }
    if (attacker.statusEffects.some(e => e.type === 'gang_yong')) {
        damage = Math.round(damage * 1.20);
    }
    if (attacker.statusEffects.some(e => e.type === 'guan_yu_wuli_buff')) {
        damage = Math.round(damage * 1.20);
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

    // Apply Guan Yu secondary passive [千裡走單騎] on attack
    if (attacker.templateId === 'guan_yu' && Math.random() < 0.30) {
        applyStatusEffect(attacker, 'resist', 1, 999999);
        applyStatusEffect(attacker, 'guan_yu_wuli_buff', 20, 3000);
        createFloatingNumber(attacker, '抵禦', 'shield');
        addLog(`🐎 關羽觸發 [千裡走單騎]！獲得抵禦效果與武力提升。`, 'skill');
    }

    // Apply damage to target
    takeDamage(target, damage, 'attack', attacker, isCrit);


    
    // Lu Bu Splash damage
    const rageBuff = attacker.statusEffects.find(e => e.type === 'lu_bu_rage');
    if (rageBuff) {
        const skillLvlMult = rageBuff.level || 1;
        const multiplier = 1 + (skillLvlMult - 1) * 0.25;
        const splashMult = 1.2 * multiplier; // Tuned down from 1.5 to 1.2 in balance pass
        const splashDmg = Math.round(damage * splashMult);
        activeUnits.forEach(other => {
            if (other.isDead || other.team === attacker.team || other === target) return;
            if (getDistance(target, other) <= 1) {
                takeDamage(other, splashDmg, 'attack', attacker, false);
                createFloatingNumber(other, '濺射', 'dmg');
            }
        });
    }

    // Ma Chao Splash damage
    const maChaoSplash = attacker.statusEffects.find(e => e.type === 'ma_chao_splash');
    if (maChaoSplash) {
        const splashDmg = Math.round(damage * 0.60);
        activeUnits.forEach(other => {
            if (other.isDead || other.team === attacker.team || other === target) return;
            if (getDistance(target, other) <= 1) {
                takeDamage(other, splashDmg, 'attack', attacker, false);
                createFloatingNumber(other, '濺射', 'dmg');
            }
        });
    }

    // Apply Tai Shici defense shred during his active skill
    if (attacker.templateId === 'tai_shici') {
        const shensheBuff = attacker.statusEffects.find(e => e.type === 'tai_shici_shenshe_buff');
        if (shensheBuff) {
            const shredAmount = Math.round(target.stats.tongshuai * 0.10);
            target.stats.tongshuai = Math.max(1, target.stats.tongshuai - shredAmount);
            applyStatusEffect(target, 'tongshuai_shred', shredAmount, 5000);
            createFloatingNumber(target, '破防', 'dmg');
        }
    }
    
    // Trigger Assault Skills immediately after basic attack
    const template = UNIT_TEMPLATES[attacker.templateId];
    if (template && template.extraSkillConfig && template.extraSkillConfig.type === 'assault') {
        const config = template.extraSkillConfig;
        if (Math.random() < config.chance) {
            triggerAssaultSkill(attacker, target, config);
        }
    }

    // Custom equipped Assault skill trigger
    if (attacker.equippedSkill && attacker.equippedSkill.type === 'assault' && !target.isDead) {
        const eqSkill = attacker.equippedSkill;
        const lvl = eqSkill.level || 1;
        if (eqSkill.id === 'qianggong') {
            const chance = 0.35;
            const duration = [2000, 3000, 4000][lvl - 1] || 2000;
            if (Math.random() < chance) {
                applyStatusEffect(attacker, 'double_attack', 0, duration);
                createFloatingNumber(attacker, '連擊', 'shield');
                addLog(`⚔️ ${attacker.name} 觸發突擊戰法 [強攻]！獲得連擊狀態，持續 ${duration / 1000} 秒！`, 'skill');
            }
        } else if (eqSkill.id === 'shouqi_daoluo') {
            const chance = 0.30;
            const mult = [1.00, 1.30, 1.60][lvl - 1] || 1.00;
            if (Math.random() < chance) {
                const extraDmg = Math.round(attacker.stats.wuli * mult);
                takeDamage(target, extraDmg, 'attack', attacker, false);
                createFloatingNumber(target, '手起刀落', 'dmg');
                addLog(`⚔️ ${attacker.name} 觸發突擊戰法 [手起刀落]！對 ${target.name} 額外造成 ${extraDmg} 點物理傷害！`, 'skill');
            }
        }
    }

    // Custom Passive Skill [奮突] (Fentu) trigger
    if (attacker.equippedSkill && attacker.equippedSkill.id === 'fentu' && !attacker.isDead) {
        const lvl = attacker.equippedSkill.level || 1;
        const incPct = [0.06, 0.08, 0.10][lvl - 1] || 0.06;
        if (!attacker.fentuStacks) attacker.fentuStacks = 0;
        if (attacker.fentuStacks < 3) {
            attacker.fentuStacks++;
            applyStatusEffect(attacker, 'fentu_buff', incPct, 9999999);
            createFloatingNumber(attacker, `奮突 x${attacker.fentuStacks}`, 'shield');
            addLog(`奮突：${attacker.name} 普攻觸發 [奮突]，物理傷害提升 ${Math.round(incPct * 100)}%（當前層數：${attacker.fentuStacks}）。`, 'skill');
        }
    }

    // royal_marriage Fate: Sun Shangxiang basic attack grants Liu Bei +5 energy
    if (attacker.templateId === 'sun_shangxiang') {
        const teamMarriage = attacker.team === 'player' ? activeFates.includes('royal_marriage') : (oppActiveFates && oppActiveFates.includes('royal_marriage'));
        if (teamMarriage) {
            const liuBei = activeUnits.find(u => !u.isDead && u.team === attacker.team && u.templateId === 'liu_bei');
            if (liuBei) {
                liuBei.energy = Math.min(100, liuBei.energy + 5);
                createFloatingNumber(liuBei, '+5 能量', 'heal');
                addLog(`💞 梟雄聯姻：孫尚香的普通攻擊使劉備額外獲得 5 點能量！`, 'skill');
            }
        }
    }

    // Five Tigers stun-on-hit Fate check
    const hasFiveTigers = attacker.team === 'player' ? activeFates.includes('five_tigers') : (oppActiveFates && oppActiveFates.includes('five_tigers'));
    if (hasFiveTigers && ['guan_yu', 'zhang_fei', 'zhao_yun', 'ma_chao'].includes(attacker.templateId)) {
        if (Math.random() < 0.25) {
            applyStatusEffect(target, 'stun', 0, 1000);
            createFloatingNumber(target, '震懾', 'shield');
            addLog(`⚡ 五虎上將！${attacker.name} 的普通攻擊使 ${target.name} 震懾 1 秒！`, 'skill');
        }
    }

    // Sun Shangxiang / Tai Shici Double attack effect (double_attack status)
    const doubleAttackEffect = attacker.statusEffects.find(e => e.type === 'double_attack');
    const taiShiciShensheBuff = attacker.statusEffects.find(e => e.type === 'tai_shici_shenshe_buff');
    const needsDoubleHit = doubleAttackEffect || (attacker.templateId === 'tai_shici' && taiShiciShensheBuff);
    if (needsDoubleHit && !attacker.isDoubleAttacking) {
        attacker.isDoubleAttacking = true;
        setTimeout(() => {
            if (!attacker.isDead && !target.isDead) {
                performAttack(attacker, target, Date.now());
            }
            attacker.isDoubleAttacking = false;
        }, 100);
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
    
    // Fates / Synergies: Wu Commanders burn on attack & energy gain
    const hasWuCommander = attacker.team === 'player' ? activeFates.includes('wu_commander') : (oppActiveFates && oppActiveFates.includes('wu_commander'));
    if (hasWuCommander && ['zhou_yu', 'lu_xun', 'lu_su'].includes(attacker.templateId)) {
        const isBurned = target.statusEffects.some(e => e.type === 'burn');
        if (isBurned) {
            attacker.energy = Math.min(100, attacker.energy + 10);
            addLog(`🔥 東吳大都督！${attacker.name} 攻擊已灼燒目標，額外恢復 10 點能量！`, 'skill');
        } else if (Math.random() < 0.40) {
            const burnDmg = Math.round(attacker.stats.zhili * 0.25);
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
    addLog(`⚡ 突擊戰法！${attacker.name} 發動戰法 [${name}]（${attacker.skillLevel} 級）！`, 'skill');

    switch (attacker.templateId) {
        case 'sun_quan': {
            const dmg = Math.round(attacker.stats.zhili * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '兵無常勢', 'skill');
            takeDamage(target, dmg, 'skill', attacker, false);
            healUnit(attacker, dmg, attacker);
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
                createFloatingNumber(lowestEnemy, '濺射', 'dmg');
            }
            break;
        }
        case 'ma_chao': {
            const dmg = Math.round(attacker.stats.wuli * config.dmgMult * levelMult);
            createFloatingNumber(attacker, '一騎當千', 'skill');
            activeUnits.forEach(other => {
                if (other.isDead || other.team === attacker.team) return;
                if (getDistance(target, other) <= config.radius || other === target) {
                    takeDamage(other, dmg, 'skill', attacker, false);
                    createFloatingNumber(other, '一騎當千', 'dmg');
                }
            });
            break;
        }
        case 'sun_shangxiang': {
            createFloatingNumber(attacker, '強攻', 'skill');
            applyStatusEffect(attacker, 'double_attack', 0, config.durationSec * 1000);
            break;
        }
        case 'tai_shici': {
            createFloatingNumber(attacker, '折衝禦侮', 'skill');
            
            const zhiliShred = Math.round(target.stats.zhili * config.debuffPct);
            const tongshuaiShred = Math.round(target.stats.tongshuai * config.debuffPct);
            target.stats.zhili = Math.max(1, target.stats.zhili - zhiliShred);
            target.stats.tongshuai = Math.max(1, target.stats.tongshuai - tongshuaiShred);
            
            applyStatusEffect(target, 'zhechong_debuff', 0, 3000, {
                zhiliShred,
                tongshuaiShred
            });
            createFloatingNumber(target, '折衝破防', 'dmg');
            
            let lowestDefAlly = null;
            let minDef = Infinity;
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== attacker.team) return;
                if (other.stats.tongshuai < minDef) {
                    minDef = other.stats.tongshuai;
                    lowestDefAlly = other;
                }
            });
            if (lowestDefAlly) {
                applyStatusEffect(lowestDefAlly, 'resist', 1, config.shieldDurationSec * 1000);
                createFloatingNumber(lowestDefAlly, '折衝禦侮', 'shield');
                addLog(`🛡️ 太史慈的 [折衝禦侮] 為 ${lowestDefAlly.name} 施加了格擋防護！`, 'skill');
            }
            break;
        }
    }
}

export function takeDamage(unit, amount, type = 'attack', source = null, isCrit = false, isChainShared = false) {
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

    // Jiang Wei passive [文武雙全] ramp wuli & zhili on damage deal
    if (source && source.templateId === 'jiang_wei' && !source.isDead) {
        if (!source.wenWuStacks) source.wenWuStacks = 0;
        if (source.wenWuStacks < 5) {
            source.wenWuStacks++;
            const baseTemplate = UNIT_TEMPLATES.jiang_wei;
            const starScale = source.star === 1 ? 1.0 : source.star === 2 ? 1.8 : 3.2;
            const baseWuli = Math.round(baseTemplate.wuli * starScale);
            const baseZhili = Math.round(baseTemplate.zhili * starScale);
            
            source.stats.wuli += Math.round(baseWuli * 0.03);
            source.stats.zhili += Math.round(baseZhili * 0.03);
            createFloatingNumber(source, `文武 x${source.wenWuStacks}`, 'heal');
        }
    }

    let netDmg = amount;
    
    let reductionMult = 1;

    if (type === 'true_damage') {
        reductionMult = 1; // True damage bypasses defense entirely
    } else {
        // Apply damage reduction defenses from Command (tongshuai)
        let defense = unit.stats.tongshuai;
        
        // Chuanci ignore defense check
        if (source && type === 'attack' && source.equippedSkill && source.equippedSkill.id === 'chuanci') {
            const lvl = source.equippedSkill.level || 1;
            const ignorePct = [0.10, 0.15, 0.20][lvl - 1] || 0.10;
            defense = Math.round(defense * (1 - ignorePct));
        }
        
        // Buff defenses
        const ysBuff = unit.statusEffects.find(e => e.type === 'yuan_shao_def_buff');
        if (ysBuff) {
            const skillLvlMult = ysBuff.level || 1;
            const multiplier = 1 + (skillLvlMult - 1) * 0.25;
            defense = Math.round(defense * (1 + 0.40 * multiplier));
        }
        
        const sqBuff = unit.statusEffects.find(e => e.type === 'sun_quan_buff');
        if (sqBuff) {
            const skillLvlMult = sqBuff.level || 1;
            const multiplier = 1 + (skillLvlMult - 1) * 0.25;
            defense = Math.round(defense * (1 + 0.30 * multiplier));
        }
        
        const shredEffect = unit.statusEffects.find(e => e.type === 'shred');
        if (shredEffect) {
            const stacks = shredEffect.stacks || 2.5; // Zhang Fei is 25% (2.5 stacks equivalent)
            const reductionPct = Math.min(stacks * 0.10, 0.50); // 10% per stack, max 50%
            defense = Math.round(defense * (1 - reductionPct));
        }

        // Xun Yu Wang Zuo defense aura: +20% Tongshuai to adjacent allies
        const hasAdjXunYu = activeUnits.some(u => !u.isDead && u.team === unit.team && u.templateId === 'xun_yu' && getDistance(unit, u) <= 1);
        if (hasAdjXunYu) {
            defense = Math.round(defense * 1.20);
        }

        reductionMult = 1 - (defense / (defense + 250));
        
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
            const skillLvlMult = gjBuff.level || 1;
            const multiplier = 1 + (skillLvlMult - 1) * 0.25;
            const reductionPct = Math.min(0.30 * multiplier, 0.90); // Cap at 90% reduction
            reductionMult *= (1 - reductionPct);
        }
        
        // Zhao Yun Skill damage reduction override
        if (unit.templateId === 'zhao_yun') {
            const diveReduction = unit.statusEffects.find(e => e.type === 'zhao_yun_dive');
            if (diveReduction) {
                const skillLvlMult = diveReduction.level || 1;
                const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                const baseReduction = Math.min(0.50 * multiplier, 0.90);
                reductionMult *= (1 - baseReduction);
                
                // Extra Command (tongshuai) reduction if attacker is one of pushed units
                if (source && diveReduction.pushedIds.includes(source.id)) {
                    const commandDmgReduction = Math.min((unit.stats.tongshuai / 200) * multiplier, 0.75);
                    reductionMult *= (1 - commandDmgReduction);
                }
            }
        }

        // Apply 暫避其鋒 (Zanbi Qifeng) damage reductions
        const isPhysical = (type === 'attack') || (source && source.stats.wuli > source.stats.zhili);
        const isMagic = (type === 'skill' || type === 'burn' || type === 'poison') && (source && source.stats.zhili >= source.stats.wuli);
        if (isPhysical) {
            const zanbiPhys = unit.statusEffects.find(e => e.type === 'zanbi_phys_reduc');
            if (zanbiPhys) {
                reductionMult *= (1 - zanbiPhys.val);
            }
        }
        if (isMagic) {
            const zanbiMagic = unit.statusEffects.find(e => e.type === 'zanbi_magic_reduc');
            if (zanbiMagic) {
                reductionMult *= (1 - zanbiMagic.val);
            }
        }
        
        // Apply 禦敵屏障 (Yudi Pingzhang) damage reduction
        const yudiBuff = unit.statusEffects.find(e => e.type === 'yudi_reduc');
        if (yudiBuff) {
            reductionMult *= (1 - yudiBuff.val);
        }
    }

    // Apply 八門金鎖陣 (Bamen Jinsuo) damage dealt reduction
    if (source) {
        const bamenDebuff = source.statusEffects.find(e => e.type === 'bamen_debuff');
        if (bamenDebuff) {
            netDmg = Math.round(netDmg * (1 - bamenDebuff.val));
        }
    }
    
    // Apply Fentu (奮突) physical damage buff
    const isPhysical = (type === 'attack') || (source && source.stats.wuli > source.stats.zhili);
    if (source && isPhysical) {
        const fentuEffects = source.statusEffects.filter(e => e.type === 'fentu_buff');
        if (fentuEffects.length > 0) {
            let fentuMult = 1;
            fentuEffects.forEach(e => fentuMult += e.val);
            netDmg = Math.round(netDmg * fentuMult);
        }
    }
    
    netDmg = Math.round(netDmg * reductionMult);
    if (netDmg <= 0) netDmg = 1; // Minimum 1 damage
    
    // Custom Passive Skill [擊其惰歸] (Jiqi Duogui) defensive trigger
    const xuWeiIndex = unit.statusEffects.findIndex(e => e.type === 'xu_wei');
    if (xuWeiIndex !== -1 && netDmg >= (unit.hpMax * 0.40)) {
        unit.statusEffects.splice(xuWeiIndex, 1);
        applyStatusEffect(unit, 'evade', 100, 2000);
        
        // Heal self: 20% * (1 + wuli/150)
        const healPct = 0.20 * (1 + unit.stats.wuli / 150);
        const healVal = Math.round(unit.hpMax * healPct);
        healUnit(unit, healVal, unit);
        createFloatingNumber(unit, '規避/回血', 'heal');
        addLog(`🛡️ [擊其惰歸] 防守觸發：${unit.name} 受到單次重創（大於40%生命值），消耗「蓄威」獲得 100% 規避 2 秒，並恢復自身 ${healVal} 點生命值！`, 'skill');
        return; // Current damage negated
    }
    
    // Handle Shield absorption first
    if (unit.shield > 0) {
        if (unit.shield >= netDmg) {
            unit.shield -= netDmg;
            createFloatingNumber(unit, netDmg, 'shield');
            playSound('hit');
            
            // Share 30% of absorbed damage to linked units
            if (unit.statusEffects.some(e => e.type === 'iron_chain') && !isChainShared) {
                const chainAllies = activeUnits.filter(other => !other.isDead && other.team === unit.team && other !== unit && other.statusEffects.some(e => e.type === 'iron_chain'));
                chainAllies.forEach(ally => {
                    takeDamage(ally, Math.round(netDmg * 0.30), 'true_damage', source, false, true);
                });
            }
            return;
        } else {
            const bleedDmg = netDmg - unit.shield;
            // Shield absorbed some
            const absorbed = unit.shield;
            unit.shield = 0;
            
            // Share 30% of absorbed + bleed damage to linked units
            if (unit.statusEffects.some(e => e.type === 'iron_chain') && !isChainShared) {
                const chainAllies = activeUnits.filter(other => !other.isDead && other.team === unit.team && other !== unit && other.statusEffects.some(e => e.type === 'iron_chain'));
                chainAllies.forEach(ally => {
                    takeDamage(ally, Math.round(netDmg * 0.30), 'true_damage', source, false, true);
                });
            }
            netDmg = bleedDmg;
        }
    } else {
        // No shield, share 30% of netDmg directly
        if (unit.statusEffects.some(e => e.type === 'iron_chain') && !isChainShared) {
            const chainAllies = activeUnits.filter(other => !other.isDead && other.team === unit.team && other !== unit && other.statusEffects.some(e => e.type === 'iron_chain'));
            chainAllies.forEach(ally => {
                takeDamage(ally, Math.round(netDmg * 0.30), 'true_damage', source, false, true);
            });
        }
    }
    
    unit.hp = Math.max(unit.hp - netDmg, 0);
    unit.damageTaken = (unit.damageTaken || 0) + netDmg;
    
    if (source) {
        source.damageDealt = (source.damageDealt || 0) + netDmg;
    }
    
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
            healUnit(unit, healAmt, xunYu);
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
                healUnit(source, healAmt, source);
            }
        }
    }

    // Custom Passive Skill [救援] (Jiuyuan) trigger
    if (unit.equippedSkill && unit.equippedSkill.id === 'jiuyuan' && !unit.isDead) {
        const lvl = unit.equippedSkill.level || 1;
        const chance = [0.30, 0.40, 0.50][lvl - 1] || 0.30;
        const healPct = [0.30, 0.40, 0.50][lvl - 1] || 0.30;
        if (Math.random() < chance) {
            const healVal = Math.round(unit.stats.zhili * healPct);
            healUnit(unit, healVal, unit);
            createFloatingNumber(unit, '救援', 'heal');
            addLog(`🏥 ${unit.name} 受到傷害，觸發被動戰法 [救援] 自身恢復 ${healVal} 點生命值！`, 'skill');
        }
    }

    // Update reference HP for surviving buildings in state
    if (unit.team === 'player' && unit.boardReference) {
        unit.boardReference.hp = unit.hp;
    }
}

function healUnit(unit, amount, source = null) {
    if (unit.isDead) return;
    if (unit.statusEffects.some(e => e.type === 'no_heal')) {
        createFloatingNumber(unit, '禁療', 'shield');
        return;
    }
    
    const healVal = Math.min(amount, unit.hpMax - unit.hp);
    if (healVal <= 0) return;
    
    unit.hp += healVal;
    createFloatingNumber(unit, healVal, 'heal');
    playSound('heal');
    
    if (source) {
        source.healingDone = (source.healingDone || 0) + healVal;
    }

    // Apply royal_marriage Fate: Liu Bei heals Sun Shangxiang -> grant 100% equivalent shield
    const teamMarriage = unit.team === 'player' ? activeFates.includes('royal_marriage') : (oppActiveFates && oppActiveFates.includes('royal_marriage'));
    if (source && source.templateId === 'liu_bei' && unit.templateId === 'sun_shangxiang' && teamMarriage && source.team === unit.team) {
        const shieldAmt = healVal;
        if (shieldAmt > 0) {
            addShield(unit, shieldAmt, 3);
            addLog(`💞 梟雄聯姻：${unit.team === 'player' ? '己方' : '敵方'}劉備對孫尚香的治療轉化為 ${shieldAmt} 點護盾（持續 3 秒）！`, 'skill');
        }
    }
    
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
        healUnit(target, amount, healer);
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
    const opponentTeam = unit.team === 'player' ? 'enemy' : 'player';
    const zhuge = activeUnits.find(u => !u.isDead && u.team === opponentTeam && u.templateId === 'zhuge_liang');
    if (zhuge && Math.random() < 0.35) {
        addLog(`🔮 ${opponentTeam === 'player' ? '己方' : '敵方'}諸葛亮觸發 [神機妙算]，成功打斷並計窮了 ${unit.name}！`, 'skill');
        createFloatingNumber(unit, '施法中斷', 'shield');
        applyStatusEffect(unit, 'silence', 0, 2000);
        const counterDmg = Math.round(zhuge.stats.zhili * 1.5 * (1 + (zhuge.skillLevel - 1) * 0.25));
        takeDamage(unit, counterDmg, 'skill', zhuge, false);
        unit.energy = 0; // Consume their energy anyway
        return;
    }

    // Custom Passive [擊其惰歸] (Jiqi Duogui) - gain xu_wei status when casting/full energy
    if (unit.equippedSkill && unit.equippedSkill.id === 'jiqi_duogui') {
        const hasXuWei = unit.statusEffects.some(e => e.type === 'xu_wei');
        if (!hasXuWei) {
            unit.statusEffects.push({
                type: 'xu_wei',
                val: 0,
                expiry: Date.now() + 9999999, // practically infinite until consumed
                createdAt: Date.now()
            });
            createFloatingNumber(unit, '蓄威', 'shield');
            addLog(`🛡️ [擊其惰歸] 觸發：${unit.name} 能量充滿，獲得「蓄威」狀態！`, 'skill');
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
    addLog(`✨ ${unit.name} 發動主動戰法 [${template.skillName}]（${unit.skillLevel} 級）！`, 'skill');
    
    switch (config.type) {
        case 'sima_yi_aoe': {
            const dmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
            let totalDmgDealt = 0;
            activeUnits.forEach(other => {
                if (other.isDead || other.team === unit.team) return;
                let defense = other.stats.tongshuai;
                const ysBuff = other.statusEffects.find(e => e.type === 'yuan_shao_def_buff');
                if (ysBuff) {
                    const skillLvlMult = ysBuff.level || 1;
                    const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                    defense = Math.round(defense * (1 + 0.40 * multiplier));
                }
                const sqBuff = other.statusEffects.find(e => e.type === 'sun_quan_buff');
                if (sqBuff) {
                    const skillLvlMult = sqBuff.level || 1;
                    const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                    defense = Math.round(defense * (1 + 0.30 * multiplier));
                }
                
                let reductionMult = 1 - (defense / (defense + 250));
                const lbBuff = other.statusEffects.find(e => e.type === 'liu_bei_buff');
                if (lbBuff) reductionMult *= (1 - (lbBuff.val / 100));
                const gjBuff = other.statusEffects.find(e => e.type === 'guo_jia_buff');
                if (gjBuff) {
                    const skillLvlMult = gjBuff.level || 1;
                    const multiplier = 1 + (skillLvlMult - 1) * 0.25;
                    const reductionPct = Math.min(0.30 * multiplier, 0.90);
                    reductionMult *= (1 - reductionPct);
                }
                
                let netDmg = Math.round(dmg * reductionMult);
                if (netDmg <= 0) netDmg = 1;
                
                totalDmgDealt += netDmg;
                takeDamage(other, netDmg, 'skill', unit);
            });
            if (totalDmgDealt > 0) {
                healUnit(unit, totalDmgDealt, unit);
                addLog(`🦅 司馬懿的 [鷹視狼顧] 共造成 ${totalDmgDealt} 點傷害，並為自身治療 ${totalDmgDealt} 生命值！`, 'skill');
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
            applyStatusEffect(unit, 'lu_bu_rage', 1, buffDur, { level: unit.skillLevel });
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
                applyStatusEffect(highestDmgEnemy, 'charm', 0, charmDur, { level: unit.skillLevel });
                createFloatingNumber(highestDmgEnemy, '魅惑', 'shield');
                addLog(`🌸 貂蟬魅惑了 ${highestDmgEnemy.name} 3 秒！`, 'skill');
                
                if (activeFates.includes('hero_beauty')) {
                    const luBu = activeUnits.find(u => !u.isDead && u.team === unit.team && u.templateId === 'lu_bu');
                    if (luBu) {
                        const transferPct = Math.min(config.statTransferPct * skillLvlMult, 1.0);
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
                        addLog(`💖 英雄美人！呂布繼承了 ${highestDmgEnemy.name} 50% 的屬性。`, 'skill');
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
                            healUnit(other, healValue, unit);
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
                healUnit(other, caoHeal, unit);
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
            applyStatusEffect(unit, 'zhao_yun_dive', 0, config.durationSec * 1000, { pushedIds, level: unit.skillLevel });
            break;

        case 'liu_bei_heal':
            const lbHealVal = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team) return;
                if (getDistance(unit, other) <= config.radius) {
                    healUnit(other, lbHealVal, unit);
                    const lbDmgReduc = Math.round(config.dmgReduc * 100 * skillLvlMult);
                    applyStatusEffect(other, 'liu_bei_buff', Math.min(lbDmgReduc, 90), config.durationSec * 1000);
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
                applyStatusEffect(maxHPEnergyEnemy, 'xun_yu_curse', 0, config.durationSec * 1000, { level: unit.skillLevel, casterZhili: unit.stats.zhili });
                createFloatingNumber(maxHPEnergyEnemy, '詛咒', 'dmg');
                addLog(`💀 荀彧對 ${maxHPEnergyEnemy.name} 施加了驅虎吞狼詛咒！`, 'skill');
            }
            break;

        case 'sun_quan_buff':
            applyStatusEffect(unit, 'sun_quan_buff', Math.round(config.buffPct * 100), config.durationSec * 1000, { level: unit.skillLevel });
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
                    
                    createFloatingNumber(unit, '奪魂', 'heal');
                    createFloatingNumber(targetEnemy, '屬性吸取', 'dmg');
                    addLog(`🔥 周瑜觸發 [奪魂挾魄] 奪取了 ${targetEnemy.name} 15% 的屬性！`, 'skill');
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
                addLog(`🔥 陸遜對 ${targetEnemy.name} 發動火燒連營！`, 'skill');
                takeDamage(targetEnemy, lxDmg, 'skill', unit);
                
                if (isBurned) {
                    addLog(`💥 火勢蔓延！從 ${targetEnemy.name} 身上爆裂並擴散了灼燒狀態！`, 'skill');
                    const splashDmg = Math.round(unit.stats.zhili * config.splashDmgMult * skillLvlMult);
                    const burnVal = Math.round(unit.stats.zhili * 0.15 * skillLvlMult);
                    activeUnits.forEach(other => {
                        if (other.isDead || other.team === unit.team || other === targetEnemy) return;
                        if (getDistance(targetEnemy, other) <= 1) {
                            takeDamage(other, splashDmg, 'skill', unit);
                            applyStatusEffect(other, 'burn', burnVal, 4000);
                            createFloatingNumber(other, '灼燒擴散', 'dmg');
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
                applyStatusEffect(other, 'yuan_shao_def_buff', 1, config.durationSec * 1000, { level: unit.skillLevel });
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
            createFloatingNumber(unit, '偽帝登基', 'shield');
            break;

        case 'jiang_wei_multi': {
            let target = findClosestEnemy(unit);
            if (target) {
                if (!unit.castCount) unit.castCount = 0;
                unit.castCount++;
                const isOdd = unit.castCount % 2 === 1;
                
                if (isOdd) {
                    const dmg = Math.round(unit.stats.wuli * config.dmgMult * skillLvlMult);
                    takeDamage(target, dmg, 'skill', unit, false);
                    createFloatingNumber(target, '義膽雄心', 'dmg');
                    
                    const shredVal = Math.round(target.stats.wuli * config.debuffPct);
                    target.stats.wuli = Math.max(1, target.stats.wuli - shredVal);
                    applyStatusEffect(target, 'wuli_shred', shredVal, config.durationSec * 1000);
                    addLog(`⚔️ 姜維施展 [義膽雄心]（第 ${unit.castCount} 次，物理）對 ${target.name} 造成 ${dmg} 點物理傷害並降低其 20% 武力！`, 'skill');
                } else {
                    const dmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
                    takeDamage(target, dmg, 'skill', unit, false);
                    createFloatingNumber(target, '義膽雄心', 'dmg');
                    
                    const shredVal = Math.round(target.stats.zhili * config.debuffPct);
                    target.stats.zhili = Math.max(1, target.stats.zhili - shredVal);
                    applyStatusEffect(target, 'zhili_shred', shredVal, config.durationSec * 1000);
                    addLog(`🔮 姜維施展 [義膽雄心]（第 ${unit.castCount} 次，魔法）對 ${target.name} 造成 ${dmg} 點謀略傷害並降低其 20% 智力！`, 'skill');
                }
            }
            break;
        }

        case 'ma_chao_buff': {
            const wuliBuffVal = Math.round(unit.stats.wuli * config.wuliBuff);
            unit.stats.wuli += wuliBuffVal;
            applyStatusEffect(unit, 'ma_chao_wuli_buff', wuliBuffVal, config.durationSec * 1000);
            applyStatusEffect(unit, 'ma_chao_splash', 0, config.durationSec * 1000);
            createFloatingNumber(unit, '槊血作氣', 'shield');
            addLog(`🐎 馬超發動 [槊血作氣]！獲得 +50% 武力並獲得濺射攻擊效果，持續 5 秒！`, 'skill');
            break;
        }

        case 'pang_tong_chain': {
            const enemies = activeUnits.filter(other => !other.isDead && other.team !== unit.team);
            if (enemies.length > 0) {
                const targets = [];
                const enemiesCopy = [...enemies];
                const limit = Math.min(enemiesCopy.length, config.targetCount);
                for (let i = 0; i < limit; i++) {
                    const idx = Math.floor(Math.random() * enemiesCopy.length);
                    targets.push(enemiesCopy.splice(idx, 1)[0]);
                }
                
                targets.forEach(target => {
                    applyStatusEffect(target, 'iron_chain', 0, config.durationSec * 1000);
                    createFloatingNumber(target, '鐵索連環', 'shield');
                    addLog(`⛓️ 龐統發動 [連環計]，將 ${target.name} 鏈接在一起！`, 'skill');
                });
            }
            break;
        }

        case 'jia_xu_confusion': {
            const enemies = activeUnits.filter(other => !other.isDead && other.team !== unit.team);
            if (enemies.length > 0) {
                const enemiesCopy = [...enemies];
                const limit = Math.min(enemiesCopy.length, config.targetCount);
                for (let i = 0; i < limit; i++) {
                    const idx = Math.floor(Math.random() * enemiesCopy.length);
                    const target = enemiesCopy.splice(idx, 1)[0];
                    
                    const isConfused = target.statusEffects.some(e => e.type === 'confusion');
                    if (isConfused) {
                        const dmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
                        takeDamage(target, dmg, 'skill', unit, false);
                        createFloatingNumber(target, '神機莫測', 'dmg');
                        addLog(`🔮 賈詡對已被混亂的 ${target.name} 追加造成 ${dmg} 點謀略傷害！`, 'skill');
                    } else {
                        applyStatusEffect(target, 'confusion', 0, config.confuseDurationSec * 1000);
                        createFloatingNumber(target, '混亂', 'shield');
                        addLog(`🔮 賈詡使 ${target.name} 混亂 3 秒！`, 'skill');
                    }
                }
            }
            
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team) return;
                const confIndex = other.statusEffects.findIndex(e => e.type === 'confusion');
                if (confIndex !== -1) {
                    other.statusEffects.splice(confIndex, 1);
                    const healAmt = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
                    healUnit(other, healAmt, unit);
                    createFloatingNumber(other, '清心', 'heal');
                    addLog(`🔮 賈詡解除了盟友 ${other.name} 的混亂狀態，並恢復其 ${healAmt} 點生命值！`, 'skill');
                }
            });
            break;
        }

        case 'cheng_yu_ambush': {
            const debuffs = ['stun', 'silence', 'disarm', 'confusion', 'burn', 'poison', 'bleed', 'shred', 'wuli_shred', 'zhili_shred', 'tongshuai_shred', 'zhechong_debuff', 'bamen_debuff'];
            const enemies = activeUnits.filter(other => !other.isDead && other.team !== unit.team);
            enemies.forEach(target => {
                const hasDebuff = target.statusEffects.some(e => debuffs.includes(e.type));
                if (hasDebuff) {
                    const dmg = Math.round(unit.stats.zhili * config.dmgMult * skillLvlMult);
                    takeDamage(target, dmg, 'skill', unit, false);
                    createFloatingNumber(target, '十面埋伏', 'dmg');
                    
                    applyStatusEffect(target, 'no_heal', 0, config.durationSec * 1000);
                    
                    const dotAmt = Math.round(unit.stats.zhili * config.dotMult * skillLvlMult);
                    applyStatusEffect(target, 'escape_bleed', dotAmt, config.durationSec * 1000, { source: unit });
                    createFloatingNumber(target, '禁療逃兵', 'shield');
                    addLog(`💀 程昱對負面狀態下的 ${target.name} 造成 ${dmg} 點謀略傷害，並附加禁療與逃兵（持續4秒）！`, 'skill');
                }
            });
            break;
        }

        case 'lu_su_transfer': {
            let lowestAlly = null;
            let minHpRatio = 1.1;
            activeUnits.forEach(other => {
                if (other.isDead || other.team !== unit.team || other === unit) return;
                const ratio = other.hp / other.hpMax;
                if (ratio < minHpRatio) {
                    minHpRatio = ratio;
                    lowestAlly = other;
                }
            });
            
            if (lowestAlly) {
                const healAmt = Math.round(unit.stats.zhili * config.healMult * skillLvlMult);
                healUnit(lowestAlly, healAmt, unit);
                
                const wuliTransfer = Math.round(unit.stats.wuli * config.transferPct);
                const zhiliTransfer = Math.round(unit.stats.zhili * config.transferPct);
                const tongshuaiTransfer = Math.round(unit.stats.tongshuai * config.transferPct);
                
                unit.stats.wuli = Math.max(1, unit.stats.wuli - wuliTransfer);
                unit.stats.zhili = Math.max(1, unit.stats.zhili - zhiliTransfer);
                unit.stats.tongshuai = Math.max(1, unit.stats.tongshuai - tongshuaiTransfer);
                
                lowestAlly.stats.wuli += wuliTransfer;
                lowestAlly.stats.zhili += zhiliTransfer;
                lowestAlly.stats.tongshuai += tongshuaiTransfer;
                
                applyStatusEffect(unit, 'lu_su_transfer_self', 0, config.durationSec * 1000, {
                    wuliLost: wuliTransfer,
                    zhiliLost: zhiliTransfer,
                    tongshuaiLost: tongshuaiTransfer
                });
                
                applyStatusEffect(lowestAlly, 'lu_su_transfer_ally', 0, config.durationSec * 1000, {
                    wuliGained: wuliTransfer,
                    zhiliGained: zhiliTransfer,
                    tongshuaiGained: tongshuaiTransfer
                });
                
                createFloatingNumber(unit, '濟貧', 'shield');
                createFloatingNumber(lowestAlly, '受濟', 'heal');
                addLog(`🤝 魯肅施展 [濟貧難施] 治療 ${lowestAlly.name} ${healAmt} 生命，並移交 30% 屬性！`, 'skill');
            }
            break;
        }

        case 'sun_shangxiang_gongyao': {
            let target = findClosestEnemy(unit);
            if (target) {
                const buffs = ['lifesteal', 'insight', 'evade', 'shield_dur', 'formation_fengshi_back', 'sun_quan_buff', 'double_attack', 'lu_su_transfer_ally', 'ma_chao_wuli_buff', 'resist'];
                const buffCount = unit.statusEffects.filter(e => buffs.includes(e.type)).length;
                
                const bonusMult = 1 + (buffCount * config.bonusDmgPerBuff);
                const dmg = Math.round(unit.stats.wuli * config.dmgMult * bonusMult * skillLvlMult);
                takeDamage(target, dmg, 'skill', unit, false);
                createFloatingNumber(target, '弓腰姬', 'dmg');
                
                if (buffCount > 0) {
                    const healAmt = Math.round(unit.stats.zhili * config.healMult * buffCount * skillLvlMult);
                    healUnit(unit, healAmt, unit);
                    createFloatingNumber(unit, '活性恢復', 'heal');
                    addLog(`🏹 孫尚香觸發 [弓腰姬] 增幅（${buffCount} 個增益），額外提升傷害並治療自身 ${healAmt} 生命！`, 'skill');
                } else {
                    addLog(`🏹 孫尚香發動 [弓腰姬] 對 ${target.name} 造成 ${dmg} 點物理傷害！`, 'skill');
                }
            }
            break;
        }

        case 'tai_shici_shenshe': {
            applyStatusEffect(unit, 'tai_shici_shenshe_buff', 0, config.durationSec * 1000);
            createFloatingNumber(unit, '神射', 'shield');
            addLog(`🏹 太史慈發動 [神射]！普通攻擊改為連擊，每次攻擊降低目標 10% 統率，持續 5 秒！`, 'skill');
            break;
        }
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

    // Tianshui Miracle Synergy Active energy gain check
    const hasTianshui = unit.team === 'player' ? activeFates.includes('tianshui_miracle') : (oppActiveFates && oppActiveFates.includes('tianshui_miracle'));
    if (hasTianshui && ['zhuge_liang', 'zhao_yun', 'jiang_wei'].includes(unit.templateId)) {
        unit.energy = Math.min(100, unit.energy + 10);
        addLog(`🔮 天水奇謀！${unit.name} 施放主動戰法，額外獲得 10 點能量！`, 'skill');
    }

    // Custom Equippable Active Skill trigger
    if (unit.equippedSkill && unit.equippedSkill.type === 'active') {
        executeEquippedActiveSkill(unit);
    }
}

function executeEquippedActiveSkill(unit) {
    if (unit.isDead) return;
    const skill = unit.equippedSkill;
    const lvl = skill.level || 1;
    
    // Silence check
    const isSilenced = unit.statusEffects.some(eff => eff.type === 'silence');
    if (isSilenced) return;
    
    addLog(`✨ ${unit.name} 發動裝備主動戰法 [${skill.name}]（${lvl} 級）！`, 'skill');
    createFloatingNumber(unit, skill.name, 'skill');
    
    // Trigger brief cast flash animation
    const dom = document.getElementById(unit.id);
    if (dom) {
        dom.classList.add('casting-skill');
        setTimeout(() => dom.classList.remove('casting-skill'), 400);
    }
    
    const opponentTeam = unit.team === 'player' ? 'enemy' : 'player';
    
    switch (skill.id) {
        case 'shangbing_famou': {
            if (Math.random() < 0.40) {
                const enemies = activeUnits.filter(other => !other.isDead && other.team === opponentTeam);
                if (enemies.length > 0) {
                    const lowestZhili = enemies.reduce((min, u) => u.stats.zhili < min.stats.zhili ? u : min, enemies[0]);
                    const lowestHp = enemies.reduce((min, u) => u.hp < min.hp ? u : min, enemies[0]);
                    const lowestTongshuai = enemies.reduce((min, u) => u.stats.tongshuai < min.stats.tongshuai ? u : min, enemies[0]);
                    const highestWuli = enemies.reduce((max, u) => u.stats.wuli > max.stats.wuli ? u : max, enemies[0]);
                    
                    const dmgPct = [1.20, 1.50, 1.80][lvl - 1] || 1.20;
                    const dmgBase = Math.round(unit.stats.zhili * dmgPct);
                    
                    const targets = [lowestZhili, lowestHp, lowestTongshuai, highestWuli];
                    const labels = ['智力最低', '兵力最低', '統率最低', '武力最高'];
                    
                    targets.forEach((target, i) => {
                        if (target && !target.isDead) {
                            takeDamage(target, dmgBase, 'skill', unit, false);
                            createFloatingNumber(target, '上兵伐謀', 'dmg');
                            addLog(`⚔️ [上兵伐謀]（${labels[i]}）：對 ${target.name} 造成 ${dmgBase} 點謀略傷害！`, 'skill');
                        }
                    });
                }
            } else {
                addLog(`💨 [上兵伐謀] 發動判定失敗。`, 'skill');
            }
            break;
        }
        
        case 'luli_tongxin': {
            const count = Math.floor(Math.random() * 4) + 1;
            const healPct = [0.60, 0.85, 1.10][lvl - 1] || 0.60;
            const tsBonus = [20, 30, 40][lvl - 1] || 20;
            
            for (let i = 0; i < count; i++) {
                const allies = activeUnits.filter(other => !other.isDead && other.team === unit.team);
                if (allies.length === 0) break;
                const injured = allies.filter(other => other.hp < other.hpMax);
                let target = null;
                if (injured.length > 0) {
                    target = injured[Math.floor(Math.random() * injured.length)];
                } else {
                    target = allies.reduce((min, u) => (u.hp / u.hpMax) < (min.hp / min.hpMax) ? u : min, allies[0]);
                }
                
                if (target) {
                    const healVal = Math.round(unit.stats.zhili * healPct);
                    healUnit(target, healVal, unit);
                    
                    const finalTS = Math.round(tsBonus * (1 + unit.stats.zhili / 150));
                    target.stats.tongshuai += finalTS;
                    applyStatusEffect(target, 'luli_tongxin_buff', finalTS, 3000);
                    
                    createFloatingNumber(target, `勠力同心`, 'heal');
                    createFloatingNumber(target, `統率 +${finalTS}`, 'shield');
                    addLog(`🤝 [勠力同心]（第 ${i+1}/${count} 次）：治療 ${target.name} ${healVal} 點生命，並提升其 ${finalTS} 點統率（持續 3 秒）！`, 'skill');
                }
            }
            break;
        }
        
        case 'beishe_guiche': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [1.20, 1.50, 1.80][lvl - 1] || 1.20;
                const healPct = [0.60, 0.80, 1.00][lvl - 1] || 0.60;
                
                const dmg = Math.round(unit.stats.zhili * dmgPct);
                const healVal = Math.round(unit.stats.zhili * healPct);
                
                activeUnits.forEach(other => {
                    if (other.isDead) return;
                    if (other.team === opponentTeam && getDistance(targetEnemy, other) <= 1) {
                        takeDamage(other, dmg, 'skill', unit, false);
                        createFloatingNumber(other, '杯蛇鬼車', 'dmg');
                    }
                });
                
                const allies = activeUnits.filter(other => !other.isDead && other.team === unit.team);
                if (allies.length > 0) {
                    const sortedAllies = [...allies].sort((a, b) => (a.hp / a.hpMax) - (b.hp / b.hpMax));
                    const targets = sortedAllies.slice(0, 2);
                    targets.forEach(ally => {
                        healUnit(ally, healVal, unit);
                        createFloatingNumber(ally, '杯蛇鬼車', 'heal');
                    });
                    addLog(`🐍 [杯蛇鬼車]：對敵方範圍造成謀略傷害，並治療我軍最虛弱的 2 名隊友！`, 'skill');
                }
            }
            break;
        }
        
        case 'pozhen_cuijian': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [1.40, 1.80, 2.20][lvl - 1] || 1.40;
                const debuffPct = [0.20, 0.25, 0.30][lvl - 1] || 0.20;
                
                const dmg = Math.round(unit.stats.wuli * dmgPct);
                takeDamage(targetEnemy, dmg, 'skill', unit, false);
                createFloatingNumber(targetEnemy, '破陣摧堅', 'dmg');
                
                const tsShred = Math.round(targetEnemy.stats.tongshuai * debuffPct);
                const zlShred = Math.round(targetEnemy.stats.zhili * debuffPct);
                
                targetEnemy.stats.tongshuai = Math.max(1, targetEnemy.stats.tongshuai - tsShred);
                targetEnemy.stats.zhili = Math.max(1, targetEnemy.stats.zhili - zlShred);
                
                applyStatusEffect(targetEnemy, 'tongshuai_shred', tsShred, 4000);
                applyStatusEffect(targetEnemy, 'zhili_shred', zlShred, 4000);
                
                createFloatingNumber(targetEnemy, '屬性降低', 'debuff');
                addLog(`⚔️ [破陣摧堅]：對 ${targetEnemy.name} 造成 ${dmg} 點物理傷害，並降低其 20%~30% 統率與智力，持續 4 秒！`, 'skill');
            }
            break;
        }
        
        case 'suoxiang_pimi': {
            const delay = Math.round(1000 / settings.speed);
            addLog(`⏳ ${unit.name} 蓄力發動 [所向披靡]...`, 'skill');
            createFloatingNumber(unit, '蓄力中', 'shield');
            
            setTimeout(() => {
                if (unit.isDead) return;
                
                const isSilencedChannel = unit.statusEffects.some(eff => eff.type === 'silence');
                if (isSilencedChannel) {
                    addLog(`💨 ${unit.name} 的 [所向披靡] 在蓄力期間因計窮而被中斷！`, 'skill');
                    return;
                }
                
                const dmgPct = [1.80, 2.30, 2.80][lvl - 1] || 1.80;
                const dmg = Math.round(unit.stats.wuli * dmgPct);
                
                addLog(`💥 [所向披靡] 蓄力發射！對敵方全體造成毀滅性打擊！`, 'skill');
                
                activeUnits.forEach(other => {
                    if (other.isDead || other.team === unit.team) return;
                    takeDamage(other, dmg, 'skill', unit, false);
                    createFloatingNumber(other, '所向披靡', 'dmg');
                });
            }, delay);
            break;
        }
        
        case 'bishi_jixu': {
            const enemies = activeUnits.filter(other => !other.isDead && other.team === opponentTeam);
            if (enemies.length > 0) {
                const targetEnemy = enemies.reduce((min, u) => u.stats.tongshuai < min.stats.tongshuai ? u : min, enemies[0]);
                if (targetEnemy) {
                    const dmgPct = [1.50, 1.90, 2.30][lvl - 1] || 1.50;
                    const dmg = Math.round(unit.stats.wuli * dmgPct);
                    
                    takeDamage(targetEnemy, dmg, 'skill', unit, false);
                    createFloatingNumber(targetEnemy, '避實擊虛', 'dmg');
                    addLog(`⚔️ [避實擊虛]：鎖定敵方統率最低者 ${targetEnemy.name} 造成 ${dmg} 點物理重擊！`, 'skill');
                }
            }
            break;
        }
        
        case 'luofeng': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [1.40, 1.80, 2.20][lvl - 1] || 1.40;
                const dur = [1.5, 2.0, 2.5][lvl - 1] || 1.5;
                const dmg = Math.round(unit.stats.wuli * dmgPct);
                
                takeDamage(targetEnemy, dmg, 'skill', unit, false);
                applyStatusEffect(targetEnemy, 'silence', 0, dur * 1000);
                
                createFloatingNumber(targetEnemy, '落鳳', 'dmg');
                createFloatingNumber(targetEnemy, '計窮', 'shield');
                addLog(`🏹 [落鳳]：對 ${targetEnemy.name} 造成 ${dmg} 點傷害並使其計窮（無法施放主動戰法） ${dur} 秒！`, 'skill');
            }
            break;
        }
        
        case 'zuoshou_gucheng': {
            const allies = activeUnits.filter(other => !other.isDead && other.team === unit.team);
            if (allies.length > 0) {
                const healPct = [0.90, 1.20, 1.50][lvl - 1] || 0.90;
                const sortedAllies = [...allies].sort((a, b) => a.hp - b.hp);
                const targets = sortedAllies.slice(0, 2);
                const healVal = Math.round(unit.stats.zhili * healPct);
                
                targets.forEach(ally => {
                    healUnit(ally, healVal, unit);
                    createFloatingNumber(ally, '坐守孤城', 'heal');
                });
                addLog(`🏰 [坐守孤城]：為己方兵力最低的 2 名盟友恢復 ${healVal} 生命值！`, 'skill');
            }
            break;
        }
        
        case 'zongbing_jielue': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [1.30, 1.60, 2.00][lvl - 1] || 1.30;
                const dur = [1.0, 1.5, 2.0][lvl - 1] || 1.0;
                const dmg = Math.round(unit.stats.wuli * dmgPct);
                
                takeDamage(targetEnemy, dmg, 'skill', unit, false);
                applyStatusEffect(targetEnemy, 'stun', 0, dur * 1000);
                
                createFloatingNumber(targetEnemy, '縱兵劫掠', 'dmg');
                createFloatingNumber(targetEnemy, '震懾', 'shield');
                addLog(`⚔️ [縱兵劫掠]：對 ${targetEnemy.name} 造成 ${dmg} 點傷害並使其震懾（眩暈） ${dur} 秒！`, 'skill');
            }
            break;
        }
        
        case 'baozha': {
            const allies = activeUnits.filter(other => !other.isDead && other.team === unit.team);
            if (allies.length > 0) {
                const healPct = [1.00, 1.30, 1.60][lvl - 1] || 1.00;
                const healVal = Math.round(unit.stats.zhili * healPct);
                
                let target = unit;
                const otherAllies = allies.filter(o => o !== unit);
                if (otherAllies.length > 0) {
                    const closestAlly = otherAllies.reduce((min, u) => getDistance(unit, u) < getDistance(unit, min) ? u : min, otherAllies[0]);
                    if ((closestAlly.hp / closestAlly.hpMax) < (unit.hp / unit.hpMax)) {
                        target = closestAlly;
                    }
                }
                
                healUnit(target, healVal, unit);
                createFloatingNumber(target, '包紮', 'heal');
                addLog(`🩹 [包紮]：為 ${target.name} 恢復了 ${healVal} 生命值！`, 'skill');
            }
            break;
        }
        
        case 'huikan': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [1.00, 1.30, 1.60][lvl - 1] || 1.00;
                const dmg = Math.round(unit.stats.wuli * dmgPct);
                
                takeDamage(targetEnemy, dmg, 'skill', unit, false);
                createFloatingNumber(targetEnemy, '揮砍', 'dmg');
                addLog(`⚔️ [揮砍]：對最近敵軍 ${targetEnemy.name} 造成 ${dmg} 點物理傷害！`, 'skill');
            }
            break;
        }
        
        case 'huogong': {
            const targetEnemy = findClosestEnemy(unit);
            if (targetEnemy) {
                const dmgPct = [0.80, 1.10, 1.40][lvl - 1] || 0.80;
                const burnPct = [0.15, 0.20, 0.25][lvl - 1] || 0.15;
                
                const dmg = Math.round(unit.stats.zhili * dmgPct);
                const burnVal = Math.round(unit.stats.zhili * burnPct);
                
                takeDamage(targetEnemy, dmg, 'skill', unit, false);
                applyStatusEffect(targetEnemy, 'burn', burnVal, 3000);
                
                createFloatingNumber(targetEnemy, '火攻', 'dmg');
                createFloatingNumber(targetEnemy, '灼燒', 'dmg');
                addLog(`🔥 [火攻]：對最近敵軍 ${targetEnemy.name} 造成 ${dmg} 點謀略傷害，並附加灼燒效果！`, 'skill');
            }
            break;
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
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
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
            <div class="unit-stars">${'★'.repeat(unit.star)}</div>
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
    
    // Update live damage meter
    updateDamageMeter();
}

export function updateDamageMeter() {
    const elPlayerList = document.getElementById('damage-meter-player-list');
    const elEnemyList = document.getElementById('damage-meter-enemy-list');
    if (!elPlayerList || !elEnemyList) return;
    
    // Read the active tab: 'dealt', 'taken', or 'healed'
    const activeTabBtn = document.querySelector('.damage-tab-btn.active');
    const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'dealt';
    
    // Split active units into teams
    const playerUnits = activeUnits.filter(u => u.team === 'player');
    const enemyUnits = activeUnits.filter(u => u.team === 'enemy');
    
    const getStat = (u) => {
        if (activeTab === 'healed') return u.healingDone || 0;
        if (activeTab === 'taken') return u.damageTaken || 0;
        return u.damageDealt || 0;
    };
    
    // Calculate total values for percent calculation
    const totalPlayerVal = playerUnits.reduce((sum, u) => sum + getStat(u), 0);
    const totalEnemyVal = enemyUnits.reduce((sum, u) => sum + getStat(u), 0);
    
    // Sort descending by selected stat
    playerUnits.sort((a, b) => getStat(b) - getStat(a));
    enemyUnits.sort((a, b) => getStat(b) - getStat(a));
    
    // Find the max value on each team for proportional bar width
    const maxPlayerVal = playerUnits.length > 0 ? getStat(playerUnits[0]) : 0;
    const maxEnemyVal = enemyUnits.length > 0 ? getStat(enemyUnits[0]) : 0;
    
    // Label depending on tab
    const getLabel = (val, percent) => {
        if (activeTab === 'healed') return `${val} 治療 (${percent}%)`;
        if (activeTab === 'taken') return `${val} 承傷 (${percent}%)`;
        return `${val} dmg (${percent}%)`;
    };
    
    // Render Player Team list
    elPlayerList.innerHTML = playerUnits.map(unit => {
        const val = getStat(unit);
        const percent = totalPlayerVal > 0 ? Math.round((val / totalPlayerVal) * 100) : 0;
        const barWidth = maxPlayerVal > 0 ? Math.round((val / maxPlayerVal) * 100) : 0;
        const starsText = '★'.repeat(unit.star);
        return `
            <div class="damage-row">
                <div class="damage-row-header">
                    <span class="damage-unit-name">${starsText} ${unit.name}</span>
                    <span class="damage-unit-val">${getLabel(val, percent)}</span>
                </div>
                <div class="damage-bar-container">
                    <div class="damage-bar-fill" style="width: ${barWidth}%; background-color: ${unit.color || '#ff9f43'};"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Render Enemy Team list
    elEnemyList.innerHTML = enemyUnits.map(unit => {
        const val = getStat(unit);
        const percent = totalEnemyVal > 0 ? Math.round((val / totalEnemyVal) * 100) : 0;
        const barWidth = maxEnemyVal > 0 ? Math.round((val / maxEnemyVal) * 100) : 0;
        const starsText = unit.star > 1 ? '★'.repeat(unit.star) : '';
        return `
            <div class="damage-row">
                <div class="damage-row-header">
                    <span class="damage-unit-name">${starsText} ${unit.name}</span>
                    <span class="damage-unit-val">${getLabel(val, percent)}</span>
                </div>
                <div class="damage-bar-container">
                    <div class="damage-bar-fill" style="width: ${barWidth}%; background-color: ${unit.color || '#ff4757'};"></div>
                </div>
            </div>
        `;
    }).join('');
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

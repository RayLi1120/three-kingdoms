/**
 * Three Kingdoms Auto-Battler - Main Game Controller
 * Manages player resources, shop recruitment, bench, board placement,
 * duplicate fusion, skill upgrades, and round progression.
 */

import { UNIT_TEMPLATES, FATE_TEMPLATES, getStatsForStar } from './units.js';
import { initBattle, startBattle, setCombatSpeed, setCombatAudio, playSound, updateDamageMeter } from './battle.js';

// Base URL for the matchmaking server backend.
// GitHub Pages hosts static files and cannot run the Python backend.
// To use PvP on GitHub Pages, deploy server.py to a cloud hosting service (like Render)
// and paste its secure HTTPS URL here.
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://three-kingdoms-b613.onrender.com'; // Replace this with your hosted backend URL

let pvpTimerInterval = null;
let pvpLobbyPollInterval = null;
let pvpWaitingForReport = false; // True while waiting for opponent to also submit report

// Username: persists across sessions via localStorage
let playerId = localStorage.getItem('pvp_player_id');
if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    localStorage.setItem('pvp_player_id', playerId);
}

const factionChinese = {
    shu: '蜀',
    wei: '魏',
    wu: '吳',
    qun: '群',
    building: '設施'
};

// ==========================================
// GAME STATE DEFINITION
// ==========================================
export const state = {
    gold: 10,
    maxDeployCost: 5,
    currentDeployCost: 0,
    lives: 3,
    round: 1,
    gameState: 'prep', // 'prep' or 'battle'
    isPvp: false,
    pvpPlayerId: playerId,
    username: localStorage.getItem('pvp_username') || '',
    pvpOppUsername: '',

    // PvP Lobby state
    pvpLobbyId: null,
    pvpMyPoints: 0,
    pvpOppPoints: 0,
    pvpTimeRemaining: 30,
    pvpMyReady: false,
    pvpLobbyStatus: null, // 'prep', 'combat', 'game_over'
    pvpGameOver: false,
    
    // Shop slots: 5 items
    shopSlots: [null, null, null, null, null],
    
    // Bench: 8 slots
    bench: Array(8).fill(null),
    
    // Deployed units: Array of active units
    // Structure: { templateId, star, skillLevel, x, y }
    deployedUnits: [],
    
    // Selected entity for sidebar inspection and grid placing
    // Structure: { source: 'bench'|'board', index: number, x?: number, y?: number }
    selectedEntity: null,

    // Dragged entity for HTML5 drag-and-drop
    // (drag system removed — using click-based interaction)
    draggedEntity: null,
    dropHandled: false,

    // Active fates/synergies
    activeFates: [],

    // Faction synergies thresholds (0 = inactive, 1 = tier 1, 2 = tier 2)
    activeFactions: {
        shu: 0,
        wei: 0,
        wu: 0,
        qun: 0
    },

    // Game settings
    settings: {
        audio: true,
        speed: 1
    }
};
// DOM Elements
let elRound, elGold, elCostDisplay, elCostBarFill, elLivesContainer;
let elGrid, elShopSlots, elDetailPanel, elDetailContent, elLogBody, elDamageMeterContainer, elSynergyPanel;
let elBtnUpgrade, elBtnRefresh, elBtnStart, elUpgradeGoldCost;
let elOverlay, elOverlayTitle, elOverlayDesc, elOverlayRewards, elBtnOverlayAction;

// Menu and Modal DOM elements
let elMenuOverlay, elBtnMenuStart, elBtnMenuPvp, elBtnMenuRoster, elBtnToggleAudio;
let elBtnCloseRoster, elRosterOverlay, elRosterGrid, elRosterDetailOverlay, elBtnCloseRosterDetail;
let elBtnQuickAudio, elBtnQuickSpeed, elSellZone, elMobileIpLink;
let elPvpOverlay, elPvpStatusText, elPvpTimerVal, elBtnPvpCancel;
// Username DOM elements
let elUsernameOverlay, elUsernameInput, elUsernameConfirm, elUsernameError, elUsernameCharCount, elPlayerTag;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    initGrid();
    setupEventListeners();
    setupUsernameOverlay();
    fetchLocalIp();
});

function cacheElements() {
    elRound = document.querySelector('#stat-round .value');
    elGold = document.querySelector('#stat-gold .value');
    elCostDisplay = document.getElementById('cost-display');
    elCostBarFill = document.getElementById('cost-bar-fill');
    elLivesContainer = document.querySelector('.lives-container');
    
    elGrid = document.getElementById('battle-grid');
    elShopSlots = document.getElementById('shop-slots');
    elDetailPanel = document.getElementById('detail-panel');
    elDetailContent = document.getElementById('detail-content');
    elLogBody = document.getElementById('log-body');
    elDamageMeterContainer = document.getElementById('damage-meter-container');
    elSynergyPanel = document.getElementById('synergy-panel');
    
    elBtnUpgrade = document.getElementById('btn-upgrade-cost');
    elUpgradeGoldCost = document.getElementById('upgrade-gold-cost');
    elBtnRefresh = document.getElementById('btn-refresh-shop');
    elBtnStart = document.getElementById('btn-start-battle');
    
    elOverlay = document.getElementById('game-overlay');
    elOverlayTitle = document.getElementById('overlay-title');
    elOverlayDesc = document.getElementById('overlay-desc');
    elOverlayRewards = document.getElementById('overlay-rewards');
    elBtnOverlayAction = document.getElementById('btn-overlay-action');

    elMenuOverlay = document.getElementById('menu-overlay');
    elBtnMenuStart = document.getElementById('btn-menu-start');
    elBtnMenuPvp = document.getElementById('btn-menu-pvp');
    elBtnMenuRoster = document.getElementById('btn-menu-roster');
    elBtnToggleAudio = document.getElementById('btn-toggle-audio');
    elBtnCloseRoster = document.getElementById('btn-close-roster');
    elRosterOverlay = document.getElementById('roster-overlay');
    elRosterGrid = document.getElementById('roster-grid');
    elRosterDetailOverlay = document.getElementById('roster-detail-overlay');
    elBtnCloseRosterDetail = document.getElementById('btn-close-roster-detail');
    elBtnQuickAudio = document.getElementById('btn-quick-audio');
    elBtnQuickSpeed = document.getElementById('btn-quick-speed');
    elSellZone = document.getElementById('drag-sell-zone');
    elMobileIpLink = document.getElementById('mobile-ip-link');
    
    elPvpOverlay = document.getElementById('pvp-overlay');
    elPvpStatusText = document.getElementById('pvp-status-text');
    elPvpTimerVal = document.getElementById('pvp-timer-val');
    elBtnPvpCancel = document.getElementById('btn-pvp-cancel');
    // Username elements
    elUsernameOverlay  = document.getElementById('username-overlay');
    elUsernameInput    = document.getElementById('username-input');
    elUsernameConfirm  = document.getElementById('btn-username-confirm');
    elUsernameError    = document.getElementById('username-error');
    elUsernameCharCount = document.getElementById('username-char-count');
    elPlayerTag        = document.getElementById('player-tag');
}

function initGrid() {
    elGrid.innerHTML = '';
    // Create 8x10 cells. y=0 (top, enemy), y=9 (bottom, player)
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 8; x++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            
            // Assign zone classes
            if (y <= 3) {
                cell.classList.add('enemy-zone');
            } else if (y <= 5) {
                cell.classList.add('buffer-zone');
            } else {
                cell.classList.add('player-zone');
            }
            
            cell.dataset.x = x;
            cell.dataset.y = y;
            
            // Click handler for placing/moving units
            cell.addEventListener('click', () => handleCellClick(x, y));
            
            elGrid.appendChild(cell);
        }
    }
}

function setupEventListeners() {
    elBtnUpgrade.addEventListener('click', upgradeMaxDeployCost);
    elBtnRefresh.addEventListener('click', refreshShopManual);
    elBtnStart.addEventListener('click', triggerBattleStart);
    elBtnOverlayAction.addEventListener('click', handleOverlayAction);

    elBtnMenuStart.addEventListener('click', handleMenuStart);
    if (elBtnMenuPvp) elBtnMenuPvp.addEventListener('click', handleMenuPvp);
    if (elBtnPvpCancel) elBtnPvpCancel.addEventListener('click', cancelPvpMatchmaking);
    const elBtnPvpStartQueue = document.getElementById('btn-pvp-start-queue');
    if (elBtnPvpStartQueue) {
        elBtnPvpStartQueue.addEventListener('click', startPvpQueueFlow);
    }
    elBtnMenuRoster.addEventListener('click', handleMenuRoster);
    elBtnToggleAudio.addEventListener('click', handleToggleAudio);
    elBtnCloseRoster.addEventListener('click', handleCloseRoster);
    if (elBtnCloseRosterDetail) {
        elBtnCloseRosterDetail.addEventListener('click', () => {
            if (elRosterDetailOverlay) elRosterDetailOverlay.classList.add('hidden');
        });
    }
    if (elRosterDetailOverlay) {
        elRosterDetailOverlay.addEventListener('click', (e) => {
            if (e.target === elRosterDetailOverlay) {
                elRosterDetailOverlay.classList.add('hidden');
            }
        });
    }
    
    elBtnQuickAudio.addEventListener('click', handleToggleAudio);
    elBtnQuickSpeed.addEventListener('click', handleToggleSpeed);
    
    document.querySelectorAll('.btn-speed-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const speed = parseInt(e.target.dataset.speed);
            selectCombatSpeed(speed);
        });
    });

    if (elSellZone) {
        elSellZone.classList.add('hidden');
        elSellZone.addEventListener('click', () => {
            if (!state.selectedEntity) return;
            const selected = getSelectedUnitData();
            if (selected) {
                const src = state.selectedEntity.source;
                const idx = state.selectedEntity.index;
                
                // Perform sell
                if (src === 'bench') {
                    state.bench[idx] = null;
                } else {
                    state.deployedUnits.splice(idx, 1);
                }
                
                const refund = selected.template.cost * selected.unit.star;
                state.gold += refund;
                addLog(`成功出售 ${selected.template.name}（${selected.unit.star}星），獲得 🪙 ${refund} 金幣。`, 'victory');
                playSound('heal');
                recalculateDeployCost();
                
                // Clear selection and hide sell zone
                state.selectedEntity = null;
                hideDetailCard();
                renderBench();
                renderBoard();
                updateUI();
            }
        });
    }

    // Tabs click handlers for the combat stats meter
    document.querySelectorAll('.damage-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.damage-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateDamageMeter();
        });
    });
}

function restorePrepUI() {
    if (state.gameState !== 'prep') return;
    if (elDetailPanel) elDetailPanel.classList.remove('hidden');
    if (elSynergyPanel) elSynergyPanel.classList.remove('hidden');
    if (elDamageMeterContainer) elDamageMeterContainer.classList.add('hidden');
}

// ==========================================
// PREPARATION PHASE CYCLE
// ==========================================
export function startPrepPhase() {
    state.gameState = 'prep';
    
    // 1. Clean up dead buildings, revive heroes and restore their starting coordinates
    state.deployedUnits = state.deployedUnits.filter(u => {
        if (u.isBuilding && u.isDead) {
            // Buildings that die are permanently destroyed
            return false;
        }
        
        // Restore pre-battle starting coordinates so units aren't left in river/enemy zone
        if (u.startX !== undefined) u.x = u.startX;
        if (u.startY !== undefined) u.y = u.startY;
        
        // Revive and reset HP/Shield/Energy
        u.isDead = false;
        u.hp = u.hpMax;
        u.shield = 0;
        u.energy = 0;
        return true;
    });
    
    // 2. Now recalculate deploy cost based on remaining active units!
    recalculateDeployCost();
    
    // Roll shop
    rollShop();
    
    // Award income (base 5 Gold + interest)
    if (state.round > 1) {
        const interest = Math.min(Math.floor(state.gold / 10), 3); // Max 3 Gold interest
        const baseIncome = 5;
        const totalAwarded = baseIncome + interest;
        state.gold += totalAwarded;
        addLog(`回合收益：金幣 +${baseIncome}。利息收益：金幣 +${interest}。`, 'victory');
    }
    
    state.selectedEntity = null;
    hideDetailCard();
    
    updateUI();
    renderBoard();
    
    addLog(`--- 第 ${state.round} 回合 準備階段 ---`, 'system');
}

function updateUI() {
    elRound.textContent = state.round;
    elGold.textContent = state.gold;
    
    // Cost limit display
    elCostDisplay.textContent = `${state.currentDeployCost} / ${state.maxDeployCost}`;
    const fillPercent = Math.min((state.currentDeployCost / state.maxDeployCost) * 100, 100);
    elCostBarFill.style.width = `${fillPercent}%`;
    
    // Lives / Score display
    const livesLabel = document.querySelector('#stat-lives .label');
    if (state.isPvp && state.pvpLobbyId) {
        // PvP mode: replace hearts with score display
        if (livesLabel) livesLabel.textContent = '積分';
        const oppLabel = state.pvpOppUsername ? state.pvpOppUsername : '對手';
        elLivesContainer.innerHTML = `
            <span style="color:var(--gold); font-weight:700; font-size:0.9rem;">己方: ${state.pvpMyPoints}</span>
            <span style="color:var(--text-secondary); margin:0 4px;">|</span>
            <span style="color:#f87171; font-weight:700; font-size:0.9rem;">${oppLabel}: ${state.pvpOppPoints}</span>
        `;
    } else {
        // Single player: heart display
        if (livesLabel) livesLabel.textContent = '生命值';
        elLivesContainer.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const heart = document.createElement('span');
            heart.className = `heart ${i < state.lives ? 'active' : ''}`;
            heart.textContent = '♥';
            elLivesContainer.appendChild(heart);
        }
    }
    
    // Button state updates
    const upgradeCost = getUpgradeCost();
    elUpgradeGoldCost.textContent = `${upgradeCost} 金幣`;
    elBtnUpgrade.disabled = state.gold < upgradeCost || state.maxDeployCost >= 20;
    elBtnRefresh.disabled = state.gold < 2;
    
    // Start Battle button
    if (state.isPvp && state.pvpLobbyId) {
        // In an active PvP lobby
        if (state.pvpGameOver) {
            elBtnStart.textContent = '戰役結束';
            elBtnStart.disabled = true;
            elBtnStart.classList.remove('pulsing');
        } else if (pvpWaitingForReport) {
            elBtnStart.textContent = '等待對手結算...';
            elBtnStart.disabled = true;
            elBtnStart.classList.remove('pulsing');
        } else if (state.pvpMyReady) {
            elBtnStart.textContent = '已準備，等待對手...';
            elBtnStart.disabled = true;
            elBtnStart.classList.remove('pulsing');
        } else if (state.gameState === 'prep' && state.pvpLobbyStatus === 'prep') {
            const timeText = state.pvpTimeRemaining > 0 ? `(${state.pvpTimeRemaining}秒)` : '';
            elBtnStart.textContent = `準備就緒 ${timeText}`.trim();
            if (state.currentDeployCost === 0) {
                elBtnStart.disabled = true;
                elBtnStart.classList.remove('pulsing');
            } else {
                elBtnStart.disabled = false;
                elBtnStart.classList.add('pulsing');
            }
        } else {
            elBtnStart.textContent = '戰鬥進行中...';
            elBtnStart.disabled = true;
            elBtnStart.classList.remove('pulsing');
        }
    } else if (state.isPvp && !state.pvpLobbyId) {
        // PvP mode but still searching for opponent
        elBtnStart.textContent = '尋找對手中...';
        elBtnStart.disabled = true;
        elBtnStart.classList.remove('pulsing');
    } else {
        // Single-player mode
        elBtnStart.textContent = '進入戰鬥';
        if (state.currentDeployCost === 0) {
            elBtnStart.disabled = true;
            elBtnStart.classList.remove('pulsing');
        } else {
            elBtnStart.disabled = false;
            elBtnStart.classList.add('pulsing');
        }
    }
}

// Recalculates sum of costs of deployed heroes and buildings
export function recalculateDeployCost() {
    let total = 0;
    state.deployedUnits.forEach(u => {
        const template = UNIT_TEMPLATES[u.templateId];
        if (template) {
            total += template.cost;
        }
    });
    state.currentDeployCost = total;
}

function getUpgradeCost() {
    // Upgrading max cost goes up: 5->6 costs 6, 6->7 costs 8, 7->8 costs 10, 8->9 costs 12, 9->10 costs 14
    return (state.maxDeployCost - 4) * 2 + 4;
}

function upgradeMaxDeployCost() {
    restorePrepUI();
    const cost = getUpgradeCost();
    if (state.gold >= cost && state.maxDeployCost < 20) {
        state.gold -= cost;
        state.maxDeployCost++;
        addLog(`已將最大上陣統禦值上限提升至 ${state.maxDeployCost}！`, 'victory');
        updateUI();
    }
}

// ==========================================
// SHOP SYSTEM
// ==========================================
function rollShop() {
    const pool = [
        { id: 'sentry_tower', weight: 15 },
        { id: 'ballista_tower', weight: 15 },
        { id: 'zhao_yun', weight: 8 },
        { id: 'liu_bei', weight: 8 },
        { id: 'guo_jia', weight: 8 },
        { id: 'xun_yu', weight: 8 },
        { id: 'yuan_shao', weight: 8 },
        { id: 'yuan_shu', weight: 8 },
        { id: 'diao_chan', weight: 8 },
        { id: 'zhuge_liang', weight: 6 },
        { id: 'zhang_fei', weight: 6 },
        { id: 'cao_cao', weight: 6 },
        { id: 'sun_quan', weight: 6 },
        { id: 'lu_xun', weight: 6 },
        { id: 'zhang_jiao', weight: 6 },
        { id: 'guan_yu', weight: 4 },
        { id: 'zhou_yu', weight: 4 },
        { id: 'sima_yi', weight: 3 },
        { id: 'lu_bu', weight: 3 }
    ];
    
    // Draw 5 cards
    for (let i = 0; i < 5; i++) {
        state.shopSlots[i] = getRandomUnitFromPool(pool);
    }
    
    renderShop();
}

function getRandomUnitFromPool(pool) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of pool) {
        random -= item.weight;
        if (random <= 0) {
            return UNIT_TEMPLATES[item.id];
        }
    }
    return UNIT_TEMPLATES.zhao_yun; // Fallback
}

function renderShop() {
    elShopSlots.innerHTML = '';
    
    state.shopSlots.forEach((template, index) => {
        if (!template) {
            const slot = document.createElement('div');
            slot.className = 'shop-card glass locked';
            slot.innerHTML = `<div class="card-desc" style="text-align:center;line-height:40px;">已售罄</div>`;
            elShopSlots.appendChild(slot);
            return;
        }
        
        const slot = document.createElement('div');
        slot.className = `shop-card glass faction-${template.faction}`;
        
        const portraitStyle = template.portrait 
            ? `background-image: url('${template.portrait}'); background-size: cover; background-position: top center; border-color: ${template.color}66;` 
            : `background-color: ${template.color}22; border-color: ${template.color}66; display:flex; align-items:center; justify-content:center;`;
        
        slot.innerHTML = `
            <div class="card-header">
                <span class="card-title">${template.name} <span style="font-size:0.7rem; font-weight:normal; opacity:0.85; margin-left:4px; color:#60a5fa;">(${template.cost}統)</span></span>
                <span class="card-faction" style="font-size:0.6rem; font-weight:800; color:${template.color}; text-transform:uppercase;">${factionChinese[template.faction] || template.faction}</span>
                <span class="card-cost">🪙 ${template.cost}</span>
            </div>
            <div class="card-portrait-thumb" style="${portraitStyle}">
                ${template.portrait ? '' : `<span style="font-family: var(--font-header); font-size:1.2rem; color:${template.color}; text-shadow: 0 0 6px ${template.color}bb">${template.avatarText}</span>`}
            </div>
            <div class="card-desc">${template.skillDesc}</div>
        `;
        
        slot.addEventListener('click', () => buyUnit(index));
        elShopSlots.appendChild(slot);
    });
}

function refreshShopManual() {
    restorePrepUI();
    if (state.gold >= 2) {
        state.gold -= 2;
        rollShop();
        updateUI();
        addLog('招募商店已刷新（消耗：2金幣）。', 'system');
    }
}

function buyUnit(shopIndex) {
    if (state.gameState !== 'prep') return;
    restorePrepUI();
    
    const template = state.shopSlots[shopIndex];
    if (!template) return;
    
    if (state.gold < template.cost) {
        addLog(`金幣不足，無法招募 ${template.name}！`, 'damage');
        return;
    }
    
    // Find open bench slot
    const openBenchIndex = state.bench.indexOf(null);
    if (openBenchIndex === -1) {
        addLog('儲備欄已滿！請先將單位放置到戰場上。', 'damage');
        return;
    }
    
    // Deduct gold, add to bench, clear shop slot
    state.gold -= template.cost;
    state.bench[openBenchIndex] = {
        templateId: template.id,
        star: 1,
        skillLevel: 1
    };
    state.shopSlots[shopIndex] = null;
    
    addLog(`成功招募 ${template.name}（統禦消耗：${template.cost}）（已放入儲備欄）。`, 'system');
    
    renderShop();
    renderBench();
    updateUI();
}



// Injects Bench UI dynamically above shop
function injectBenchUI() {
    const shopContainer = document.querySelector('.shop-container');
    if (!shopContainer) return;
    
    // Check if bench container already exists
    let benchContainer = document.getElementById('bench-container');
    if (!benchContainer) {
        benchContainer = document.createElement('div');
        benchContainer.id = 'bench-container';
        benchContainer.className = 'bench-container';
        benchContainer.innerHTML = `
            <span class="bench-label">BENCH (Reserve Units - Cost: 0)</span>
            <div class="bench-slots" id="bench-slots"></div>
        `;
        const wrapper = document.querySelector('.shop-slots-wrapper') || elShopSlots;
        shopContainer.insertBefore(benchContainer, wrapper);
        
        // Add style for bench container dynamically
        const style = document.createElement('style');
        style.textContent = `
            .bench-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 6px;
            }
            .bench-label {
                font-size: 0.65rem;
                font-weight: 700;
                color: var(--text-secondary);
                letter-spacing: 1px;
            }
            .bench-slots {
                display: flex;
                gap: 6px;
                height: 48px;
            }
            .bench-slot {
                flex: 1;
                background: rgba(255, 255, 255, 0.02);
                border: 1px dashed rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                position: relative;
                transition: background 0.2s, border 0.2s;
            }
            .bench-slot.selected {
                border-color: var(--blue);
                background: rgba(30, 144, 255, 0.1);
                box-shadow: 0 0 8px rgba(30, 144, 255, 0.2);
            }
            .bench-slot .bench-token {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-weight: bold;
                font-size: 0.85rem;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                border: 2px solid;
            }
            .bench-slot .bench-stars {
                position: absolute;
                top: -2px;
                font-size: 0.55rem;
                color: var(--gold);
            }
            @media (max-width: 768px) {
                .bench-container {
                    margin-bottom: 4px;
                }
                .bench-label {
                    font-size: 0.6rem;
                }
                .bench-slots {
                    height: 38px;
                    gap: 4px;
                }
                .bench-slot {
                    border-radius: 4px;
                }
                .bench-slot .bench-token {
                    width: 28px;
                    height: 28px;
                    font-size: 0.7rem;
                    border-width: 1.5px;
                }
                .bench-slot .bench-stars {
                    font-size: 0.45rem;
                    top: -4px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function renderBench() {
    injectBenchUI();
    const elBenchSlots = document.getElementById('bench-slots');
    elBenchSlots.innerHTML = '';
    
    state.bench.forEach((unit, index) => {
        const slot = document.createElement('div');
        slot.className = 'bench-slot';
        
        // Highlight if selected
        if (state.selectedEntity && state.selectedEntity.source === 'bench' && state.selectedEntity.index === index) {
            slot.classList.add('selected');
        }
        
        if (unit) {
            const template = UNIT_TEMPLATES[unit.templateId];
            const tokenStyle = template.portrait
                ? `background-image: url('${template.portrait}'); border-color: ${template.color}; background-size: cover; background-position: top center;`
                : `background-color: ${template.color}44; border-color: ${template.color}; display:flex; align-items:center; justify-content:center;`;
            
            slot.innerHTML = `
                <div class="bench-token" style="${tokenStyle}">
                    ${template.portrait ? '' : template.avatarText}
                </div>
                <div class="bench-stars">${'★'.repeat(unit.star)}</div>
            `;
            
            slot.addEventListener('click', (e) => {
                e.stopPropagation();
                selectBenchUnit(index);
            });
        } else {
            slot.addEventListener('click', (e) => {
                e.stopPropagation();
                handleBenchEmptySlotClick(index);
            });
        }
        
        elBenchSlots.appendChild(slot);
    });
}

function selectBenchUnit(index) {
    if (state.gameState !== 'prep') return;
    
    // Toggle select
    if (state.selectedEntity && state.selectedEntity.source === 'bench' && state.selectedEntity.index === index) {
        state.selectedEntity = null;
        hideDetailCard();
    } else {
        state.selectedEntity = { source: 'bench', index };
        const unit = state.bench[index];
        showDetailCard(unit);
    }
    renderBench();
    renderBoard();
}

function handleBenchEmptySlotClick(index) {
    if (state.gameState !== 'prep') return;
    restorePrepUI();
    
    // If we have a board unit selected, move it back to the bench!
    if (state.selectedEntity && state.selectedEntity.source === 'board') {
        const unitIndex = state.selectedEntity.index;
        const unit = state.deployedUnits[unitIndex];
        
        // Remove from board, add to bench
        state.deployedUnits.splice(unitIndex, 1);
        state.bench[index] = {
            templateId: unit.templateId,
            star: unit.star,
            skillLevel: unit.skillLevel
        };
        
        state.selectedEntity = null;
        recalculateDeployCost();
        addLog(`已將 ${UNIT_TEMPLATES[unit.templateId].name} 撤回儲備欄。`, 'system');
        
        hideDetailCard();
        renderBench();
        renderBoard();
        updateUI();
    }
}

// ==========================================
// GRID BOARD SYSTEM
// ==========================================
function renderBoard() {
    // Clear previous elements representing units
    const existingUnits = elGrid.querySelectorAll('.grid-unit');
    existingUnits.forEach(u => u.remove());
    
    // Remove drag highlights
    elGrid.querySelectorAll('.grid-cell').forEach(c => {
        c.className = 'grid-cell';
        const y = parseInt(c.dataset.y);
        if (y <= 3) c.classList.add('enemy-zone');
        else if (y <= 5) c.classList.add('buffer-zone');
        else c.classList.add('player-zone');
    });
    
    // Highlight cells if a unit is selected for placing
    if (state.selectedEntity) {
        elGrid.querySelectorAll('.grid-cell').forEach(c => {
            const y = parseInt(c.dataset.y);
            if (y >= 6 && y <= 9) { // Player zone
                c.classList.add('drag-over-valid');
            }
        });
    }
    
    // Render each unit absolute position in the grid
    state.deployedUnits.forEach((unit, index) => {
        const template = UNIT_TEMPLATES[unit.templateId];
        if (!template) return;
        
        const unitEl = document.createElement('div');
        unitEl.className = `grid-unit player-team star-${unit.star}`;
        if (template.isBuilding) unitEl.classList.add('building');
        
        // CSS position translation mapping (left and top values)
        // col -> left, row -> top
        unitEl.style.left = `calc(${unit.x} * 100% / 8)`;
        unitEl.style.top = `calc(${unit.y} * 100% / 10)`;
        
        const tokenStyle = template.portrait
            ? `background-image: url('${template.portrait}'); border-color: ${template.color}; background-size: cover; background-position: top center;`
            : `background-color: ${template.color}44; border-color: ${template.color}; display:flex; align-items:center; justify-content:center;`;
        
        // Build unit content
        unitEl.innerHTML = `
            <div class="unit-stars">${'★'.repeat(unit.star)}</div>
            <div class="unit-token" style="${tokenStyle}">
                ${template.portrait ? '' : `<span style="font-family: var(--font-header); font-size:1.1rem; color:#fff; text-shadow:0 0 6px ${template.color}aa">${template.avatarText}</span>`}
            </div>
            <div class="unit-bars">
                <div class="bar"><div class="bar-fill hp-fill" style="transform: scaleX(${unit.hp / unit.hpMax})"></div></div>
                ${unit.shield > 0 ? `<div class="bar"><div class="bar-fill shield-fill" style="transform: scaleX(${unit.shield / unit.hpMax})"></div></div>` : ''}
                ${!template.isBuilding ? `<div class="bar"><div class="bar-fill energy-fill" style="transform: scaleX(${unit.energy / 100})"></div></div>` : ''}
            </div>
        `;
        // Add click handler — routes to selectBoardUnit which handles fusion + selection
        unitEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectBoardUnit(index);
        });
        
        elGrid.appendChild(unitEl);
    });

    // Recalculate and render active synergies/fates
    checkActiveFates();
}

function selectBoardUnit(index) {
    if (state.gameState !== 'prep') {
        // Just inspect in combat, no changes allowed
        const unit = state.deployedUnits[index];
        showDetailCard(unit, false);
        return;
    }

    const clickedUnit = state.deployedUnits[index];

    // --- FUSION via click: bench unit selected + same character on field ---
    if (state.selectedEntity && state.selectedEntity.source === 'bench') {
        const benchUnit = state.bench[state.selectedEntity.index];
        if (benchUnit && clickedUnit && benchUnit.templateId === clickedUnit.templateId) {
            fuseUnits(state.selectedEntity.index, index);
            return;
        }
        // Different character clicked — deselect bench and select the board unit instead
        state.selectedEntity = null;
    }

    // --- BOARD-TO-BOARD FUSION via click ---
    if (state.selectedEntity && state.selectedEntity.source === 'board') {
        const selectedUnit = state.deployedUnits[state.selectedEntity.index];
        if (selectedUnit && clickedUnit && selectedUnit.templateId === clickedUnit.templateId && state.selectedEntity.index !== index) {
            fuseBoardUnits(state.selectedEntity.index, index);
            return;
        }
        // Same unit clicked again = deselect
        if (state.selectedEntity.index === index) {
            state.selectedEntity = null;
            hideDetailCard();
            renderBench();
            renderBoard();
            return;
        }
        // Different character clicked — move to that position (swap)
        const oldUnit = state.deployedUnits[state.selectedEntity.index];
        const tempX = oldUnit.x; const tempY = oldUnit.y;
        oldUnit.x = clickedUnit.x; oldUnit.y = clickedUnit.y;
        clickedUnit.x = tempX; clickedUnit.y = tempY;
        state.selectedEntity = null;
        hideDetailCard();
        renderBench();
        renderBoard();
        return;
    }

    // Default: select this board unit
    state.selectedEntity = { source: 'board', index };
    showDetailCard(clickedUnit);
    renderBench();
    renderBoard();
}

function handleCellClick(x, y) {
    if (state.gameState !== 'prep') return;
    restorePrepUI();
    
    // Only allow placing in player zone (y values 6 to 9)
    if (y < 6) {
        addLog("無法在敵方區域或緩衝區部署單位！", "damage");
        return;
    }
    
    // Check if we have a selected unit
    if (state.selectedEntity) {
        // --- CASE 1: Deploying from Bench ---
        if (state.selectedEntity.source === 'bench') {
            const benchIndex = state.selectedEntity.index;
            const benchUnit = state.bench[benchIndex];
            const template = UNIT_TEMPLATES[benchUnit.templateId];
            
            // Check if grid cell already contains a unit
            const existingUnitIndex = state.deployedUnits.findIndex(u => u.x === x && u.y === y);
            
            if (existingUnitIndex !== -1) {
                const targetUnit = state.deployedUnits[existingUnitIndex];
                
                // FUSION CHECK: Same unit types combine!
                if (targetUnit.templateId === benchUnit.templateId) {
                    fuseUnits(benchIndex, existingUnitIndex);
                    return;
                } else {
                    addLog("該格子已被佔用。暫不支援直接與儲備欄交換；請先移動到空閒格子或儲備欄。", "damage");
                    return;
                }
            }
            
            // 重複上陣檢查（防禦建築除外）
            if (!template.isBuilding) {
                const isAlreadyDeployed = state.deployedUnits.some(u => u.templateId === benchUnit.templateId);
                if (isAlreadyDeployed) {
                    addLog("戰場上已存在相同的武將，無法重複上陣！", "damage");
                    return;
                }
            }
            
            // Check Deploy Cost Limit
            if (state.currentDeployCost + template.cost > state.maxDeployCost) {
                addLog(`超出最大上陣統禦值上限！上限：${state.maxDeployCost}，${template.name}統禦消耗：${template.cost}`, 'damage');
                return;
            }
            
            // Remove from bench, place on board
            state.bench[benchIndex] = null;
            
            const stats = getStatsForStar(template, benchUnit.star);
            state.deployedUnits.push({
                templateId: benchUnit.templateId,
                star: benchUnit.star,
                skillLevel: benchUnit.skillLevel,
                x,
                y,
                hp: stats.hpMax,
                hpMax: stats.hpMax,
                shield: 0,
                energy: 0,
                isBuilding: template.isBuilding
            });
            
            state.selectedEntity = null;
            recalculateDeployCost();
            addLog(`已將 ${template.name} 部署到戰場 (${String.fromCharCode(65 + x)}${10 - y})。`, 'system');
            
            hideDetailCard();
            renderBench();
            renderBoard();
            updateUI();
        }
        
        // --- CASE 2: Moving existing board unit ---
        else if (state.selectedEntity.source === 'board') {
            const oldIndex = state.selectedEntity.index;
            const boardUnit = state.deployedUnits[oldIndex];
            const template = UNIT_TEMPLATES[boardUnit.templateId];
            
            const existingUnitIndex = state.deployedUnits.findIndex((u, idx) => u.x === x && u.y === y && idx !== oldIndex);
            
            if (existingUnitIndex !== -1) {
                const targetUnit = state.deployedUnits[existingUnitIndex];
                
                // FUSION CHECK: Same unit types combine!
                if (targetUnit.templateId === boardUnit.templateId) {
                    fuseBoardUnits(oldIndex, existingUnitIndex);
                    return;
                } else {
                    // Swap their coordinates
                    const tempX = boardUnit.x;
                    const tempY = boardUnit.y;
                    boardUnit.x = x;
                    boardUnit.y = y;
                    targetUnit.x = tempX;
                    targetUnit.y = tempY;
                }
            } else {
                // Just move to empty cell
                boardUnit.x = x;
                boardUnit.y = y;
            }
            
            state.selectedEntity = null;
            addLog(`已將 ${template.name} 移動到 (${String.fromCharCode(65 + x)}${10 - y})。`, 'system');
            
            hideDetailCard();
            renderBench();
            renderBoard();
        }
    }
}

// ==========================================
// FUSION SYSTEM LOGIC
// ==========================================
function fuseUnits(benchIndex, boardIndex) {
    const bUnit = state.bench[benchIndex];
    const target = state.deployedUnits[boardIndex];
    const template = UNIT_TEMPLATES[target.templateId];
    
    if (target.star >= 3) {
        addLog(`${template.name} 已經是最高星級（3星 ⭐⭐⭐）！`, 'damage');
        return;
    }
    
    // Perform fusion!
    target.star++;
    state.bench[benchIndex] = null; // Clear duplicate
    
    // Scale up current stats
    const stats = getStatsForStar(template, target.star);
    target.hpMax = stats.hpMax;
    target.hp = stats.hpMax; // Full heal on fusion
    
    state.selectedEntity = null;
    addLog(`✨ 戰力提升！部署的 ${template.name} 已升至 ${target.star}星！屬性已大幅提升。`, 'victory');
    
    hideDetailCard();
    renderBench();
    renderBoard();
    updateUI();
}

function fuseBoardUnits(srcBoardIndex, destBoardIndex) {
    const src = state.deployedUnits[srcBoardIndex];
    const target = state.deployedUnits[destBoardIndex];
    const template = UNIT_TEMPLATES[target.templateId];
    
    if (target.star >= 3) {
        addLog(`${template.name} 已經是最高星級（3星 ⭐⭐⭐）！`, 'damage');
        return;
    }
    
    // Perform fusion!
    target.star++;
    state.deployedUnits.splice(srcBoardIndex, 1); // Delete source unit from board
    
    // Scale up stats
    const stats = getStatsForStar(template, target.star);
    target.hpMax = stats.hpMax;
    target.hp = stats.hpMax; // Full heal
    
    state.selectedEntity = null;
    recalculateDeployCost();
    addLog(`✨ 戰力提升！部署的 ${template.name} 已升至 ${target.star}星！屬性已大幅提升。`, 'victory');
    
    hideDetailCard();
    renderBench();
    renderBoard();
    updateUI();
}

// ==========================================
// DETAILS SIDEBAR INSPECTOR & UPGRADES
// ==========================================
function showDetailCard(unit, allowUpgrade = true) {
    restorePrepUI();
    const template = UNIT_TEMPLATES[unit.templateId];
    if (!template) return;
    
    const stats = getStatsForStar(template, unit.star);
    
    elDetailContent.classList.remove('hidden');
    const placeholder = elDetailPanel.querySelector('.detail-placeholder');
    if (placeholder) placeholder.classList.add('hidden');
    
    // Set portrait, background, etc.
    const elPortrait = document.getElementById('detail-portrait');
    if (template.portrait) {
        elPortrait.style.backgroundImage = `url('${template.portrait}')`;
        elPortrait.style.backgroundColor = 'transparent';
        elPortrait.style.borderColor = template.color;
        elPortrait.style.backgroundSize = 'cover';
        elPortrait.style.backgroundPosition = 'top center';
        elPortrait.innerHTML = '';
    } else {
        elPortrait.style.backgroundImage = 'none';
        elPortrait.style.backgroundColor = `${template.color}22`;
        elPortrait.style.borderColor = template.color;
        elPortrait.innerHTML = `
            <div style="display:flex; height:100%; width:100%; align-items:center; justify-content:center;">
                <span style="font-family: var(--font-header); font-size:4rem; color:${template.color}; text-shadow:0 0 15px ${template.color}bb">${template.avatarText}</span>
            </div>
        `;
    }
    
    document.getElementById('detail-name').innerHTML = `${template.name} <span style="font-size:1rem;color:var(--gold);">${'★'.repeat(unit.star)}</span>`;
    document.getElementById('detail-role').textContent = template.role;
    document.getElementById('detail-cost').textContent = `統禦消耗 / 購買價格：${template.cost} 統`;
    
    const currentHp = typeof unit.hp === 'number' ? unit.hp : stats.hpMax;
    document.getElementById('detail-hp').textContent = `${currentHp} / ${stats.hpMax}`;
    document.getElementById('detail-dmg').textContent = stats.wuli > 0 ? stats.wuli : '0';
    document.getElementById('detail-atk-speed').textContent = template.atkSpeed > 0 ? `${template.atkSpeed}/s` : '0/s';
    document.getElementById('detail-range').textContent = template.range > 0 ? `${template.range} 格` : '靜態設施';
    
    // Skill information with multipliers scaled by skill level
    const elSkillName = document.getElementById('detail-skill-name');
    const elSkillDesc = document.getElementById('detail-skill-desc');
    
    elSkillName.innerHTML = `${template.skillName} <span class="skill-badge active-type">主動</span> <span style="font-size:0.75rem;color:var(--text-secondary);">Lv.${unit.skillLevel}</span>`;
    elSkillDesc.textContent = getSkillLevelDescription(template, unit.skillLevel);

    // Render Secondary Skill
    const elExtraSkillBox = document.getElementById('detail-extra-skill-box');
    const elExtraSkillName = document.getElementById('detail-extra-skill-name');
    const elExtraSkillDesc = document.getElementById('detail-extra-skill-desc');
    
    if (template.extraSkillName) {
        elExtraSkillBox.style.display = 'block';
        const type = template.extraSkillConfig?.type || 'passive';
        let badgeClass = 'passive-type';
        let badgeText = '被動';
        if (type === 'assault') {
            badgeClass = 'assault-type';
            badgeText = '突擊';
        } else if (type === 'command' || type.startsWith('command')) {
            badgeClass = 'command-type';
            badgeText = '指揮';
        } else if (type.startsWith('formation')) {
            badgeClass = 'formation-type';
            badgeText = '陣法';
        }
        
        elExtraSkillName.innerHTML = `${template.extraSkillName} <span class="skill-badge ${badgeClass}">${badgeText}</span> <span style="font-size:0.75rem;color:var(--text-secondary);">Lv.${unit.skillLevel}</span>`;
        elExtraSkillDesc.textContent = getExtraSkillLevelDescription(template, unit.skillLevel);
    } else {
        elExtraSkillBox.style.display = 'none';
    }
    
    // Remove all previous action buttons
    elDetailContent.querySelectorAll('.btn-sidebar-upgrade, .btn-sidebar-sell, .btn-sidebar-bench, .detail-fusion-hint').forEach(el => el.remove());
    
    if (allowUpgrade && state.gameState === 'prep') {
        if (elSellZone) {
            const gold = template.cost * unit.star;
            const label = elSellZone.querySelector('.sell-zone-text');
            if (label) {
                label.innerHTML = `點擊此處出售 ${template.name}，可獲得 🪙 ${gold} 金幣`;
            }
            elSellZone.classList.remove('hidden');
        }
        if (!template.isBuilding) {
            const upgradeSkillCost = getSkillUpgradeCost(unit.skillLevel);
            const upgradeBtn = document.createElement('button');
            upgradeBtn.className = 'btn-sidebar-upgrade';
            upgradeBtn.innerHTML = `升級戰法 (🪙 ${upgradeSkillCost} 金幣)`;
            if (state.gold < upgradeSkillCost || unit.skillLevel >= 5) {
                upgradeBtn.disabled = true;
                if (unit.skillLevel >= 5) upgradeBtn.innerHTML = '戰法已達最大等級 (5級)';
            }
            upgradeBtn.addEventListener('click', () => upgradeHeroSkill(unit));
            elDetailContent.appendChild(upgradeBtn);
        }
        if (state.selectedEntity && state.selectedEntity.source === 'board') {
            const benchBtn = document.createElement('button');
            benchBtn.className = 'btn-sidebar-bench';
            benchBtn.innerHTML = '↩ 回收至儲備欄';
            benchBtn.addEventListener('click', () => {
                const idx = state.selectedEntity ? state.selectedEntity.index : -1;
                if (idx === -1) return;
                const u = state.deployedUnits[idx];
                if (!u) return;
                const emptySlot = state.bench.findIndex(s => s === null);
                if (emptySlot === -1) { addLog('儲備欄已滿！', 'damage'); return; }
                state.deployedUnits.splice(idx, 1);
                state.bench[emptySlot] = { templateId: u.templateId, star: u.star, skillLevel: u.skillLevel };
                state.selectedEntity = null;
                recalculateDeployCost();
                addLog(`${UNIT_TEMPLATES[u.templateId].name} 已回到儲備欄。`, 'system');
                hideDetailCard(); renderBench(); renderBoard(); updateUI();
            });
            elDetailContent.appendChild(benchBtn);
        }
        const sellValue = template.cost * unit.star;
        const sellBtn = document.createElement('button');
        sellBtn.className = 'btn-sidebar-sell';
        sellBtn.innerHTML = `💰 出售可得 🪙 ${sellValue} 金幣`;
        sellBtn.addEventListener('click', () => {
            if (!state.selectedEntity) return;
            const src = state.selectedEntity.source;
            const idx = state.selectedEntity.index;
            let u = null;
            if (src === 'bench') { u = state.bench[idx]; if (u) state.bench[idx] = null; }
            else { u = state.deployedUnits[idx]; if (u) state.deployedUnits.splice(idx, 1); }
            if (u) {
                const tmpl = UNIT_TEMPLATES[u.templateId];
                const gold = tmpl.cost * u.star;
                state.gold += gold;
                addLog(`成功出售 ${tmpl.name}（${u.star}星），獲得 🪙 ${gold} 金幣。`, 'victory');
                playSound('heal');
                recalculateDeployCost();
            }
            state.selectedEntity = null;
            hideDetailCard(); renderBench(); renderBoard(); updateUI();
        });
        elDetailContent.appendChild(sellBtn);
        if (state.selectedEntity && state.selectedEntity.source === 'bench') {
            const hint = document.createElement('div');
            hint.className = 'detail-fusion-hint';
            hint.innerHTML = `✨ 點擊戰場上的 <strong>${template.name}</strong> 即可合並升星！`;
            elDetailContent.appendChild(hint);
        }
    }
}

function hideDetailCard() {
    elDetailContent.classList.add('hidden');
    const placeholder = elDetailPanel.querySelector('.detail-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');
    if (elSellZone) elSellZone.classList.add('hidden');
}

function getSkillUpgradeCost(level) {
    // Level 1 -> 2: 3 Gold
    // Level 2 -> 3: 5 Gold
    // Level 3 -> 4: 8 Gold
    // Level 4 -> 5: 12 Gold
    return level * 3 + (level > 2 ? level : 0);
}

function getSkillLevelDescription(template, level) {
    const multiplier = 1 + (level - 1) * 0.25; // +25% effectiveness per level
    const config = template.skillConfig;
    if (!config) return template.skillDesc;
    
    let desc = template.skillDesc;
    if (config.type === 'aoe_dmg_heal') {
        const dmgVal = Math.round(config.dmgMult * multiplier * 100);
        const healVal = Math.round(config.healMult * multiplier * 100);
        desc = `對3x3範圍內的敵人造成 ${dmgVal}% 智力的謀略傷害，並為友軍恢復 ${healVal}% 智力的生命值。`;
    } else if (config.type === 'taunt_shield_sweep') {
        const dmgVal = Math.round(config.dmgMult * multiplier * 100);
        const shieldVal = Math.round(config.shieldMult * multiplier * 100);
        desc = `對前方2x3範圍內的敵人造成 ${dmgVal}% 武力的物理傷害，嘲諷敵人並獲得相當於 ${shieldVal}% 統率的防禦護盾，持續 4 秒。`;
    } else if (config.type === 'summon_buff') {
        const shieldVal = Math.round(config.shieldMult * multiplier * 100);
        const healVal = Math.round(config.healMult * multiplier * 100);
        desc = `召喚 2 名丹陽精兵協助作戰，並為我軍全體提供 ${shieldVal}% 統率的防禦護盾，同時恢復全體 ${healVal}% 智力的生命值。`;
    } else if (config.type === 'push_dive') {
        const reductionPercent = Math.round(config.dmgReduction * 100);
        const diveReductionPercent = Math.round(config.tauntDmgReduction * 100);
        desc = `將前方的敵人擊退 ${config.pushDist} 格。趙雲獲得 ${reductionPercent}% 免傷，且受擊退的敵軍攻擊自己時降低 ${diveReductionPercent}% 傷害，持續 ${config.durationSec} 秒。（當前戰法等級 ${level}，增加屬性收益）`;
    }
    return desc;
}

function upgradeHeroSkill(unit) {
    const cost = getSkillUpgradeCost(unit.skillLevel);
    if (state.gold >= cost && unit.skillLevel < 5) {
        state.gold -= cost;
        unit.skillLevel++;
        addLog(`已將 ${UNIT_TEMPLATES[unit.templateId].name} 的戰法等級提升至 ${unit.skillLevel}級！`, 'victory');
        
        showDetailCard(unit);
        updateUI();
    }
}

// ==========================================
// LOGGING UTILITY
// ==========================================
export function addLog(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[Round ${state.round}] ${message}`;
    
    elLogBody.appendChild(entry);
    elLogBody.scrollTop = elLogBody.scrollHeight;
}

// ==========================================
// COMBAT HANDOFF
// ==========================================
function triggerBattleStart() {
    if (state.gameState !== 'prep') return;
    
    if (state.isPvp) {
        if (state.pvpLobbyId) {
            // In an active lobby — submit ready status
            if (!state.pvpMyReady && state.currentDeployCost > 0) {
                submitPvpReady();
            }
        }
        // If no lobby yet, button is disabled so this won't fire
        return;
    }
    
    // Single-player battle start
    if (state.deployedUnits.length === 0) return;
    
    // Clear selection
    state.selectedEntity = null;
    hideDetailCard();
    renderBench();
    renderBoard();
    
    // Save starting coordinates for restoration after battle ends
    state.deployedUnits.forEach(u => {
        u.startX = u.x;
        u.startY = u.y;
        u.isDead = false;
    });
    
    // Update button states
    state.gameState = 'battle';
    if (elDetailPanel) elDetailPanel.classList.add('hidden');
    if (elSynergyPanel) elSynergyPanel.classList.add('hidden');
    if (elDamageMeterContainer) elDamageMeterContainer.classList.remove('hidden');

    elBtnStart.disabled = true;
    elBtnStart.classList.remove('pulsing');
    elBtnRefresh.disabled = true;
    elBtnUpgrade.disabled = true;
    
    addLog("⚔ 戰鬥正式打響！ ⚔", "system");
    
    // Hand over control to battle.js with callbacks to break circular imports
    initBattle(state.deployedUnits, state.round, endBattle, addLog, state.activeFates, state.activeFactions, state.settings);
    startBattle();
}

// Called by battle.js when combat completes
export function endBattle(victory) {
    // Route to PvP battle handler if in a lobby
    if (state.isPvp && state.pvpLobbyId) {
        endPvpBattle(victory);
        return;
    }
    // Single-player
    if (victory) {
        addLog(`⚔ 第 ${state.round} 回合 勝利！ ⚔`, 'victory');
        showOverlay(true);
    } else {
        state.lives--;
        addLog(`⚔ 第 ${state.round} 回合 戰敗！剩餘生命值：${state.lives} ⚔`, 'damage');
        showOverlay(false);
    }
}

// ==========================================
// OVERLAYS (Victory/Defeat screen)
// ==========================================
function showOverlay(victory) {
    elOverlay.classList.remove('hidden');
    
    if (victory) {
        elOverlayTitle.textContent = "勝利";
        elOverlayTitle.className = "overlay-title victory";
        elOverlayDesc.textContent = `第 ${state.round} 回合通關成功！`;
        
        // Calculate victory rewards
        const interest = Math.min(Math.floor(state.gold / 10), 3);
        const unusedCost = state.maxDeployCost - state.currentDeployCost;
        
        elOverlayRewards.innerHTML = `
            <div>+5 基礎回合金幣</div>
            <div>+2 勝利獎勵金幣</div>
            ${interest > 0 ? `<div>+${interest} 利息金幣</div>` : ''}
            ${unusedCost > 0 ? `<div>+${unusedCost} 剩餘統禦獎勵</div>` : ''}
        `;
        
        // Reward gold instantly
        state.gold += 5 + 2 + unusedCost; // Base + victory + unused cost (interest is added inside startPrepPhase)
        
        elBtnOverlayAction.textContent = "下一回合";
    } else {
        elOverlayTitle.textContent = "敗北";
        elOverlayTitle.className = "overlay-title defeat";
        
        if (state.lives <= 0) {
            elOverlayDesc.textContent = `你在戰鬥中倒下了！最終止步回合：${state.round}`;
            elOverlayRewards.innerHTML = `
                <div style="color:var(--red);">遊戲結束</div>
                <div style="font-size:0.75rem;">大業未成而中道崩殂。</div>
            `;
            elBtnOverlayAction.textContent = "重新開始";
        } else {
            elOverlayDesc.textContent = `此役失利，大軍折損！`;
            elOverlayRewards.innerHTML = `
                <div style="color:var(--red);">-1 生命值</div>
                <div>+3 戰敗補償金幣</div>
            `;
            state.gold += 3; // Consolation gold
            elBtnOverlayAction.textContent = "重整軍備";
        }
    }
}

function handleOverlayAction() {
    // PvP game over — route to title screen
    if (state.pvpGameOver) {
        resetGameToTitle();
        return;
    }
    
    elOverlay.classList.add('hidden');
    
    if (state.lives <= 0) {
        // Reset full game
        state.gold = 10;
        state.maxDeployCost = 5;
        state.currentDeployCost = 0;
        state.lives = 3;
        state.round = 1;
        state.deployedUnits = [];
        state.bench = Array(8).fill(null);
        elLogBody.innerHTML = '';
        addLog("舊檔案已清除。正在開啟新的徵程...", "system");
        startPrepPhase();
    } else {
        // Increment round only on victory
        const lastBattleVictory = elOverlayTitle.classList.contains('victory');
        if (lastBattleVictory) {
            state.round++;
        }
        startPrepPhase();
    }
}



export function checkActiveFates() {
    state.activeFates = [];
    
    // Get unique template IDs of deployed player units
    const deployedIds = new Set(state.deployedUnits.map(u => u.templateId));
    
    // Check each fate template
    for (const key in FATE_TEMPLATES) {
        const fate = FATE_TEMPLATES[key];
        const hasAll = fate.requiredIds.every(id => deployedIds.has(id));
        if (hasAll) {
            state.activeFates.push(fate.id);
        }
    }

    // Count unique units per faction
    const factionUniqueCount = { shu: 0, wei: 0, wu: 0, qun: 0 };
    const countedTemplates = new Set();
    
    state.deployedUnits.forEach(u => {
        if (countedTemplates.has(u.templateId)) return;
        countedTemplates.add(u.templateId);
        
        const template = UNIT_TEMPLATES[u.templateId];
        if (template && factionUniqueCount[template.faction] !== undefined) {
            factionUniqueCount[template.faction]++;
        }
    });
    
    // Update active factions tiers (0 = none, 1 = tier 1 (>=2), 2 = tier 2 (>=4))
    for (const faction in factionUniqueCount) {
        const count = factionUniqueCount[faction];
        if (count >= 4) {
            state.activeFactions[faction] = 2;
        } else if (count >= 2) {
            state.activeFactions[faction] = 1;
        } else {
            state.activeFactions[faction] = 0;
        }
    }
    
    renderActiveFatesUI();
}

function renderActiveFatesUI() {
    const elBody = document.getElementById('synergy-body');
    if (!elBody) return;
    
    elBody.innerHTML = '';
    
    // Count deployed units to see progress on fates
    const deployedIds = new Set(state.deployedUnits.map(u => u.templateId));
    
    let activeCount = 0;

    // 1. Render Faction Synergies
    const factionLabels = {
        shu: { name: '蜀漢之志', stat: '最大兵力 +15% / +30%' },
        wei: { name: '曹魏霸業', stat: '智力屬性 +15% / +30%' },
        wu: { name: '孫吳聯盟', stat: '攻擊速度 +15% / +30%' },
        qun: { name: '群雄割據', stat: '統率防禦 +15% / +30%' }
    };
    
    // Let's count unique units per faction to show progress (e.g. 1/2 or 3/4)
    const factionUniqueCount = { shu: 0, wei: 0, wu: 0, qun: 0 };
    const countedTemplates = new Set();
    state.deployedUnits.forEach(u => {
        if (countedTemplates.has(u.templateId)) return;
        countedTemplates.add(u.templateId);
        const template = UNIT_TEMPLATES[u.templateId];
        if (template && factionUniqueCount[template.faction] !== undefined) {
            factionUniqueCount[template.faction]++;
        }
    });
    
    for (const faction in factionLabels) {
        const count = factionUniqueCount[faction];
        if (count > 0) {
            activeCount++;
            const tier = state.activeFactions[faction];
            const isActive = tier > 0;
            const progressText = count >= 4 ? `${count}/4` : `${count}/2`;
            const tierText = tier === 2 ? '階段 2 (+30%)' : (tier === 1 ? '階段 1 (+15%)' : '未激活');
            
            const item = document.createElement('div');
            item.className = `synergy-item faction-synergy ${isActive ? 'active' : ''} faction-${faction}`;
            item.innerHTML = `
                <div class="synergy-item-header">
                    <span class="synergy-item-name">${factionLabels[faction].name}</span>
                    <span class="synergy-item-progress">${progressText} (${tierText})</span>
                </div>
                <div class="synergy-item-desc">陣營羈絆: ${factionLabels[faction].stat}</div>
            `;
            elBody.appendChild(item);
        }
    }
    
    // 2. Render Fate Templates
    for (const key in FATE_TEMPLATES) {
        const fate = FATE_TEMPLATES[key];
        
        // Count how many required units are deployed
        const matchCount = fate.requiredIds.filter(id => deployedIds.has(id)).length;
        const totalReq = fate.requiredIds.length;
        const isActive = matchCount === totalReq;
        
        if (matchCount > 0) {
            activeCount++;
            
            const item = document.createElement('div');
            item.className = `synergy-item ${isActive ? 'active' : ''}`;
            
            // Build name text showing progress (e.g. 桃園三結義 (2/3))
            item.innerHTML = `
                <div class="synergy-item-header">
                    <span class="synergy-item-name">${fate.name}</span>
                    <span class="synergy-item-progress">${matchCount}/${totalReq}</span>
                </div>
                <div class="synergy-item-desc">${fate.desc}</div>
            `;
            elBody.appendChild(item);
        }
    }
    
    if (activeCount === 0) {
        elBody.innerHTML = `<div class="synergy-empty">暫無活躍羈絆。請上陣匹配的武將！</div>`;
    }
}

// ==========================================
// MENU AND SETTINGS HANDLERS
// ==========================================
// ==========================================
// USERNAME SYSTEM
// ==========================================

function setupUsernameOverlay() {
    // Update header player tag regardless
    updatePlayerTag();
    
    const savedUsername = localStorage.getItem('pvp_username');
    if (savedUsername && savedUsername.trim().length >= 2) {
        // Already have a username — hide entry overlay, show main menu
        if (elUsernameOverlay) elUsernameOverlay.classList.add('hidden');
        if (elMenuOverlay)     elMenuOverlay.classList.remove('hidden');
    } else {
        // First visit — hide menu, show username entry
        if (elMenuOverlay)     elMenuOverlay.classList.add('hidden');
        if (elUsernameOverlay) elUsernameOverlay.classList.remove('hidden');
        // Auto-focus input after a small delay (lets overlay animate in)
        setTimeout(() => { if (elUsernameInput) elUsernameInput.focus(); }, 350);
    }
    
    if (!elUsernameInput || !elUsernameConfirm) return;
    
    // Live character counter
    elUsernameInput.addEventListener('input', () => {
        const len = elUsernameInput.value.length;
        if (elUsernameCharCount) {
            elUsernameCharCount.textContent = `${len} / 12`;
            elUsernameCharCount.classList.toggle('near-limit', len >= 10);
        }
        // Clear error on typing
        showUsernameError('');
        elUsernameInput.classList.remove('input-error');
    });
    
    // Enter key triggers confirm
    elUsernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmUsername();
    });
    
    elUsernameConfirm.addEventListener('click', confirmUsername);
    
    // Clicking the player-tag in the header re-opens the username overlay
    if (elPlayerTag) {
        elPlayerTag.addEventListener('click', () => {
            if (elUsernameInput) {
                elUsernameInput.value = state.username;
                if (elUsernameCharCount) elUsernameCharCount.textContent = `${state.username.length} / 12`;
            }
            showUsernameError('');
            if (elUsernameOverlay) elUsernameOverlay.classList.remove('hidden');
            setTimeout(() => { if (elUsernameInput) elUsernameInput.focus(); }, 200);
        });
    }
}

function confirmUsername() {
    if (!elUsernameInput) return;
    const raw = elUsernameInput.value.trim();
    
    if (raw.length < 2) {
        showUsernameError('名號至少需要 2 個字元！');
        elUsernameInput.classList.add('input-error');
        elUsernameInput.focus();
        return;
    }
    if (raw.length > 12) {
        showUsernameError('名號最多 12 個字元！');
        elUsernameInput.classList.add('input-error');
        return;
    }
    
    // Save
    state.username = raw;
    localStorage.setItem('pvp_username', raw);
    updatePlayerTag();
    
    // Hide entry overlay, show main menu
    if (elUsernameOverlay) elUsernameOverlay.classList.add('hidden');
    if (elMenuOverlay)     elMenuOverlay.classList.remove('hidden');
}

function showUsernameError(msg) {
    if (!elUsernameError) return;
    elUsernameError.textContent = msg;
    if (msg) {
        elUsernameError.classList.add('visible');
    } else {
        elUsernameError.classList.remove('visible');
    }
}

function updatePlayerTag() {
    if (!elPlayerTag) return;
    const name = state.username || localStorage.getItem('pvp_username') || '';
    if (name) {
        elPlayerTag.innerHTML = `⚔ ${name} <span class="edit-hint">(更改)</span>`;
    } else {
        elPlayerTag.innerHTML = '⚔ 設定名號...';
    }
}

function handleMenuStart() {
    if (elMenuOverlay) {
        elMenuOverlay.classList.add('hidden');
    }
    
    // Dummy Audio Context gesture unlock
    try {
        const dummyCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (dummyCtx.state === 'suspended') {
            dummyCtx.resume();
        }
    } catch(e) {
        console.warn('Audio Context unlock failed:', e);
    }
    
    state.isPvp = false;
    startPrepPhase();
}

// ==========================================
// PvP LOBBY SYSTEM
// ==========================================

function handleMenuPvp() {
    if (elMenuOverlay) elMenuOverlay.classList.add('hidden');
    
    // Audio Context unlock
    try {
        const dummyCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (dummyCtx.state === 'suspended') dummyCtx.resume();
    } catch(e) { console.warn('Audio Context unlock failed:', e); }
    
    // Reset PvP state
    state.isPvp = true;
    state.pvpLobbyId = null;
    state.pvpMyPoints = 0;
    state.pvpOppPoints = 0;
    state.pvpTimeRemaining = 30;
    state.pvpMyReady = false;
    state.pvpLobbyStatus = null;
    state.pvpGameOver = false;
    pvpWaitingForReport = false;
    
    // Start prep phase so player can arrange units while waiting
    startPrepPhase();
    
    // Show matchmaking overlay and wait for room confirmation
    showPvpMatchmakingOverlay();
}

function showPvpMatchmakingOverlay() {
    if (elPvpOverlay) elPvpOverlay.classList.remove('hidden');
    
    const elSetupZone = document.getElementById('pvp-setup-zone');
    const elQueueZone = document.getElementById('pvp-queue-zone');
    const elMatchedZone = document.getElementById('pvp-matched-zone');
    
    if (elSetupZone) elSetupZone.classList.remove('hidden');
    if (elQueueZone) elQueueZone.classList.add('hidden');
    if (elMatchedZone) elMatchedZone.classList.add('hidden');
    
    if (elBtnPvpCancel) {
        elBtnPvpCancel.style.display = '';
        elBtnPvpCancel.textContent = '返回主選單';
    }
}

function startPvpQueueFlow() {
    const elSetupZone = document.getElementById('pvp-setup-zone');
    const elQueueZone = document.getElementById('pvp-queue-zone');
    const elRoomInput = document.getElementById('pvp-room-input');
    
    const roomCode = elRoomInput ? elRoomInput.value.trim() : '';
    
    if (elSetupZone) elSetupZone.classList.add('hidden');
    if (elQueueZone) elQueueZone.classList.remove('hidden');
    if (elBtnPvpCancel) elBtnPvpCancel.textContent = '取消尋找';
    
    if (elPvpTimerVal) elPvpTimerVal.textContent = '0';
    if (elPvpStatusText) {
        if (roomCode) {
            elPvpStatusText.innerHTML = `正在加入房間 <span style="color: var(--gold); font-weight: bold;">${roomCode}</span> 備戰中...<br>等待好友加入中 <span id="pvp-timer-val" style="color: var(--gold); font-weight: bold;">0</span> 秒`;
        } else {
            elPvpStatusText.innerHTML = '正在召集各路群雄...<br>已等待 <span id="pvp-timer-val" style="color: var(--gold); font-weight: bold;">0</span> 秒';
        }
    }
    
    joinPvpQueue(roomCode);
}

async function joinPvpQueue(roomCode = '') {
    if (pvpTimerInterval) { clearInterval(pvpTimerInterval); pvpTimerInterval = null; }
    
    addLog(`📢 聯機模式。正在${roomCode ? '加入房號：' + roomCode : '搜尋對手'}，請同時布置陣容...`, 'system');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/pvp/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                playerId: state.pvpPlayerId, 
                team: [], 
                username: state.username || '主公',
                room: roomCode
            })
        });
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        
        if (data.status === 'matched') {
            onPvpLobbyMatched(data.lobbyId);
        } else {
            let waitTimer = 0;
            pvpTimerInterval = setInterval(async () => {
                waitTimer++;
                const timerValEl = document.getElementById('pvp-timer-val');
                if (timerValEl) timerValEl.textContent = waitTimer;
                
                try {
                    const fallback = roomCode ? false : (waitTimer >= 5);
                    const pollRes = await fetch(`${API_BASE_URL}/api/pvp/poll?playerId=${state.pvpPlayerId}&fallback=${fallback}`);
                    if (!pollRes.ok) return;
                    const pollData = await pollRes.json();
                    if (pollData.status === 'matched') {
                        clearInterval(pvpTimerInterval);
                        pvpTimerInterval = null;
                        onPvpLobbyMatched(pollData.lobbyId);
                    }
                } catch(e) { console.error('Matchmaking poll error:', e); }
            }, 1000);
        }
    } catch(e) {
        console.error('Failed to join PvP queue:', e);
        addLog('聯機匹配失敗，請檢查伺服器連接。', 'damage');
        if (elPvpOverlay) elPvpOverlay.classList.add('hidden');
        state.isPvp = false;
        updateUI();
    }
}

function onPvpLobbyMatched(lobbyId) {
    state.pvpLobbyId = lobbyId;
    
    if (elBtnPvpCancel) elBtnPvpCancel.style.display = 'none';
    
    const elQueueZone = document.getElementById('pvp-queue-zone');
    const elMatchedZone = document.getElementById('pvp-matched-zone');
    if (elQueueZone) elQueueZone.classList.add('hidden');
    if (elMatchedZone) elMatchedZone.classList.remove('hidden');
    
    const myNameEl = document.getElementById('pvp-match-my-name');
    if (myNameEl) myNameEl.textContent = state.username || '我方主公';
    
    const oppNameEl = document.getElementById('pvp-match-opp-name');
    if (oppNameEl) oppNameEl.textContent = '尋找中...';
    
    pollLobbyStateOnceForMatched();
    
    let countdown = 3;
    const countdownValEl = document.getElementById('pvp-match-countdown-val');
    if (countdownValEl) countdownValEl.textContent = countdown;
    
    const countdownTimer = setInterval(() => {
        countdown--;
        if (countdownValEl) countdownValEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownTimer);
            if (elPvpOverlay) elPvpOverlay.classList.add('hidden');
            startPvpLobbyPoll();
            addLog(`✅ 配對成功！大廳：${lobbyId.slice(-8)}。請在 30 秒備戰時間內完成布陣。`, 'victory');
            updateUI();
        }
    }, 1000);
}

async function pollLobbyStateOnceForMatched() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/pvp/poll?playerId=${state.pvpPlayerId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'in_lobby') {
            const oppNameEl = document.getElementById('pvp-match-opp-name');
            if (oppNameEl && data.oppUsername) {
                oppNameEl.textContent = data.oppUsername;
            }
        }
    } catch (e) {
        console.error('Failed to poll opponent name for matched screen:', e);
    }
}

function startPvpLobbyPoll() {
    stopPvpLobbyPoll();
    pvpLobbyPollInterval = setInterval(pollLobbyState, 1000);
}

function stopPvpLobbyPoll() {
    if (pvpLobbyPollInterval) {
        clearInterval(pvpLobbyPollInterval);
        pvpLobbyPollInterval = null;
    }
}

async function pollLobbyState() {
    if (!state.pvpLobbyId) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/pvp/poll?playerId=${state.pvpPlayerId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== 'in_lobby') return;
        
        const prevLobbyStatus = state.pvpLobbyStatus;
        
        // Sync server state to client
        state.pvpLobbyStatus   = data.lobbyStatus;
        state.pvpMyPoints      = data.myPoints;
        state.pvpOppPoints     = data.oppPoints;
        state.pvpTimeRemaining = data.remainingPrepTime;
        state.pvpMyReady       = data.myReady;
        state.round            = data.currentRound;
        if (data.oppUsername)  state.pvpOppUsername = data.oppUsername;

        if (data.lobbyStatus === 'prep') {
            if (pvpWaitingForReport) {
                // Both players reported — advance to next round
                pvpWaitingForReport = false;
                hidePvpWaitingOverlay();
                state.pvpMyReady = false;
                startPrepPhase();
                addLog(`🔔 對手已結算。第 ${state.round} 回合備戰開始！`, 'system');
            }
            // Auto-submit ready when prep timer expires
            if (data.remainingPrepTime <= 0 && !state.pvpMyReady && state.gameState === 'prep') {
                addLog('⏱ 備戰時間到！自動提交當前陣容。', 'system');
                submitPvpReady();
            }
        }
        else if (data.lobbyStatus === 'combat') {
            // Transition from prep → combat
            if (state.gameState === 'prep' && !pvpWaitingForReport) {
                startPvpCombat(data);
            }
        }
        else if (data.lobbyStatus === 'game_over') {
            if (!state.pvpGameOver) {
                stopPvpLobbyPoll();
                if (pvpWaitingForReport) hidePvpWaitingOverlay();
                showPvpGameOver();
            }
        }
        
        updateUI();
    } catch(e) {
        console.error('Lobby poll error:', e);
    }
}

async function submitPvpReady() {
    if (state.pvpMyReady) return;
    if (!state.pvpLobbyId) return;
    
    state.pvpMyReady = true;
    
    const serializedTeam = state.deployedUnits.map(u => ({
        templateId: u.templateId,
        star: u.star,
        skillLevel: u.skillLevel,
        x: u.x,
        y: u.y
    }));
    
    // Save start positions for post-battle restoration
    state.deployedUnits.forEach(u => {
        u.startX = u.x;
        u.startY = u.y;
        u.isDead = false;
    });
    
    updateUI();
    
    try {
        await fetch(`${API_BASE_URL}/api/pvp/lobby/ready`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: state.pvpPlayerId,
                lobbyId:  state.pvpLobbyId,
                team:     serializedTeam
            })
        });
        addLog('⚔ 已提交陣容，等待對手就緒...', 'system');
    } catch(e) {
        console.error('Failed to submit ready:', e);
        state.pvpMyReady = false;
        updateUI();
    }
}

function startPvpCombat(data) {
    // Ensure start coordinates saved (guard for auto-ready case)
    state.deployedUnits.forEach(u => {
        if (u.startX === undefined) { u.startX = u.x; u.startY = u.y; }
        u.isDead = false;
    });
    
    state.gameState = 'battle';
    if (elDetailPanel) elDetailPanel.classList.add('hidden');
    if (elSynergyPanel) elSynergyPanel.classList.add('hidden');
    if (elDamageMeterContainer) elDamageMeterContainer.classList.remove('hidden');

    if (elBtnStart) { elBtnStart.disabled = true; elBtnStart.classList.remove('pulsing'); }
    if (elBtnRefresh) elBtnRefresh.disabled = true;
    if (elBtnUpgrade) elBtnUpgrade.disabled = true;
    
    // Clear board selection
    state.selectedEntity = null;
    hideDetailCard();
    renderBench();
    renderBoard();
    
    const oppName = data.opponent.username
        || (data.opponent.playerId.startsWith('shadow_')
            ? `世家子弟_${data.opponent.playerId.split('_')[1]}`
            : `主公_${data.opponent.playerId.slice(-6)}`);
    // Cache for score display
    state.pvpOppUsername = oppName;
    
    addLog(`⚔ 第 ${state.round} 回合戰鬥開始！對手：${oppName} ⚔`, 'victory');
    if (data.isShadow) addLog('📢 無真實對手，已載入影子陣容。', 'system');
    
    // Upload our team as a shadow candidate for future matches
    const myTeam = state.deployedUnits.map(u => ({ templateId: u.templateId, star: u.star, skillLevel: u.skillLevel, x: u.x, y: u.y }));
    fetch(`${API_BASE_URL}/api/pvp/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: myTeam, playerId: state.pvpPlayerId, username: state.username || '主公' })
    }).catch(e => console.warn('Failed to upload PvP team:', e));
    
    const pvpConfig = { isPvp: true, seed: data.seed, opponentUnits: data.opponent.team };
    initBattle(state.deployedUnits, state.round, endBattle, addLog, state.activeFates, state.activeFactions, state.settings, pvpConfig);
    startBattle();
}

async function endPvpBattle(victory) {
    pvpWaitingForReport = true;
    const result = victory ? 'victory' : 'defeat';
    
    addLog(
        victory
            ? `⚔ 第 ${state.round} 回合 勝利！等待對手結算...`
            : `⚔ 第 ${state.round} 回合 落敗！等待對手結算...`,
        victory ? 'victory' : 'damage'
    );
    
    showPvpWaitingOverlay(victory);
    updateUI();
    
    try {
        await fetch(`${API_BASE_URL}/api/pvp/lobby/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: state.pvpPlayerId,
                lobbyId:  state.pvpLobbyId,
                result:   result
            })
        });
    } catch(e) {
        console.error('Failed to report battle result:', e);
    }
    // The lobby poll drives all subsequent transitions
}

function showPvpWaitingOverlay(victory) {
    elOverlay.classList.remove('hidden');
    elOverlayTitle.textContent = victory ? '⚔ 勝利' : '💀 落敗';
    elOverlayTitle.className = `overlay-title ${victory ? 'victory' : 'defeat'}`;
    elOverlayDesc.textContent = '正在同步對局結果，請稍候...';
    elOverlayRewards.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px;">
            <div class="pvp-loading-spinner" style="width:22px;height:22px;border-width:3px;"></div>
            <span style="color:var(--text-secondary);">等待對手結算中...</span>
        </div>
    `;
    elBtnOverlayAction.style.display = 'none';
}

function hidePvpWaitingOverlay() {
    elOverlay.classList.add('hidden');
    elBtnOverlayAction.style.display = '';
}

function showPvpGameOver() {
    state.pvpGameOver = true;
    const myPts  = state.pvpMyPoints;
    const oppPts = state.pvpOppPoints;
    const iWon   = myPts > oppPts;
    const isDraw = myPts === oppPts;
    
    elOverlay.classList.remove('hidden');
    elBtnOverlayAction.style.display = '';
    
    elOverlayTitle.textContent = isDraw ? '⚖ 平局' : (iWon ? '🏆 戰役勝利' : '💀 戰役落敗');
    elOverlayTitle.className   = `overlay-title ${iWon ? 'victory' : (isDraw ? '' : 'defeat')}`;
    elOverlayDesc.textContent  = '20 回合征途落幕！';
    
    elOverlayRewards.innerHTML = `
        <div style="font-size:1.15rem;margin:10px 0;">
            <span style="color:var(--gold);font-weight:700;">己方積分：${myPts}</span>
            &nbsp;vs&nbsp;
            <span style="color:#f87171;font-weight:700;">對手積分：${oppPts}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">
            ${iWon  ? '✨ 恭喜！以謀略制勝，一統天下！'
             : isDraw ? '⚖ 旗鼓相當，難分高下！'
                     : '💀 英雄末路，此役落敗。明日再戰！'}
        </div>
    `;
    elBtnOverlayAction.textContent = '返回主選單';
    
    addLog(`🏁 戰役結束！己方 ${myPts} 分 vs 對手 ${oppPts} 分。${iWon ? '勝利！' : (isDraw ? '平局。' : '落敗。')}`, iWon ? 'victory' : 'damage');
}

function resetGameToTitle() {
    // Stop all PvP intervals
    stopPvpLobbyPoll();
    if (pvpTimerInterval) { clearInterval(pvpTimerInterval); pvpTimerInterval = null; }
    
    // Reset all state
    state.gold             = 10;
    state.maxDeployCost    = 5;
    state.currentDeployCost = 0;
    state.lives            = 3;
    state.round            = 1;
    state.gameState        = 'prep';
    state.isPvp            = false;
    state.pvpLobbyId       = null;
    state.pvpMyPoints      = 0;
    state.pvpOppPoints     = 0;
    state.pvpOppUsername   = '';
    state.pvpTimeRemaining = 30;
    state.pvpMyReady       = false;
    state.pvpLobbyStatus   = null;
    state.pvpGameOver      = false;
    pvpWaitingForReport    = false;
    state.deployedUnits    = [];
    state.bench            = Array(8).fill(null);
    
    // Reset UI
    elOverlay.classList.add('hidden');
    elBtnOverlayAction.style.display = '';
    elBtnStart.textContent = '進入戰鬥';
    elLogBody.innerHTML = '';
    
    // Show title screen
    if (elMenuOverlay) elMenuOverlay.classList.remove('hidden');
}

function cancelPvpMatchmaking() {
    // Stop matchmaking timer
    if (pvpTimerInterval) { clearInterval(pvpTimerInterval); pvpTimerInterval = null; }
    // Stop lobby poll if running
    stopPvpLobbyPoll();
    
    if (elPvpOverlay) elPvpOverlay.classList.add('hidden');
    
    // Notify server to remove from queue / lobby
    fetch(`${API_BASE_URL}/api/pvp/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: state.pvpPlayerId })
    }).catch(e => console.warn('Failed to cancel matchmaking:', e));
    
    // Reset PvP state and return to single-player mode
    state.isPvp          = false;
    state.pvpLobbyId     = null;
    state.pvpMyReady     = false;
    state.pvpLobbyStatus = null;
    pvpWaitingForReport  = false;
    
    addLog('已取消匹配尋找。', 'system');
    updateUI();
}

function handleMenuRoster() {
    if (elRosterOverlay) {
        elRosterOverlay.classList.remove('hidden');
        populateRosterGrid();
    }
}

function handleCloseRoster() {
    if (elRosterOverlay) {
        elRosterOverlay.classList.add('hidden');
    }
}

function handleToggleAudio() {
    state.settings.audio = !state.settings.audio;
    
    if (elBtnToggleAudio) {
        elBtnToggleAudio.textContent = state.settings.audio ? 'ON' : 'OFF';
        if (state.settings.audio) {
            elBtnToggleAudio.classList.add('active');
        } else {
            elBtnToggleAudio.classList.remove('active');
        }
    }
    
    if (elBtnQuickAudio) {
        elBtnQuickAudio.textContent = state.settings.audio ? '🔊 ON' : '🔇 OFF';
        if (state.settings.audio) {
            elBtnQuickAudio.classList.add('active');
        } else {
            elBtnQuickAudio.classList.remove('active');
        }
    }
    
    setCombatAudio(state.settings.audio);
}

function handleToggleSpeed() {
    let nextSpeed = state.settings.speed + 1;
    if (nextSpeed > 3) nextSpeed = 1;
    selectCombatSpeed(nextSpeed);
}

function selectCombatSpeed(speed) {
    state.settings.speed = speed;
    
    document.querySelectorAll('.btn-speed-select').forEach(btn => {
        if (parseInt(btn.dataset.speed) === speed) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    if (elBtnQuickSpeed) {
        elBtnQuickSpeed.textContent = `⚡ ${speed}X`;
        if (speed > 1) {
            elBtnQuickSpeed.classList.add('active');
        } else {
            elBtnQuickSpeed.classList.remove('active');
        }
    }
    
    setCombatSpeed(speed);
}

function populateRosterGrid() {
    elRosterGrid.innerHTML = '';
    
    for (const key in UNIT_TEMPLATES) {
        const template = UNIT_TEMPLATES[key];
        if (['shu', 'wei', 'wu', 'qun', 'building'].includes(template.faction)) {
            const item = document.createElement('div');
            item.className = `roster-item faction-${template.faction}`;
            
            const portraitStyle = template.portrait 
                ? `background-image: url('${template.portrait}');` 
                : `background-color: ${template.color}22; display:flex; align-items:center; justify-content:center;`;
            
            item.innerHTML = `
                <div class="roster-item-header">
                    <span class="roster-item-name">${template.name}</span>
                    <span class="roster-item-cost">🪙 ${template.cost}</span>
                </div>
                <div class="roster-item-portrait" style="${portraitStyle}; border-color: ${template.color};">
                    ${template.portrait ? '' : `<span style="font-family: var(--font-header); font-size:3rem; color:${template.color}; text-shadow:0 0 15px ${template.color}aa">${template.avatarText}</span>`}
                    <div class="roster-faction-badge faction-${template.faction}">${factionChinese[template.faction] || template.faction.toUpperCase()}</div>
                </div>
            `;
            
            item.addEventListener('click', () => showRosterDetail(template));
            elRosterGrid.appendChild(item);
        }
    }
}


function getSkillTypeText(type) {
    if (type === 'assault') return '突擊';
    if (type === 'command' || type?.startsWith('command')) return '指揮';
    if (type?.startsWith('formation')) return '陣法';
    return '被動';
}

function getExtraSkillLevelDescription(template, level) {
    const scale = 1 + (level - 1) * 0.25;
    const config = template.extraSkillConfig;
    if (!config) return template.extraSkillDesc || '-';
    
    if (template.id === 'zhuge_liang') {
        const counterDmg = Math.round(150 * scale);
        return `指揮：敵軍試圖發動主動戰法時，有 35% 幾率使其陷入計窮狀態（無法施法）2 秒，並對其造成 ${counterDmg}% 智力的謀略傷害。`;
    }
    if (template.id === 'zhang_fei') {
        const dmgBuff = Math.round(20 * scale);
        const defShred = Math.round(25 * scale);
        return `被動：每次受到傷害時，使自身下一次攻擊或戰法造成的傷害提升 ${dmgBuff}%，並降低攻擊者 ${defShred}% 統率（防禦），持續 3 秒。`;
    }
    if (template.id === 'cao_cao') {
        const dmgBuff = Math.round(12 * scale);
        const dr = Math.round(15 * scale);
        return `指揮：使我軍全體造成的傷害提升 ${dmgBuff}%，並使曹操自身受到的傷害降低 ${dr}%。`;
    }
    if (template.id === 'liu_bei') {
        const heal = Math.round(80 * scale);
        return `指揮：每 3 秒治療我軍兵力最低的單體（${heal}% 智力），並有 15% 幾率使隨機敵軍陷入繳械狀態（無法普攻）2 秒。`;
    }
    if (template.id === 'guan_yu') {
        const wuli = Math.round(20 * scale);
        return `被動：普通攻擊時，有 30% 幾率獲得 1 層抵禦（免疫下一次傷害），並提升自身 ${wuli}% 武力，持續 3 秒。`;
    }
    if (template.id === 'sun_quan') {
        const dmg = Math.round(180 * scale);
        return `突擊（35%）：普通攻擊後，對目標造成 ${dmg}% 智力的謀略傷害，並恢復自身等同於傷害量 100% 的生命值。`;
    }
    if (template.id === 'lu_xun') {
        const dmg = Math.round(160 * scale);
        const stunChance = Math.round(40 * scale);
        return `突擊（30%）：普通攻擊後，對目標造成 ${dmg}% 智力的謀略傷害。若目標處於灼燒狀態，則有 ${stunChance}% 幾率使其震懾（無法行動）1.5 秒。`;
    }
    if (template.id === 'yuan_shu') {
        const dmg = Math.round(200 * scale);
        return `突擊（35%）：普通攻擊後，對目標造成 ${dmg}% 武力的物理傷害。`;
    }
    if (template.id === 'sima_yi') {
        const dmg = Math.round(100 * scale);
        return `被動：戰鬥開始後，每 4 秒對隨機敵軍 2 人造成謀略傷害（傷害率依次為 ${dmg}% / ${Math.round(150 * scale)}% / ${Math.round(200 * scale)}% / ${Math.round(250 * scale)}%，受智力影響）。`;
    }
    if (template.id === 'lu_bu') {
        const dmg = Math.round(160 * scale);
        const splash = Math.round(80 * scale);
        return `突擊（30%）：普通攻擊後，對目標造成 ${dmg}% 武力的物理傷害，並對敵軍兵力最低的單體濺射 ${splash}% 的傷害。`;
    }
    return template.extraSkillDesc || '-';
}

function showRosterDetail(template) {
    if (!elRosterDetailOverlay) return;
    
    const elPortrait = document.getElementById('roster-detail-portrait');
    const elName = document.getElementById('roster-detail-name');
    const elCost = document.getElementById('roster-detail-cost');
    const elFaction = document.getElementById('roster-detail-faction');
    const elRole = document.getElementById('roster-detail-role');
    
    const elHp = document.getElementById('roster-detail-hp');
    const elWuli = document.getElementById('roster-detail-wuli');
    const elZhili = document.getElementById('roster-detail-zhili');
    const elTongshuai = document.getElementById('roster-detail-tongshuai');
    const elAtkSpeed = document.getElementById('roster-detail-atk-speed');
    const elRange = document.getElementById('roster-detail-range');
    
    const elSkillName = document.getElementById('roster-detail-skill-name');
    const elSkillDesc = document.getElementById('roster-detail-skill-desc');
    
    const elExtraSkillBox = document.getElementById('roster-detail-extra-skill-box');
    const elExtraSkillName = document.getElementById('roster-detail-extra-skill-name');
    const elExtraSkillDesc = document.getElementById('roster-detail-extra-skill-desc');
    
    // Set text values
    elName.textContent = template.name;
    elCost.textContent = `🪙 ${template.cost}`;
    elRole.textContent = template.role;
    
    // Faction style
    elFaction.className = `roster-detail-faction-badge faction-${template.faction}`;
    elFaction.textContent = factionChinese[template.faction] || template.faction.toUpperCase();
    
    // Portrait design
    if (template.portrait) {
        elPortrait.style.backgroundImage = `url('${template.portrait}')`;
        elPortrait.style.backgroundColor = 'transparent';
        elPortrait.style.borderColor = template.color;
        elPortrait.innerHTML = '';
    } else {
        elPortrait.style.backgroundImage = 'none';
        elPortrait.style.backgroundColor = `${template.color}22`;
        elPortrait.style.borderColor = template.color;
        elPortrait.innerHTML = `<span style="font-family: var(--font-header); font-size:4rem; color:${template.color}; text-shadow:0 0 15px ${template.color}aa">${template.avatarText}</span>`;
    }
    elPortrait.style.display = 'flex';
    elPortrait.style.alignItems = 'center';
    elPortrait.style.justifyContent = 'center';
    
    // Base Stats
    elHp.textContent = `${template.hp} / ${template.hp}`;
    elWuli.textContent = template.wuli || '0';
    elZhili.textContent = template.zhili || '0';
    elTongshuai.textContent = template.tongshuai || '0';
    elAtkSpeed.textContent = template.atkSpeed > 0 ? `${template.atkSpeed}/s` : '0/s';
    elRange.textContent = template.range > 0 ? `${template.range} 格` : '靜態設施';
    
    // Primary Active skill
    elSkillName.innerHTML = `${template.skillName} <span class="skill-badge active-type">主動</span>`;
    elSkillDesc.textContent = template.skillDesc;
    
    // Secondary extra skill
    if (template.extraSkillName) {
        elExtraSkillBox.style.display = 'block';
        const type = template.extraSkillConfig?.type || 'passive';
        let badgeClass = 'passive-type';
        let badgeText = '被動';
        if (type === 'assault') {
            badgeClass = 'assault-type';
            badgeText = '突擊';
        } else if (type === 'command' || type.startsWith('command')) {
            badgeClass = 'command-type';
            badgeText = '指揮';
        } else if (type.startsWith('formation')) {
            badgeClass = 'formation-type';
            badgeText = '陣法';
        }
        
        elExtraSkillName.innerHTML = `${template.extraSkillName} <span class="skill-badge ${badgeClass}">${badgeText}</span>`;
        elExtraSkillDesc.textContent = template.extraSkillDesc;
    } else {
        elExtraSkillBox.style.display = 'none';
    }
    
    elRosterDetailOverlay.classList.remove('hidden');
}

function getSelectedUnitData() {
    if (!state.selectedEntity) return null;
    const src = state.selectedEntity.source;
    const idx = state.selectedEntity.index;
    let unit = null;
    if (src === 'bench') {
        unit = state.bench[idx];
    } else if (src === 'board') {
        unit = state.deployedUnits[idx];
    }
    if (!unit) return null;
    const template = UNIT_TEMPLATES[unit.templateId];
    return { unit, template };
}

async function fetchLocalIp() {
    const hn = window.location.hostname;
    const isLocal = hn === 'localhost' || hn === '127.0.0.1' || hn.startsWith('192.168.') || hn.startsWith('10.') || hn.startsWith('172.');
    if (!isLocal) {
        if (elMobileIpLink) {
            elMobileIpLink.style.display = 'none';
        }
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/ip`);
        if (response.ok) {
            const data = await response.json();
            if (elMobileIpLink && data.ip) {
                elMobileIpLink.innerHTML = `📱 行動裝置請連同 Wi-Fi 後訪問：<br><span>http://${data.ip}:8000</span>`;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch local IP:", e);
    }
}


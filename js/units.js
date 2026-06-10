/**
 * Three Kingdoms Auto-Battler - Units Definitions
 * Defines stats, skill scaling, factions, fates, and templates for all entities.
 */

export const UNIT_TEMPLATES = {
    // ==========================================
    // HEROES
    // ==========================================
    zhuge_liang: {
        id: 'zhuge_liang',
        name: '諸葛亮',
        role: '後排法師 / 治療',
        faction: 'shu',
        cost: 4,
        hp: 550,
        wuli: 20,
        zhili: 120,
        tongshuai: 65,
        atkSpeed: 0.9,
        range: 4,
        isBuilding: false,
        portrait: 'assets/zhuge_liang.jpg',
        avatarText: '亮',
        color: '#9b5de5', // Purple
        skillName: '杯蛇鬼車',
        skillDesc: '對3x3範圍內的敵人造成200%智力謀略傷害，並為友軍恢復100%智力生命值。',
        skillConfig: {
            type: 'aoe_dmg_heal',
            energyMax: 100,
            radius: 1.5, // 3x3 area
            dmgMult: 2.0,
            healMult: 1.0
        },
        extraSkillName: '神機妙算',
        extraSkillDesc: '指揮：敵軍試圖發動主動戰法時，有35%幾率使其計窮（無法施法）2秒，並造成150%智力謀略傷害。',
        extraSkillConfig: {
            type: 'command_silence',
            chance: 0.35,
            dmgMult: 1.5,
            durationSec: 2
        }
    },
    
    zhang_fei: {
        id: 'zhang_fei',
        name: '張飛',
        role: '前排坦克 / 控制',
        faction: 'shu',
        cost: 4,
        hp: 950,
        wuli: 100,
        zhili: 15,
        tongshuai: 90,
        atkSpeed: 0.8,
        range: 1,
        isBuilding: false,
        portrait: 'assets/zhang_fei.jpg',
        avatarText: '飛',
        color: '#ff4757', // Red
        skillName: '燕人咆哮',
        skillDesc: '對前方2x3範圍內的敵人造成150%武力傷害，嘲諷敵人並獲得相當於300%統率防禦值的護盾，持續4秒。',
        skillConfig: {
            type: 'taunt_shield_sweep',
            energyMax: 100,
            rangeX: 2,
            rangeY: 3,
            dmgMult: 1.5,
            shieldMult: 3.0,
            durationSec: 4
        },
        extraSkillName: '剛勇無前',
        extraSkillDesc: '被動：每次受到傷害時，使下一次攻擊/戰法傷害提升20%，並降低攻擊者25%防禦（統率），持續3秒。',
        extraSkillConfig: {
            type: 'passive_counter',
            dmgBuff: 0.20,
            defShred: 0.25,
            durationSec: 3
        }
    },
    
    cao_cao: {
        id: 'cao_cao',
        name: '曹操',
        role: '中排領袖 / 增益',
        faction: 'wei',
        cost: 4,
        hp: 750,
        wuli: 75,
        zhili: 95,
        tongshuai: 100,
        atkSpeed: 1.0,
        range: 2,
        isBuilding: false,
        portrait: 'assets/cao_cao.jpg',
        avatarText: '操',
        color: '#ffa502', // Gold/Orange
        skillName: '丹陽突擊',
        skillDesc: '召喚2名丹陽兵，為盟友提供150%統率防禦值的護盾，並恢復盟友100%智力生命值。',
        skillConfig: {
            type: 'summon_buff',
            energyMax: 100,
            shieldMult: 1.5,
            healMult: 1.0,
            summonId: 'danyang_soldier',
            summonCount: 2
        },
        extraSkillName: '亂世奸雄',
        extraSkillDesc: '指揮：使所有友軍造成的傷害提升12%，並使曹操自身受到的傷害降低15%。',
        extraSkillConfig: {
            type: 'command_aura',
            alliesDmgBuff: 0.12,
            selfDmgReduc: 0.15
        }
    },
    
    zhao_yun: {
        id: 'zhao_yun',
        name: '趙雲',
        role: '前排突擊 / 輸出',
        faction: 'shu',
        cost: 3,
        hp: 680,
        wuli: 100,
        zhili: 35,
        tongshuai: 80,
        atkSpeed: 1.2,
        range: 1,
        isBuilding: false,
        portrait: 'assets/zhao_yun.jpg',
        avatarText: '雲',
        color: '#1e90ff', // Blue
        skillName: '龍膽突刺',
        skillDesc: '將前方的敵人擊退2格，自身獲得50%免傷，並嘲諷被擊退的敵人攻擊自己（敵人造成的傷害降低50%），持續5秒。',
        skillConfig: {
            type: 'push_dive',
            energyMax: 100,
            pushDist: 2,
            dmgReduction: 0.50,
            tauntDmgReduction: 0.50,
            durationSec: 5
        },
        extraSkillName: '一身是膽',
        extraSkillDesc: '被動：戰鬥中自身獲得洞察狀態（免疫所有控制效果），並提升25點武力和25點統率。',
        extraSkillConfig: {
            type: 'passive_cc_immunity',
            wuliBuff: 25,
            tongshuaiBuff: 25
        }
    },

    // --- NEW HEROES ---
    liu_bei: {
        id: 'liu_bei',
        name: '劉備',
        role: '後排輔助 / 治療',
        faction: 'shu',
        cost: 3,
        hp: 650,
        wuli: 55,
        zhili: 90,
        tongshuai: 85,
        atkSpeed: 0.95,
        range: 3,
        isBuilding: false,
        portrait: 'assets/liu_bei.jpg',
        avatarText: '備',
        color: '#2ed573', // Shu Green
        skillName: '仁德載世',
        skillDesc: '恢復3格範圍內所有盟友的生命值（100%智力），並使其獲得25%免傷，持續4秒。',
        skillConfig: {
            type: 'liu_bei_heal',
            energyMax: 100,
            radius: 3,
            healMult: 1.0,
            dmgReduc: 0.25,
            durationSec: 4
        },
        extraSkillName: '攜手禦敵',
        extraSkillDesc: '指揮：每3秒治療生命值最低的友軍（80%智力），並有15%幾率使隨機敵軍繳械（無法普攻）2秒。',
        extraSkillConfig: {
            type: 'command_heal_disarm',
            healMult: 0.8,
            disarmChance: 0.15,
            disarmDurationSec: 2,
            intervalSec: 3
        }
    },

    guan_yu: {
        id: 'guan_yu',
        name: '關羽',
        role: '前排群攻 / 控制',
        faction: 'shu',
        cost: 5,
        hp: 850,
        wuli: 120,
        zhili: 40,
        tongshuai: 95,
        atkSpeed: 0.9,
        range: 1,
        isBuilding: false,
        portrait: 'assets/guan_yu.jpg',
        avatarText: '羽',
        color: '#2ed573', // Shu Green
        skillName: '威震華夏',
        skillDesc: '對2格半徑範圍內的敵人造成220%武力物理傷害，並使受擊目標震懾2秒。',
        skillConfig: {
            type: 'guan_yu_aoe',
            energyMax: 100,
            radius: 2,
            dmgMult: 2.2,
            stunDurationSec: 2
        },
        extraSkillName: '千裡走單騎',
        extraSkillDesc: '被動：普通攻擊時，有30%幾率獲得1層抵禦（免疫下一次傷害），並提升自身20%武力，持續3秒。',
        extraSkillConfig: {
            type: 'passive_resist_wuli',
            chance: 0.30,
            wuliBuff: 0.20,
            durationSec: 3
        }
    },

    jiang_wei: {
        id: 'jiang_wei',
        name: '姜維',
        role: '中排輸出 / 屬性削減',
        faction: 'shu',
        cost: 4,
        hp: 720,
        wuli: 90,
        zhili: 95,
        tongshuai: 82,
        atkSpeed: 1.0,
        range: 3,
        isBuilding: false,
        portrait: 'assets/jiang_wei.png',
        avatarText: '維',
        color: '#2ed573',
        skillName: '義膽雄心',
        skillDesc: '主動：奇數次施放造成180%武力的物理傷害並降低目標20%武力；偶數次施放造成180%智力的謀略傷害並降低目標20%智力。屬性降低持續4秒。',
        skillConfig: {
            type: 'jiang_wei_multi',
            energyMax: 100,
            dmgMult: 1.8,
            debuffPct: 0.20,
            durationSec: 4
        },
        extraSkillName: '文武雙全',
        extraSkillDesc: '被動：自身每次造成傷害時，提升3%武力與智力，最多疊加5層。',
        extraSkillConfig: {
            type: 'passive_ramp_stats',
            buffPerStack: 0.03,
            maxStacks: 5
        }
    },

    ma_chao: {
        id: 'ma_chao',
        name: '馬超',
        role: '前排群攻 / 突擊型輸出',
        faction: 'shu',
        cost: 4,
        hp: 780,
        wuli: 108,
        zhili: 20,
        tongshuai: 78,
        atkSpeed: 1.15,
        range: 1,
        isBuilding: false,
        portrait: 'assets/ma_chao.png',
        avatarText: '超',
        color: '#2ed573',
        skillName: '槊血作氣',
        skillDesc: '主動：自身獲得50%武力提升，且普通攻擊對周圍相鄰敵人造成60%的濺射傷害，持續5秒。',
        skillConfig: {
            type: 'ma_chao_buff',
            energyMax: 100,
            wuliBuff: 0.50,
            splashPct: 0.60,
            durationSec: 5
        },
        extraSkillName: '一騎當千',
        extraSkillDesc: '突擊（35%）：普通攻擊後，對目標及周圍2格範圍內的所有敵人造成100%武力的物理傷害。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.35,
            dmgMult: 1.0,
            dmgType: 'physical',
            radius: 2
        }
    },

    pang_tong: {
        id: 'pang_tong',
        name: '龐統',
        role: '後排法師 / 鏈接傳導',
        faction: 'shu',
        cost: 4,
        hp: 600,
        wuli: 25,
        zhili: 116,
        tongshuai: 62,
        atkSpeed: 0.85,
        range: 4,
        isBuilding: false,
        portrait: 'assets/pang_tong.png',
        avatarText: '統',
        color: '#2ed573',
        skillName: '連環計',
        skillDesc: '主動：將隨機3名敵軍鏈接在一起，持續6秒。當其中任意一人受到傷害時，其他被鏈接的敵人亦受到該傷害的30%（傳導真實傷害）。',
        skillConfig: {
            type: 'pang_tong_chain',
            energyMax: 100,
            targetCount: 3,
            sharePct: 0.30,
            durationSec: 6
        },
        extraSkillName: '士別三日',
        extraSkillDesc: '被動：戰鬥開始的前4秒內無法進行普通攻擊（繳械），但獲得40%規避（閃避）率；戰鬥第5秒時，對所有敵軍造成300%智力謀略傷害。',
        extraSkillConfig: {
            type: 'passive_shibie',
            disarmDurationSec: 4,
            dodgeBuff: 0.40,
            explodeTime: 5,
            explodeDmgMult: 3.0
        }
    },

    guo_jia: {
        id: 'guo_jia',
        name: '郭嘉',
        role: '後排輔助 / 增益',
        faction: 'wei',
        cost: 3,
        hp: 520,
        wuli: 20,
        zhili: 110,
        tongshuai: 50,
        atkSpeed: 0.95,
        range: 4,
        isBuilding: false,
        portrait: 'assets/guo_jia.jpg',
        avatarText: '嘉',
        color: '#54a0ff', // Wei Blue
        skillName: '十勝十敗',
        skillDesc: '使傷害最高的友軍獲得免疫控制（洞察）、30%免傷和+50%攻擊速度，持續5秒。',
        skillConfig: {
            type: 'guo_jia_buff',
            energyMax: 100,
            dmgReduc: 0.30,
            atkSpeedBuff: 0.50,
            durationSec: 5
        },
        extraSkillName: '十勝遺計',
        extraSkillDesc: '指揮：戰鬥前6秒，使我軍武力最高的單體獲得30%倒戈（吸血）和洞察（免疫控制）狀態。',
        extraSkillConfig: {
            type: 'command_shield_cc_immunity',
            durationSec: 6,
            lifestealPct: 0.30
        }
    },

    xun_yu: {
        id: 'xun_yu',
        name: '荀彧',
        role: '後排謀士 / 詛咒',
        faction: 'wei',
        cost: 3,
        hp: 540,
        wuli: 15,
        zhili: 105,
        tongshuai: 60,
        atkSpeed: 0.9,
        range: 4,
        isBuilding: false,
        portrait: 'assets/xun_yu.jpg',
        avatarText: '彧',
        color: '#54a0ff', // Wei Blue
        skillName: '驅虎吞狼',
        skillDesc: '對生命值最高的敵軍施加5秒咒罵。目標每秒受到其最大生命值10%的傷害（最大不超過施法者300%智力），並將傷害濺射至相鄰格子。',
        skillConfig: {
            type: 'xun_yu_curse',
            energyMax: 100,
            maxHPDmgPct: 0.10,
            durationSec: 5
        },
        extraSkillName: '王佐之才',
        extraSkillDesc: '指揮：使相鄰友軍的防禦（統率）提升20%，且友軍受到暴擊時為其恢復80%智力的生命值。',
        extraSkillConfig: {
            type: 'command_defense_aura',
            defBuffPct: 0.20,
            healMult: 0.8
        }
    },

    jia_xu: {
        id: 'jia_xu',
        name: '賈詡',
        role: '後排謀士 / 混亂控制',
        faction: 'wei',
        cost: 4,
        hp: 620,
        wuli: 22,
        zhili: 114,
        tongshuai: 68,
        atkSpeed: 0.9,
        range: 4,
        isBuilding: false,
        portrait: 'assets/jia_xu.png',
        avatarText: '詡',
        color: '#54a0ff',
        skillName: '神機莫測',
        skillDesc: '主動：使隨機2名敵軍混亂3秒，並使己方混亂的隊友恢復120%智力生命值。若目標已被混亂，則改為對其造成220%智力謀略傷害。',
        skillConfig: {
            type: 'jia_xu_confusion',
            energyMax: 100,
            targetCount: 2,
            confuseDurationSec: 3.0,
            healMult: 1.2,
            dmgMult: 2.2
        },
        extraSkillName: '暫避其鋒',
        extraSkillDesc: '指揮：戰鬥開始前5秒，使己方智力最高單體獲得40%物理免傷，武力最高單體獲得40%魔法免傷。',
        extraSkillConfig: {
            type: 'command_zanbi',
            durationSec: 5,
            physReduc: 0.40,
            magicReduc: 0.40
        }
    },

    cheng_yu: {
        id: 'cheng_yu',
        name: '程昱',
        role: '後排法師 / 禁療真實傷害',
        faction: 'wei',
        cost: 3,
        hp: 560,
        wuli: 24,
        zhili: 106,
        tongshuai: 56,
        atkSpeed: 0.85,
        range: 4,
        isBuilding: false,
        portrait: 'assets/cheng_yu.png',
        avatarText: '昱',
        color: '#54a0ff',
        skillName: '十面埋伏',
        skillDesc: '主動：對所有身上有負面狀態的敵軍造成180%智力謀略傷害，並對其施加禁療與逃兵狀態（每秒造成40%智力的真實傷害，持續4秒）。',
        skillConfig: {
            type: 'cheng_yu_ambush',
            energyMax: 100,
            dmgMult: 1.8,
            dotMult: 0.40,
            durationSec: 4
        },
        extraSkillName: '四面楚歌',
        extraSkillDesc: '指揮：每5秒隨機使2名敵軍中毒，每秒造成30%智力謀略傷害，持續3秒。',
        extraSkillConfig: {
            type: 'command_poison',
            intervalSec: 5,
            targetCount: 2,
            dotMult: 0.30,
            durationSec: 3
        }
    },

    sun_quan: {
        id: 'sun_quan',
        name: '孫權',
        role: '中排多增益輸出',
        faction: 'wu',
        cost: 4,
        hp: 720,
        wuli: 85,
        zhili: 80,
        tongshuai: 85,
        atkSpeed: 1.05,
        range: 3,
        isBuilding: false,
        portrait: 'assets/sun_quan.jpg',
        avatarText: '權',
        color: '#ff6b6b', // Wu Red
        skillName: '坐斷東南',
        skillDesc: '自身獲得三種臨時增益（+30%攻擊、+30%攻速、+30%防禦），持續6秒。',
        skillConfig: {
            type: 'sun_quan_buff',
            energyMax: 100,
            buffPct: 0.30,
            durationSec: 6
        },
        extraSkillName: '兵無常勢',
        extraSkillDesc: '突擊（35%）：普通攻擊後，對目標造成180%智力謀略傷害，並恢復傷害量100%的生命值。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.35,
            dmgMult: 1.8,
            dmgType: 'magic',
            lifestealMult: 1.0
        }
    },

    zhou_yu: {
        id: 'zhou_yu',
        name: '周瑜',
        role: '後排群攻灼燒輸出',
        faction: 'wu',
        cost: 5,
        hp: 650,
        wuli: 35,
        zhili: 130,
        tongshuai: 75,
        atkSpeed: 0.95,
        range: 4,
        isBuilding: false,
        portrait: 'assets/zhou_yu.jpg',
        avatarText: '瑜',
        color: '#ff6b6b', // Wu Red
        skillName: '神火計',
        skillDesc: '對所有敵軍造成200%智力謀略傷害，並有100%概率對其施加灼燒狀態，每秒造成20%智力的謀略傷害，持續5秒。',
        skillConfig: {
            type: 'zhou_yu_fire',
            energyMax: 100,
            dmgMult: 2.0,
            burnMult: 0.20,
            durationSec: 5
        },
        extraSkillName: '奪魂挾魄',
        extraSkillDesc: '被動：每次成功發動戰法時，有60%幾率奪取目標15%的武力、智力和統率屬性，持續4秒。',
        extraSkillConfig: {
            type: 'passive_stat_steal',
            chance: 0.60,
            stealPct: 0.15,
            durationSec: 4
        }
    },

    lu_xun: {
        id: 'lu_xun',
        name: '陸遜',
        role: '後排法師 / 爆發',
        faction: 'wu',
        cost: 4,
        hp: 680,
        wuli: 30,
        zhili: 120,
        tongshuai: 70,
        atkSpeed: 0.9,
        range: 4,
        isBuilding: false,
        portrait: 'assets/lu_xun.jpg',
        avatarText: '遜',
        color: '#ff6b6b', // Wu Red
        skillName: '火燒連營',
        skillDesc: '對處於灼燒狀態的敵人造成300%智力謀略傷害，並觸發爆炸造成150%智力謀略傷害，將灼燒擴散至相鄰敵人。',
        skillConfig: {
            type: 'lu_xun_explode',
            energyMax: 100,
            targetDmgMult: 3.0,
            splashDmgMult: 1.5
        },
        extraSkillName: '克敵制勝',
        extraSkillDesc: '突擊（30%）：普通攻擊後，對目標造成180%智力謀略傷害。若目標處於灼燒狀態，則有40%幾率使其震懾1.5秒。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.30,
            dmgMult: 1.8,
            dmgType: 'magic',
            stunChance: 0.40,
            stunDurationSec: 1.5
        }
    },

    lu_su: {
        id: 'lu_su',
        name: '魯肅',
        role: '後排輔助 / 屬性轉移',
        faction: 'wu',
        cost: 3,
        hp: 620,
        wuli: 28,
        zhili: 108,
        tongshuai: 72,
        atkSpeed: 0.95,
        range: 3,
        isBuilding: false,
        portrait: 'assets/lu_su.png',
        avatarText: '肅',
        color: '#ff6b6b',
        skillName: '濟貧難施',
        skillDesc: '主動：為生命值百分比最低的友軍恢復180%智力的生命值，並將自身30%的屬性移交給該友軍，持續5秒。',
        skillConfig: {
            type: 'lu_su_transfer',
            energyMax: 100,
            healMult: 1.8,
            transferPct: 0.30,
            durationSec: 5
        },
        extraSkillName: '八門金鎖陣',
        extraSkillDesc: '指揮：戰鬥開始前5秒，降低敵軍武力最高的2人35%造成的傷害。',
        extraSkillConfig: {
            type: 'command_bamen',
            durationSec: 5,
            dmgDealtReduc: 0.35
        }
    },

    sun_shangxiang: {
        id: 'sun_shangxiang',
        name: '孫尚香',
        role: '後排突擊 / 增益加成',
        faction: 'wu',
        cost: 4,
        hp: 700,
        wuli: 98,
        zhili: 60,
        tongshuai: 68,
        atkSpeed: 1.1,
        range: 3,
        isBuilding: false,
        portrait: 'assets/sun_shangxiang.png',
        avatarText: '香',
        color: '#ff6b6b',
        skillName: '弓腰姬',
        skillDesc: '主動：對目標造成180%武力物理傷害。若自身擁有活性增益狀態，則每多一個增益，技能傷害提升20%並恢復等同於100%智力的生命值。',
        skillConfig: {
            type: 'sun_shangxiang_gongyao',
            energyMax: 100,
            dmgMult: 1.8,
            bonusDmgPerBuff: 0.20,
            healMult: 1.0
        },
        extraSkillName: '強攻',
        extraSkillDesc: '突擊（35%）：普通攻擊後，使自身獲得連擊狀態（每次普攻發動兩次攻擊），持續3秒。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.35,
            buffType: 'double_attack',
            durationSec: 3
        }
    },

    tai_shici: {
        id: 'tai_shici',
        name: '太史慈',
        role: '中排射手 / 護盾削減',
        faction: 'wu',
        cost: 4,
        hp: 740,
        wuli: 102,
        zhili: 35,
        tongshuai: 74,
        atkSpeed: 1.1,
        range: 3,
        isBuilding: false,
        portrait: 'assets/tai_shici.png',
        avatarText: '慈',
        color: '#ff6b6b',
        skillName: '神射',
        skillDesc: '主動：普通攻擊改為發動連擊（每次攻擊造成2次傷害），並每次攻擊降低目標10%統率（可疊加5層），持續5秒。',
        skillConfig: {
            type: 'tai_shici_shenshe',
            energyMax: 100,
            defShred: 0.10,
            maxStacks: 5,
            durationSec: 5
        },
        extraSkillName: '折衝禦侮',
        extraSkillDesc: '突擊（35%）：普通攻擊後，降低目標20%智力與統率，持續3秒，並使我軍防禦（統率）最低的友軍獲得格擋狀態，持續3秒。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.35,
            debuffPct: 0.20,
            shieldDurationSec: 3
        }
    },

    zhang_jiao: {
        id: 'zhang_jiao',
        name: '張角',
        role: '後排雷法 / 控制',
        faction: 'qun',
        cost: 4,
        hp: 560,
        wuli: 25,
        zhili: 118,
        tongshuai: 60,
        atkSpeed: 0.85,
        range: 4,
        isBuilding: false,
        portrait: 'assets/zhang_jiao.jpg',
        avatarText: '角',
        color: '#eccc68', // Qun Yellow
        skillName: '五雷轟頂',
        skillDesc: '施放5次閃電隨機轟擊敵人，每次造成150%智力謀略傷害，並有30%概率使目標震懾1.5秒。',
        skillConfig: {
            type: 'zhang_jiao_lightning',
            energyMax: 100,
            dmgMult: 1.5,
            boltCount: 5,
            stunChance: 0.30,
            stunDurationSec: 1.5
        },
        extraSkillName: '太平道法',
        extraSkillDesc: '被動：自身主動戰法發動時的能量恢復速度提升25%，且主動戰法獲得20%奇謀（法術暴擊）幾率。',
        extraSkillConfig: {
            type: 'passive_energy_crit',
            energySpeedBuff: 0.25,
            critChance: 0.20
        }
    },

    yuan_shao: {
        id: 'yuan_shao',
        name: '袁紹',
        role: '中排統領 / 輔助',
        faction: 'qun',
        cost: 3,
        hp: 720,
        wuli: 78,
        zhili: 70,
        tongshuai: 80,
        atkSpeed: 0.95,
        range: 3,
        isBuilding: false,
        portrait: 'assets/yuan_shao.jpg',
        avatarText: '紹',
        color: '#eccc68', // Qun Yellow
        skillName: '累世重名',
        skillDesc: '使所有盟友的防禦（統率）提升40%，持續5秒；並向前方發射一波箭雨，對直線上的敵人造成120%武力的物理傷害。',
        skillConfig: {
            type: 'yuan_shao_line',
            energyMax: 100,
            dmgMult: 1.2,
            defBuffPct: 0.40,
            durationSec: 5
        },
        extraSkillName: '鋒矢陣',
        extraSkillDesc: '陣法：戰鬥中使我軍前排中路單體提升25%攻擊速度，但受到的傷害增加15%；我軍後排群體受到的傷害降低15%。',
        extraSkillConfig: {
            type: 'formation_fengshi',
            frontlineAtkSpeedBuff: 0.25,
            frontlineDmgTakeDebuff: 0.15,
            backlineDmgTakeBuff: 0.15
        }
    },

    yuan_shu: {
        id: 'yuan_shu',
        name: '袁術',
        role: '中排自損狂戰',
        faction: 'qun',
        cost: 3,
        hp: 680,
        wuli: 80,
        zhili: 75,
        tongshuai: 65,
        atkSpeed: 1.05,
        range: 2,
        isBuilding: false,
        portrait: 'assets/yuan_shu.jpg',
        avatarText: '術',
        color: '#eccc68', // Qun Yellow
        skillName: '偽帝登基',
        skillDesc: '自身武力與智力屬性提升80%，持續5秒，但每秒扣除自身當前生命值的12%。',
        skillConfig: {
            type: 'yuan_shu_sacrifice',
            energyMax: 100,
            statBuffPct: 0.80,
            hpDrainPct: 0.12,
            durationSec: 5
        },
        extraSkillName: '手起刀落',
        extraSkillDesc: '突擊（35%）：普通攻擊後，對目標造成200%武力物理傷害。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.35,
            dmgMult: 2.0,
            dmgType: 'physical'
        }
    },

    sima_yi: {
        id: 'sima_yi',
        name: '司馬懿',
        role: '後排法師 / 吸血',
        faction: 'wei',
        cost: 5,
        hp: 750,
        wuli: 40,
        zhili: 125,
        tongshuai: 88,
        atkSpeed: 0.9,
        range: 4,
        isBuilding: false,
        portrait: 'assets/sima_yi.jpg',
        avatarText: '懿',
        color: '#8e44ad', // Purple
        skillName: '鷹視狼顧',
        skillDesc: '對所有敵人造成180%智力謀略傷害，並恢復傷害量60%的生命值。戰場上每死亡一個單位，自身全屬性提升10%。',
        skillConfig: {
            type: 'sima_yi_aoe',
            energyMax: 100,
            dmgMult: 1.8,
            lifestealMult: 0.60,
            statBoostPerDeath: 0.10
        },
        extraSkillName: '用武通神',
        extraSkillDesc: '被動：戰鬥開始後，每4秒對隨機敵軍2人造成謀略傷害（傷害率依次為100%、150%、200%、250%，受智力影響）。',
        extraSkillConfig: {
            type: 'passive_ramp_dot',
            intervalSec: 4,
            baseDmgMult: 1.0,
            dmgMultIncrement: 0.50,
            targetCount: 2
        }
    },

    lu_bu: {
        id: 'lu_bu',
        name: '呂布',
        role: '前排核心輸出',
        faction: 'qun',
        cost: 5,
        hp: 900,
        wuli: 130,
        zhili: 10,
        tongshuai: 75,
        atkSpeed: 0.95,
        range: 1,
        isBuilding: false,
        portrait: 'assets/lu_bu.jpg',
        avatarText: '布',
        color: '#e74c3c', // Red
        skillName: '天下無雙',
        skillDesc: '震懾相鄰的敵人1.5秒，隨後攻擊速度翻倍並造成120%的濺射傷害，持續5秒。',
        skillConfig: {
            type: 'lu_bu_rage',
            energyMax: 100,
            stunDurationSec: 1.5,
            atkSpeedMult: 2.0,
            splashDmgMult: 1.2,
            durationSec: 5
        },
        extraSkillName: '百騎劫營',
        extraSkillDesc: '突擊（30%）：普通攻擊後，對目標造成160%武力物理傷害，並對敵軍兵力最低的單體濺射50%的傷害。',
        extraSkillConfig: {
            type: 'assault',
            chance: 0.30,
            dmgMult: 1.6,
            dmgType: 'physical',
            splashPct: 0.50
        }
    },

    diao_chan: {
        id: 'diao_chan',
        name: '貂蟬',
        role: '後排輔助 / 魅惑控制',
        faction: 'qun',
        cost: 3,
        hp: 580,
        wuli: 30,
        zhili: 95,
        tongshuai: 55,
        atkSpeed: 1.0,
        range: 3,
        isBuilding: false,
        portrait: 'assets/diao_chan.jpg',
        avatarText: '蟬',
        color: '#e84393', // Pink
        skillName: '閉月羞花',
        skillDesc: '魅惑傷害最高的敵人3秒（使其攻擊己方隊伍），並將其50%的屬性轉移給呂布。',
        skillConfig: {
            type: 'diao_chan_charm',
            energyMax: 100,
            charmDurationSec: 3.0,
            statTransferPct: 0.50
        },
        extraSkillName: '傾國傾城',
        extraSkillDesc: '指揮：戰鬥開始時，使隨機2名敵軍每4秒有30%幾率陷入混亂（攻擊其友軍），持續2秒。',
        extraSkillConfig: {
            type: 'command_confusion',
            targetCount: 2,
            chance: 0.30,
            durationSec: 2,
            intervalSec: 4
        }
    },



    // ==========================================
    // SUMMONS
    // ==========================================
    danyang_soldier: {
        id: 'danyang_soldier',
        name: '丹陽兵',
        role: '召喚近戰士兵',
        faction: 'summon',
        cost: 0,
        hp: 250,
        wuli: 45,
        zhili: 0,
        tongshuai: 40,
        atkSpeed: 1.0,
        range: 1,
        isBuilding: false,
        portrait: '',
        avatarText: '丹',
        color: '#ff6b81',
        skillName: '死士衝鋒',
        skillDesc: '由曹操丹陽突擊召喚，一往無前地衝入戰場。',
        skillConfig: null
    },

    yellow_turban_grunt: {
        id: 'yellow_turban_grunt',
        name: '黃巾兵',
        role: '召喚近戰士兵',
        faction: 'summon',
        cost: 0,
        hp: 240,
        wuli: 40,
        zhili: 0,
        tongshuai: 35,
        atkSpeed: 1.0,
        range: 1,
        isBuilding: false,
        portrait: '',
        avatarText: '巾',
        color: '#f1c40f',
        skillName: '起義衝鋒',
        skillDesc: '由黃巾起義羈絆召喚，為黃天太平而戰。',
        skillConfig: null
    },

    // ==========================================
    // ENEMIES (Auto-spawned in waves)
    // ==========================================
    yellow_turban_enemy: {
        id: 'yellow_turban_enemy',
        name: '黃巾雜兵',
        role: '敵方近戰小兵',
        faction: 'enemy',
        cost: 1,
        hp: 350,
        wuli: 40,
        zhili: 0,
        tongshuai: 30,
        atkSpeed: 0.9,
        range: 1,
        isBuilding: false,
        portrait: '',
        avatarText: '巾',
        color: '#eccc68',
        skillName: '群攻',
        skillDesc: '黃巾起義叛亂軍雜兵。',
        skillConfig: null
    },
    
    yellow_turban_archer: {
        id: 'yellow_turban_archer',
        name: '黃巾射手',
        role: '敵方遠程小兵',
        faction: 'enemy',
        cost: 1,
        hp: 220,
        wuli: 35,
        zhili: 0,
        tongshuai: 20,
        atkSpeed: 1.0,
        range: 3,
        isBuilding: false,
        portrait: '',
        avatarText: '射',
        color: '#eccc68',
        skillName: '流箭',
        skillDesc: '從遠處發射箭雨。',
        skillConfig: null
    },

    yellow_turban_captain: {
        id: 'yellow_turban_captain',
        name: '黃巾渠帥',
        role: '敵方精英',
        faction: 'enemy',
        cost: 3,
        hp: 1200,
        wuli: 90,
        zhili: 30,
        tongshuai: 80,
        atkSpeed: 0.85,
        range: 1,
        isBuilding: false,
        portrait: '',
        avatarText: '帥',
        color: '#ffa502',
        skillName: '蒼天已死',
        skillDesc: '對周圍敵人造成150%攻擊傷害，並治療附近的黃巾軍。',
        skillConfig: {
            type: 'aoe_dmg_heal',
            energyMax: 100,
            radius: 1,
            dmgMult: 1.5,
            healMult: 0.8
        }
    },
    
    boss_dong_zhuo: {
        id: 'boss_dong_zhuo',
        name: '董卓',
        role: '敵方Boss',
        faction: 'enemy',
        cost: 5,
        hp: 3000,
        wuli: 120,
        zhili: 50,
        tongshuai: 140,
        atkSpeed: 0.75,
        range: 1,
        isBuilding: false,
        portrait: '',
        avatarText: '董',
        color: '#ff4757',
        skillName: '酒池肉林',
        skillDesc: '對3x3範圍內的敵人造成200%智力謀略傷害，並吸取受擊者50%傷害值的生命值。',
        skillConfig: {
            type: 'aoe_dmg_lifesteal',
            energyMax: 100,
            radius: 1.5,
            dmgMult: 2.0,
            lifestealMult: 0.50
        }
    }
};

export const FATE_TEMPLATES = {
    peach_garden: {
        id: 'peach_garden',
        name: '桃園三結義',
        requiredIds: ['liu_bei', 'guan_yu', 'zhang_fei'],
        desc: '三人均獲得+20%最大生命值、武力與統率。戰鬥開始時，獲得相當於自身最大生命值15%的護盾。'
    },
    wei_intellects: {
        id: 'wei_intellects',
        name: '魏之智',
        requiredIds: ['guo_jia', 'xun_yu', 'jia_xu', 'cheng_yu'],
        desc: '四人均獲得+30%智力與+20%奇謀（法術暴擊）幾率，戰鬥開始時直接獲得50點能量。'
    },
    wu_commander: {
        id: 'wu_commander',
        name: '東吳大都督',
        requiredIds: ['zhou_yu', 'lu_xun', 'lu_su'],
        desc: '獲得+20%智力與+20%攻擊速度。普通攻擊有40%幾率對目標施加灼燒（每秒25%智力傷害，持續3秒）；若目標已處於灼燒狀態，則攻擊者恢復10點能量。'
    },
    yellow_turban: {
        id: 'yellow_turban',
        name: '黃巾起義',
        requiredIds: ['zhang_jiao', 'yuan_shao', 'yuan_shu'],
        desc: '三人均獲得+20%最大生命值。每次施放戰法時，會額外召喚一名黃巾兵參戰。'
    },
    hero_beauty: {
        id: 'hero_beauty',
        name: '英雄美人',
        requiredIds: ['lu_bu', 'diao_chan'],
        desc: '呂布獲得+25%武力。貂蟬獲得+25%最大生命值。貂蟬魅惑敵軍時，呂布會繼承目標50%的屬性。'
    },
    five_tigers: {
        id: 'five_tigers',
        name: '五虎上將',
        requiredIds: ['guan_yu', 'zhang_fei', 'zhao_yun', 'ma_chao'],
        minCount: 3,
        desc: '上陣其中任意 3 人即可激活。獲得+20%武力與+20%攻擊速度。普通攻擊有25%幾率使目標震懾1秒。'
    },
    tianshui_miracle: {
        id: 'tianshui_miracle',
        name: '天水奇謀',
        requiredIds: ['zhuge_liang', 'zhao_yun', 'jiang_wei'],
        desc: '獲得+20%武力與+20%智力。當釋放主動戰法時，額外獲得10點能量。'
    },
    pillars_state: {
        id: 'pillars_state',
        name: '國之棟樑',
        requiredIds: ['sima_yi', 'zhou_yu', 'zhuge_liang'],
        desc: '獲得+25%智力與+15%統率。戰鬥開始時，直接獲得40點能量。'
    },
    wei_dynasty: {
        id: 'wei_dynasty',
        name: '魏武之世',
        requiredIds: ['cao_cao', 'sima_yi'],
        desc: '獲得+25%最大生命值與+20%統率防禦。雙方互相分攤並恢復對方造成傷害量20%的生命值。'
    }
};

/**
 * Calculates scaled stats for a unit based on its Star Level.
 * ⭐ (1-Star): 100% stats (Base)
 * ⭐⭐ (2-Star): 150% stats
 * ⭐⭐⭐ (3-Star): 200% stats
 */
export function getStatsForStar(template, star = 1) {
    const scale = star === 1 ? 1.0 : star === 2 ? 1.8 : 3.2;
    
    return {
        hpMax: Math.round(template.hp * scale),
        wuli: Math.round(template.wuli * scale),
        zhili: Math.round(template.zhili * scale),
        tongshuai: Math.round(template.tongshuai * scale),
        atkSpeed: template.atkSpeed,
        range: template.range
    };
}

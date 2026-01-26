const MASTER_DATA = {
    SKILLS: {
        attack: {
            id: "attack", name: "通常攻撃", type: "physical", power: 1.0, coolTime: 0,
            growth: { power: 0.1 },
            hate: 10
        },
        slash: {
            id: "slash", name: "斬撃", type: "physical", power: 1.5, coolTime: 3,
            growth: { power: 0.2 },
            hate: 20
        },
        magic_bullet: {
            id: "magic_bullet", name: "魔力弾", type: "magical", power: 1.2, coolTime: 4,
            growth: { power: 0.15 },
            hate: 20
        },
        heal: {
            id: "heal", name: "回復", type: "heal", power: 0.3, coolTime: 7,
            growth: { power: 0.1, coolTime: -0.1 },
            hate: 50
        },
        fire_ball: {
            id: "fire_ball", name: "火球", type: "magical", power: 1.8, coolTime: 6,
            growth: { power: 0.25 },
            hate: 20
        },
        shield_bash: {
            id: "shield_bash", name: "重撃", type: "physical", power: 2.5, coolTime: 7,
            growth: { power: 0.5 },
            hate: 100
        },
        prayer: {
            id: "prayer", name: "祈り", type: "heal", power: 0.75, coolTime: 20,
            growth: { power: 0.15, coolTime: -0.2 },
            hate: 50
        }
    },
    FRAGMENT_EFFECTS: {
        power_up: { name: "強打", desc: "威力+20%", calc: (s) => s.power *= 1.2 },
        ct_down: { name: "神速", desc: "CT-15%", calc: (s) => s.coolTime *= 0.85 },
        life_steal: { name: "吸血", desc: "与ダメ10%回復", calc: (s) => s.lifeSteal = (s.lifeSteal || 0) + 0.10 },
        double_cast: { name: "追撃", desc: "10%で再発動", calc: (s) => s.doubleChance = (s.doubleChance || 0) + 0.1 },
        berserk: { name: "諸刃", desc: "威力+50%/自傷2%", calc: (s) => { s.power *= 1.5; s.selfDamage = (s.selfDamage || 0) + 0.02 } },
        heavy: { name: "鈍重", desc: "威力+30%/CT+20%", calc: (s) => { s.power *= 1.3; s.coolTime *= 1.2 } },
        meditation: { name: "瞑想", desc: "威力-20%/自身回復", calc: (s) => { s.power *= 0.8; s.healSelf = true } },
        quick_step: { name: "軽業", desc: "威力-20%/CT-25%", calc: (s) => { s.power *= 0.8; s.coolTime *= 0.75 } },
        echo: { name: "残像", desc: "20%で再発動/威力-30%", calc: (s) => { s.doubleChance = (s.doubleChance || 0) + 0.2; s.power *= 0.7; } },
        dexterous: { name: "器用", desc: "威力+10%/CT-5%", calc: (s) => { s.power *= 1.1; s.coolTime *= 0.95 } },
        madness: { name: "狂気", desc: "威力+80%/自傷7%/CT-20%", calc: (s) => { s.power *= 1.8; s.selfDamage = (s.selfDamage || 0) + 0.07; s.coolTime *= 0.8 } },
        provoke: { name: "挑発", desc: "ヘイト上昇量+100%", calc: (s) => { s.hateMod *= 2.0; } },
        stealth: { name: "隠密", desc: "ヘイト上昇量-50%", calc: (s) => { s.hateMod *= 0.5; } },
        calm: { name: "鎮静", desc: "ターゲットヘイト-20", calc: (s) => { s.hateReduce += 20; } }
    },
    CRYSTALS: {
        power_up: { name: "真・強打", desc: "対象HP100%で威力5倍", crystalCalc: (s) => { s.firstStrikeMul = 5.0; } },
        ct_down: { name: "真・神速", desc: "40%で即再行動", crystalCalc: (s) => { s.instantExtraTurn = 0.4; } },
        life_steal: { name: "真・吸血", desc: "吸血超過回復を次威力に加算", crystalCalc: (s) => { s.overflowLifeSteal = true; } },
        double_cast: { name: "真・追撃", desc: "追撃が連鎖する(減衰90%)", crystalCalc: (s) => { s.chainDouble = 0.9; } },
        berserk: { name: "真・諸刃", desc: "HP1になるが3回無効化", crystalCalc: (s) => { s.berserkImmune = 3; } },
        heavy: { name: "真・鈍重", desc: "威力+30%/CT+50%/敵をスタン", crystalCalc: (s) => { s.power *= 1.3; s.coolTime *= 1.5; s.stunEnemy = true; } },
        meditation: { name: "真・瞑想", desc: "威力-20%/全ステ永続3%UP", crystalCalc: (s) => { s.power *= 0.8; s.permanentGrowth = 0.03; } },
        quick_step: { name: "真・軽業", desc: "2回連続発動/CT通常", crystalCalc: (s) => { s.doubleRepeat = true; } },
        echo: { name: "真・残像", desc: "味方の攻撃に100%追撃", crystalCalc: (s) => { s.markEcho = true; } },
        dexterous: { name: "真・器用", desc: "有利な属性でダメージ計算", crystalCalc: (s) => { s.autoAttribute = true; } },
        madness: { name: "真・狂気", desc: "低HPほど威力指数UP", crystalCalc: (s) => { s.desperatePower = true; } },
        provoke: { name: "真・挑発", desc: "敵の攻撃を10回引き受ける", crystalCalc: (s) => { s.absoluteTaunt = 10; } },
        stealth: { name: "真・隠密", desc: "10回行動の間ヘイト上昇0", crystalCalc: (s) => { s.zeroHateAction = 10; } },
        calm: { name: "真・鎮静", desc: "敵ヘイトリセット/攻撃50%化", crystalCalc: (s) => { s.resetHate = true; s.weakenEnemy = 3; } }
    },
    SKILL_CONDITIONS: [
        { id: "always", name: "常に使う" },
        { id: "hp_low", name: "HP50%以下で使う" },
        { id: "hp_high", name: "HP51%以上で使う" },
        { id: "enemy_many", name: "敵が3体以上いるとき使う" },
        { id: "ally_dead", name: "味方が戦闘不能のとき使う" }
    ],
    MAPS: [
        // {
        //     id: "debug_room",
        //     name: "デバッグルーム",
        //     encounters: [
        //         ["debug"]
        //     ]
        // },
        {
            id: "forest",
            name: "静かな森",
            fragmentGroupId: "group1",
            encounters: [
                ["slime"],
                ["slime", "slime"]
            ]
        },
        {
            id: "cave",
            name: "暗い洞窟",
            fragmentGroupId: "group1",
            encounters: [
                ["bat"],
                ["goblin"],
                ["bat", "goblin"]
            ]
        },
        {
            id: "cemetery",
            name: "古い墓地",
            fragmentGroupId: "group1",
            encounters: [
                ["skeleton"],
                ["bat", "bat"],
                ["skeleton", "ghost"]
            ]
        },
        {
            id: "volcano",
            name: "灼熱の火山",
            fragmentGroupId: "group1",
            encounters: [
                ["fire_spirit"],
                ["fire_spirit", "fire_spirit"],
                ["magma_golem"]
            ]
        },
        {
            id: "castle",
            name: "荒れ果てた王城",
            fragmentGroupId: "group2",
            encounters: [
                ["armored_knight"],
                ["armored_knight", "ghost"],
                ["high_wizard"]
            ]
        },
        {
            id: "sanctuary",
            name: "静寂の聖域",
            fragmentGroupId: "group2",
            encounters: [
                ["holy_sentinel"],
                ["holy_sentinel", "seraph_arc"],
                ["seraph_arc", "seraph_arc"]
            ]
        }
    ],
    // data.js の ENEMIES セクションを以下のように書き換えてください
    ENEMIES: {
        debug: {
            id: "debug", name: "デバッグ君", hp: 1, pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1, exp: 100,
            // 配列に変更
            drops: [
                { id: "slash", rate: 0.5 },
                { id: "magic_bullet", rate: 0.5 }
            ],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "slash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "magic_bullet", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "heal", level: 1, fragments: [], currentCoolDown: 0, condition: "hp_low" }
            ]
        },
        metal_slime: {
            id: "metal_slime", name: "金属スライム", hp: 10, pAtk: 1, pDef: 1000, mAtk: 1, mDef: 1000, spd: 100, exp: 100,
            drops: [
                { id: "slash", rate: 0.25 },
                { id: "magic_bullet", rate: 0.25 }
            ],
            skills: [{ id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }]
        },
        slime: {
            id: "slime", name: "スライム", hp: 50, pAtk: 10, pDef: 5, mAtk: 5, mDef: 5, spd: 8, exp: 5,
            drops: [{ id: "slash", rate: 0.01 }],
            skills: [{ id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }]
        },
        goblin: {
            id: "goblin", name: "ゴブリン", hp: 240, pAtk: 30, pDef: 20, mAtk: 10, mDef: 20, spd: 30, exp: 5,
            drops: [{ id: "slash", rate: 0.02 }],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "slash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        bat: {
            id: "bat", name: "コウモリ", hp: 120, pAtk: 10, pDef: 25, mAtk: 50, mDef: 30, spd: 50, exp: 5,
            drops: [{ id: "magic_bullet", rate: 0.02 }],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "magic_bullet", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        skeleton: {
            id: "skeleton", name: "スケルトン", hp: 400, pAtk: 80, pDef: 120, mAtk: 1, mDef: 120, spd: 10, exp: 5,
            drops: [{ id: "slash", rate: 0.05 }],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "slash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        ghost: {
            id: "ghost", name: "ゴースト", hp: 150, pAtk: 1, pDef: 200, mAtk: 60, mDef: 150, spd: 40, exp: 5,
            drops: [{ id: "magic_bullet", rate: 0.05 }],
            skills: [{ id: "magic_bullet", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }]
        },
        fire_spirit: {
            id: "fire_spirit", name: "火の精霊", hp: 1000, pAtk: 20, pDef: 40, mAtk: 90, mDef: 60, spd: 60, exp: 5,
            drops: [{ id: "fire_ball", rate: 0.03 }],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "fire_ball", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        magma_golem: {
            id: "magma_golem", name: "マグマゴーレム", hp: 1200, pAtk: 150, pDef: 200, mAtk: 50, mDef: 100, spd: 50, exp: 5,
            drops: [{ id: "shield_bash", rate: 0.05 }],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "shield_bash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        armored_knight: {
            id: "armored_knight", name: "重装騎士", hp: 8000, pAtk: 1100, pDef: 2500, mAtk: 100, mDef: 1500, spd: 250, exp: 5,
            drops: [
                { id: "slash", rate: 0.05 },
                { id: "shield_bash", rate: 0.08 }
            ],
            skills: [
                { id: "attack", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "slash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "shield_bash", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        high_wizard: {
            id: "high_wizard", name: "ハイウィザード", hp: 5000, pAtk: 100, pDef: 500, mAtk: 1800, mDef: 2500, spd: 700, exp: 5,
            drops: [
                { id: "magic_bullet", rate: 0.1 },
                { id: "fire_ball", rate: 0.05 },
                { id: "heal", rate: 0.05 }
            ],
            skills: [
                { id: "attack", level: 6, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "magic_bullet", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "fire_ball", level: 1, fragments: [], currentCoolDown: 0, condition: "always" }
            ]
        },
        holy_sentinel: {
            id: "holy_sentinel", name: "聖域の番人", hp: 12000, pAtk: 2500, pDef: 3000, mAtk: 500, mDef: 3500, spd: 400, exp: 5,
            drops: [
                { id: "shield_bash", rate: 0.1 },
                { id: "prayer", rate: 0.02 }
            ],
            skills: [
                { id: "attack", level: 5, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "shield_bash", level: 3, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "heal", level: 5, fragments: [], currentCoolDown: 0, condition: "hp_low" }
            ]
        },
        seraph_arc: {
            id: "seraph_arc", name: "セラフ・アーク", hp: 8000, pAtk: 200, pDef: 1500, mAtk: 4000, mDef: 4000, spd: 1200, exp: 5,
            drops: [
                { id: "magic_bullet", rate: 0.15 },
                { id: "prayer", rate: 0.05 }
            ],
            skills: [
                { id: "magic_bullet", level: 8, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "fire_ball", level: 5, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "prayer", level: 1, fragments: [], currentCoolDown: 0, condition: "hp_low" }
            ]
        }
    }
};

MASTER_DATA.FRAGMENT_DROP_CHANCE = 0.1;
MASTER_DATA.FRAGMENT_GROUPS = {
    group1: ["power_up", "ct_down", "quick_step", "life_steal", "meditation", "heavy", "double_cast", "berserk"],
    group2: ["power_up", "ct_down", "quick_step", "life_steal", "meditation", "heavy", "double_cast", "berserk", "echo", "dexterous", "madness", "provoke", "stealth", "calm"],
};

MASTER_DATA.JOBS = {
    adventurer: {
        name: "冒険者",
        description: "平均的な能力を持つ。すべてのステータスがバランスよく成長する。",
        weights: { hp: 20, pAtk: 16, pDef: 16, mAtk: 16, mDef: 16, spd: 16 } // 合計100
    },
    warrior: {
        name: "戦士",
        description: "物理攻撃と耐久力に優れた職業。HPと物理攻撃が伸びやすい。",
        weights: { hp: 30, pAtk: 30, pDef: 20, mAtk: 5, mDef: 5, spd: 10 } // 合計100
    },
    mage: {
        name: "魔導士",
        description: "魔法の扱いに長けた職業。魔法攻撃と魔法防御が伸びやすい。",
        weights: { hp: 15, pAtk: 5, pDef: 10, mAtk: 35, mDef: 25, spd: 10 } // 合計100
    },
    scout: {
        name: "スカウト",
        description: "素早い動きで敵を翻弄する。速度が非常に伸びやすい。",
        weights: { hp: 20, pAtk: 15, pDef: 10, mAtk: 10, mDef: 10, spd: 35 } // 合計100
    }
};

MASTER_DATA.SECRET_CODES = {
    "筋肉の巻物・上": {
        type: "fragment",
        effects: ["power_up", "power_up", "power_up"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "筋肉の巻物・中": {
        type: "fragment",
        effects: ["power_up", "power_up", "power_up"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "筋肉の巻物・下": {
        type: "fragment",
        effects: ["power_up", "power_up", "power_up"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "始祖の巻物・上": {
        type: "fragment",
        effects: ["life_steal", "life_steal", "life_steal"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "始祖の巻物・中": {
        type: "fragment",
        effects: ["life_steal", "life_steal", "life_steal"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "始祖の巻物・下": {
        type: "fragment",
        effects: ["life_steal", "life_steal", "life_steal"],
        message: "特別な輝きのかけらを手に入れた！"
    },
    "奥義": {
        type: "skill",
        skillId: "slash",
        level: 5,
        message: "強力なスキル [斬撃 Lv.5] を手に入れた！"
    },
    "きんきんきんぞく": {
        type: "stage",
        mapId: "metal_stage",
        message: "甘美なる金属の世界へ…！"
    },
    "きんきらきんぞく": {
        type: "stage",
        mapId: "metal_stage",
        message: "甘美なる金属の世界へ…！"
    }
};

MASTER_DATA.SECRET_MAPS = {
    "metal_stage": {
        id: "metal_stage",
        name: "金属の世界（限定）",
        encounters: [["metal_slime"]]
    }
};
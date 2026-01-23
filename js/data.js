const MASTER_DATA = {
    SKILLS: {
        attack: {
            id: "attack", name: "通常攻撃", type: "physical", power: 1.0, coolTime: 0,
            growth: { power: 0.1 }
        },
        slash: {
            id: "slash", name: "斬撃", type: "physical", power: 1.5, coolTime: 3,
            growth: { power: 0.2 }
        },
        magic_bullet: {
            id: "magic_bullet", name: "魔力弾", type: "magical", power: 1.2, coolTime: 4,
            growth: { power: 0.15 }
        },
        heal: {
            id: "heal", name: "回復", type: "heal", power: 1.0, coolTime: 7,
            growth: { power: 0.2, coolTime: -0.1 }
        },
        fire_ball: {
            id: "fire_ball", name: "火球", type: "magical", power: 1.8, coolTime: 6,
            growth: { power: 0.25 }
        },
        shield_bash: {
            id: "shield_bash", name: "重撃", type: "physical", power: 2.5, coolTime: 7,
            growth: { power: 0.5 }
        },
        prayer: {
            id: "prayer", name: "祈り", type: "heal", power: 2.0, coolTime: 8,
            growth: { power: 0.3, coolTime: -0.2 }
        }
    },
    FRAGMENT_EFFECTS: {
        power_up: { name: "強打", desc: "威力+20%", calc: (s) => s.power *= 1.2 },
        ct_down: { name: "神速", desc: "CT-15%", calc: (s) => s.coolTime *= 0.85 },
        life_steal: { name: "吸血", desc: "与ダメ5%回復", calc: (s) => s.lifeSteal = (s.lifeSteal || 0) + 0.05 },
        double_cast: { name: "追撃", desc: "10%で再発動", calc: (s) => s.doubleChance = (s.doubleChance || 0) + 0.1 },
        berserk: { name: "諸刃", desc: "威力+50%/自傷5%", calc: (s) => { s.power *= 1.5; s.selfDamage = (s.selfDamage || 0) + 0.05 } },
        heavy: { name: "鈍重", desc: "威力+30%/CT+20%", calc: (s) => { s.power *= 1.3; s.coolTime *= 1.2 } },
        meditation: { name: "瞑想", desc: "威力-20%/自分回復", calc: (s) => { s.power *= 0.8; s.healSelf = true } },
        quick_step: { name: "軽業", desc: "SPD+5", calc: (s) => s.spdBonus = (s.spdBonus || 0) + 5 }
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
            encounters: [
                ["slime"],
                ["slime", "slime"]
            ]
        },
        {
            id: "cave",
            name: "暗い洞窟",
            encounters: [
                ["bat"],
                ["goblin"],
                ["bat", "goblin"]
            ]
        },
        {
            id: "cemetery",
            name: "古い墓地",
            encounters: [
                ["skeleton"],
                ["bat", "bat"],
                ["skeleton", "ghost"]
            ]
        },
        {
            id: "volcano",
            name: "灼熱の火山",
            encounters: [
                ["fire_spirit"],
                ["fire_spirit", "fire_spirit"],
                ["magma_golem"]
            ]
        },
        {
            id: "castle",
            name: "荒れ果てた王城",
            encounters: [
                ["armored_knight"],
                ["armored_knight", "ghost"],
                ["high_wizard"]
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
                { id: "prayer", rate: 0.05 }
            ],
            skills: [
                { id: "magic_bullet", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "fire_ball", level: 1, fragments: [], currentCoolDown: 0, condition: "always" },
                { id: "heal", level: 1, fragments: [], currentCoolDown: 0, condition: "hp_low" }
            ]
        }
    }
};

MASTER_DATA.FRAGMENT_DROP_CHANCE = 0.1;
MASTER_DATA.FRAGMENT_GROUPS = {
    group1: ["power_up", "ct_down", "quick_step", "life_steal", "meditation", "heavy", "double_cast", "berserk"],
};
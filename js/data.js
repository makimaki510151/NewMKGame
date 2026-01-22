const MASTER_DATA = {
    SKILLS: {
        attack: {
            id: "attack", name: "通常攻撃", type: "physical", power: 1.0, coolTime: 0,
            growth: { power: 0.1 }
        }, // 進化ごとにパワー+0.1
        slash: {
            id: "slash", name: "斬撃", type: "physical", power: 1.5, coolTime: 3,
            growth: { power: 0.2 }
        },
        magic_bullet: {
            id: "magic_bullet", name: "魔力弾", type: "magical", power: 1.2, coolTime: 4,
            growth: { power: 0.15 }
        },
        heal: {
            id: "heal", name: "回復", type: "heal", power: 1.0, coolTime: 5,
            growth: { power: 0.2, coolTime: -0.1 }
        } // 回復はCTもわずかに縮まる例
    },
    FRAGMENT_EFFECTS: {
        power_up: { name: "強撃", desc: "威力+20%", calc: (s) => s.power *= 1.2 },
        ct_down: { name: "神速", desc: "CT-15%", calc: (s) => s.coolTime *= 0.85 },
        life_steal: { name: "吸血", desc: "与ダメ5%回復", calc: (s) => s.lifeSteal = (s.lifeSteal || 0) + 0.05 },
        double_cast: { name: "追撃", desc: "10%で再発動", calc: (s) => s.doubleChance = (s.doubleChance || 0) + 0.1 },
        berserk: { name: "諸刃", desc: "威力+50%/自傷5%", calc: (s) => { s.power *= 1.5; s.selfDamage = (s.selfDamage || 0) + 0.05 } },
        heavy: { name: "鈍重", desc: "威力+30%/CT+20%", calc: (s) => { s.power *= 1.3; s.coolTime *= 1.2 } },
        meditation: { name: "瞑想", desc: "威力-20%/自分回復", calc: (s) => { s.power *= 0.8; s.healSelf = true } },
        quick_step: { name: "軽業", desc: "SPD+5", calc: (s) => s.spdBonus = (s.spdBonus || 0) + 5 }
    },
    // スキル使用条件の定義
    SKILL_CONDITIONS: [
        { id: "always", name: "常に使う" },
        { id: "hp_low", name: "HP50%以下で使う" },
        { id: "hp_high", name: "HP51%以上で使う" },
        { id: "enemy_many", name: "敵が3体以上いるとき使う" },
        { id: "ally_dead", name: "味方が戦闘不能のとき使う" }
    ],
    MAPS: [
        // {
        //     id: "test",
        //     name: "デバッグステージ",
        //     encounters: [
        //         ["debug", "debug", "debug", "debug"]
        //     ]
        // },
        {
            id: "forest",
            name: "静かな森",
            encounters: [
                ["slime"]
            ]
        },
        {
            id: "cave",
            name: "暗い洞窟",
            encounters: [
                ["bat"],
                ["goblin"]
            ]
        },
        {
            id: "cemetery",
            name: "古い墓地",
            encounters: [
                ["skeleton"],
                ["bat", "bat"]
            ]
        }
    ],
    ENEMIES: {
        debug: {
            id: "debug", name: "デバッグ君", hp: 1, pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1, exp: 100,
            drop: { id: "slash", rate: 0.5 },
            skills: ["attack", "slash", "magic_bullet", "heal"]
        },
        slime: {
            id: "slime", name: "スライム", hp: 50, pAtk: 10, pDef: 5, mAtk: 5, mDef: 5, spd: 8, exp: 5,
            drop: { id: "slash", rate: 0.01 },
            skills: ["attack"] // 敵が使うスキルのリスト
        },
        goblin: {
            id: "goblin", name: "ゴブリン", hp: 120, pAtk: 15, pDef: 10, mAtk: 5, mDef: 5, spd: 12, exp: 5,
            drop: { id: "slash", rate: 0.02 },
            skills: ["attack", "slash"] // 斬撃も使えるようにしておく
        },
        bat: {
            id: "bat", name: "コウモリ", hp: 40, pAtk: 12, pDef: 3, mAtk: 5, mDef: 10, spd: 20, exp: 5,
            drop: { id: "magic_bullet", rate: 0.02 },
            skills: ["attack", "magic_bullet"]
        },
        skeleton: {
            id: "skeleton", name: "スケルトン", hp: 120, pAtk: 20, pDef: 15, mAtk: 0, m_def: 0, spd: 5, exp: 5,
            drop: { id: "slash", rate: 0.05 },
            skills: ["attack", "slash"]
        }
    }
};
MASTER_DATA.FRAGMENT_DROP_CHANCE = 0.1; // 10%でドロップ

MASTER_DATA.FRAGMENT_GROUPS = {
    group1: ["power_up", "ct_down", "quick_step", "life_steal", "meditation", "heavy", "double_cast", "berserk"],
};
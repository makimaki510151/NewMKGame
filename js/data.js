const MASTER_DATA = {
    SKILLS: {
        attack: { id: "attack", name: "通常攻撃", type: "physical", power: 1.0, coolTime: 0 },
        slash: { id: "slash", name: "斬撃", type: "physical", power: 1.5, coolTime: 2 },
        magic_bullet: { id: "magic_bullet", name: "魔力弾", type: "magical", power: 1.2, coolTime: 3 },
        heal: { id: "heal", name: "回復", type: "heal", power: 1.0, coolTime: 4 }
    },
    // スキル使用条件の定義
    SKILL_CONDITIONS: [
        { id: "always", name: "常に使う" },
        { id: "hp_low", name: "HP50%以下で使う" },
        { id: "hp_high", name: "HP51%以上で使う" }
    ],
    MAPS: [
        {
            id: "test",
            name: "デバッグステージ",
            encounters: [
                ["debug", "debug", "debug", "debug"]
            ]
        },
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
        debug: { id: "debug", name: "デバッグ君", hp: 1, pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1, exp: 100, drop: { id: "slash", rate: 0.5 } },
        slime: { id: "slime", name: "スライム", hp: 50, pAtk: 10, pDef: 5, mAtk: 5, mDef: 5, spd: 8, exp: 10, drop: { id: "slash", rate: 0.01 } },
        goblin: { id: "goblin", name: "ゴブリン", hp: 80, pAtk: 15, pDef: 8, mAtk: 2, mDef: 4, spd: 12, exp: 10, drop: { id: "slash", rate: 0.02 } },
        bat: { id: "bat", name: "コウモリ", hp: 40, pAtk: 12, pDef: 3, mAtk: 5, mDef: 10, spd: 20, exp: 10, drop: { id: "magic_bullet", rate: 0.02 } },
        skeleton: { id: "skeleton", name: "スケルトン", hp: 120, pAtk: 20, pDef: 15, mAtk: 0, m_def: 0, spd: 5, exp: 10, drop: { id: "slash", rate: 0.05} }
    }
};
const MASTER_DATA = {
    SKILLS: {
        attack: { id: "attack", name: "通常攻撃", type: "physical", power: 1.0 },
        slash: { id: "slash", name: "斬撃", type: "physical", power: 1.5 },
        magic_bullet: { id: "magic_bullet", name: "魔力弾", type: "magical", power: 1.2 },
        heal: { id: "heal", name: "回復", type: "heal", power: 1.0 }
    },
    MAPS: [
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
                ["skeleton"]
            ] 
        }
    ],
    ENEMIES: {
        slime: { id: "slime", name: "スライム", hp: 50, pAtk: 10, pDef: 5, mAtk: 5, mDef: 5, spd: 8, exp: 10 },
        goblin: { id: "goblin", name: "ゴブリン", hp: 80, pAtk: 15, pDef: 8, mAtk: 2, mDef: 4, spd: 12, exp: 10 },
        bat: { id: "bat", name: "コウモリ", hp: 40, pAtk: 12, pDef: 3, mAtk: 5, mDef: 10, spd: 20, exp: 10 },
        skeleton: { id: "skeleton", name: "スケルトン", hp: 120, pAtk: 20, pDef: 15, mAtk: 0, m_def: 0, spd: 5, exp: 10 }
    }
};
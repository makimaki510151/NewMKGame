class Character {
    constructor(id, name, savedData = null) {
        this.id = id;
        this.name = name;
        this.level = 1;
        this.reincarnationCount = 0;
        this.exp = 0;
        this.maxExp = 100;
        this.currentMaxHp = 100;
        this.stats = { hp: 100, pAtk: 10, pDef: 10, mAtk: 10, mDef: 10, spd: 10 };
        this.skills = [
            { id: "attack", currentCoolDown: 0, condition: "always", slots: [null, null, null] }
        ];
        if (this.skills) {
            this.skills = this.skills.map(s => {
                if (!s.slots) s.slots = [null, null, null]; // 3スロット固定の例
                return s;
            });
        }

        // 保存データがあれば上書き
        if (savedData) {
            Object.assign(this, savedData);
            // オブジェクト形式への変換ガード（前回提示分）
            if (this.skills && typeof this.skills[0] === 'string') {
                this.skills = this.skills.map(sId => ({ id: sId, currentCoolDown: 0, condition: "always" }));
            }
        }
    }

    getSkillEffectiveData(sInfo) {
        const base = MASTER_DATA.SKILLS[sInfo.id];
        const level = sInfo.level || 0;
        const growth = base.growth || {};

        // 1. スキルレベルによる基礎値計算
        let effective = {
            ...base,
            name: level > 0 ? `${base.name}+${level}` : base.name,
            power: base.power + (growth.power || 0) * level,
            coolTime: Math.max(0, base.coolTime + (growth.coolTime || 0) * level),
            // 追加の隠しパラメータ初期化
            lifeSteal: 0,
            selfDamage: 0,
            doubleChance: 0,
            healSelf: false
        };

        // 2. 「輝きのかけら」の効果を順番に適用
        if (sInfo.slots && Array.isArray(sInfo.slots)) {
            sInfo.slots.forEach(fragment => {
                if (fragment && fragment.effects) {
                    fragment.effects.forEach(effectKey => {
                        const effectConfig = MASTER_DATA.FRAGMENT_EFFECTS[effectKey];
                        if (effectConfig && effectConfig.calc) {
                            effectConfig.calc(effective); // 効果を適用
                        }
                    });
                }
            });
        }

        return effective;
    }

    // 保存用データ作成
    serialize() {
        return {
            level: this.level,
            reincarnationCount: this.reincarnationCount,
            exp: this.exp,
            currentMaxHp: this.currentMaxHp,
            stats: { ...this.stats },
            skills: [...this.skills]
        };
    }

    // 戦闘ごとに呼び出す全快処理
    fullHeal() {
        this.stats.hp = this.currentMaxHp;
    }
    // UI表示用に現在のステータスをまとめる
    getDisplayData() {
        return {
            name: this.name,
            level: this.level,
            reincarnation: this.reincarnationCount,
            exp: this.exp,
            maxExp: this.maxExp,
            hp: this.stats.hp,
            maxHp: this.currentMaxHp,
            pAtk: this.stats.pAtk,
            pDef: this.stats.pDef,
            mAtk: this.stats.mAtk,
            mDef: this.stats.mDef,
            spd: this.stats.spd,
            skills: this.skills
        };
    }

    gainExp(amount) {
        this.exp += amount;
        console.log(`${this.name} gained ${amount} exp. Current: ${this.exp}/${this.maxExp}`);

        while (this.exp >= this.maxExp && this.level < 100) {
            this.level++;
            this.exp -= this.maxExp;
            this.levelUpStats();
            console.log(`${this.name} leveled up to ${this.level}!`);
        }
    }

    levelUpStats() {
        const statKeys = ['currentMaxHp', 'pAtk', 'pDef', 'mAtk', 'mDef', 'spd'];
        for (let i = 0; i < 2; i++) {
            const randomKey = statKeys[Math.floor(Math.random() * statKeys.length)];
            this.stats[randomKey === 'currentMaxHp' ? 'hp' : randomKey] += 5;
            if (randomKey === 'currentMaxHp') this.currentMaxHp += 5;
        }
    }

    changeScene(sceneId) {
        this.currentScene = sceneId;
        document.getElementById('scene-title').classList.toggle('hidden', sceneId !== 'title');
        document.getElementById('scene-map-select').classList.toggle('hidden', sceneId !== 'map-select');
        document.getElementById('scene-battle').classList.toggle('hidden', sceneId !== 'battle');

        if (sceneId === 'title') {
            // 拠点に戻ったらパーティを全回復
            this.party.forEach(c => {
                if (c.stats.hp <= 0) c.stats.hp = 100; // 簡易的な蘇生
            });
            this.updatePartyUI();
        }
    }

    resetCoolDowns() {
        if (Array.isArray(this.skills)) {
            this.skills.forEach(s => {
                if (typeof s === 'object') {
                    s.currentCoolDown = 0;
                }
            });
        }
    }

    updateCoolDowns() {
        this.skills.forEach(s => {
            if (s.currentCoolDown > 0) s.currentCoolDown--;
        });
    }

    reincarnate() {
        if (this.level < 100) return;

        this.reincarnationCount++;
        this.level = 1;
        this.exp = 0;

        // ボーナスポイントの計算 (転生回数 × 20)
        let bonusPool = this.reincarnationCount * 20;

        // 初期ステータスの再設定
        this.currentMaxHp = 100;
        this.stats = { hp: 100, pAtk: 10, pDef: 10, mAtk: 10, mDef: 10, spd: 10 };

        // ボーナスポイントをランダムなステータスに割り振る
        const statKeys = ['currentMaxHp', 'pAtk', 'pDef', 'mAtk', 'mDef', 'spd'];
        while (bonusPool > 0) {
            const key = statKeys[Math.floor(Math.random() * statKeys.length)];
            const add = Math.min(bonusPool, 5); // 5ポイントずつ割り振り
            if (key === 'currentMaxHp') {
                this.currentMaxHp += add;
                this.stats.hp = this.currentMaxHp;
            } else {
                this.stats[key] += add;
            }
            bonusPool -= add;
        }
        this.fullHeal();
    }
}
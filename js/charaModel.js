class Character {
    constructor(id, name, savedData) {
        this.id = id;
        this.name = name;
        this.job = "adventurer";
        this.level = 1;
        this.reincarnationCount = 0;
        this.exp = 0;
        this.maxExp = 100;
        this.currentMaxHp = 100;
        this.stats = { hp: 100, pAtk: 10, pDef: 10, mAtk: 10, mDef: 10, spd: 10 };
        this.currentHate = 0;
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
            // オブジェクト形式への変換ガード
            if (this.skills) {
                this.skills = this.skills.map(s => {
                    // 文字列形式だった場合のケア
                    if (typeof s === 'string') {
                        return { id: s, currentCoolDown: 0, condition: "always", slots: [null, null, null] };
                    }
                    // slotsがない場合の補完
                    if (!s.slots) s.slots = [null, null, null];
                    return s;
                });
            }
            if (!this.job) this.job = "adventurer";
        }
    }

    distributePoints(points) {
        const weights = MASTER_DATA.JOBS[this.job || 'adventurer'].weights;
        const statKeys = Object.keys(weights);
        const totalWeight = statKeys.reduce((sum, key) => sum + weights[key], 0);

        for (let i = 0; i < points; i++) {
            let rnd = Math.random() * totalWeight;
            let current = 0;
            for (let key of statKeys) {
                current += weights[key];
                if (rnd <= current) {
                    if (key === 'hp') {
                        this.currentMaxHp += 10;
                        this.stats.hp += 10;
                    } else {
                        this.stats[key] += 1;
                    }
                    break;
                }
            }
        }
    }

    getSkillEffectiveData(sInfo) {
        const base = MASTER_DATA.SKILLS[sInfo.id];
        const level = sInfo.level || 0;
        const growth = base.growth || {};

        let effective = {
            ...base,
            name: level > 0 ? `${base.name}+${level}` : base.name,
            power: base.power + (growth.power || 0) * level,
            coolTime: Math.max(0, base.coolTime + (growth.coolTime || 0) * level),

            lifeSteal: 0,
            selfDamage: 0,
            doubleChance: 0,
            healSelf: false,

            // ヘイト関連の初期値
            hate: base.hate || 10,
            hateMod: 1.0,
            hateReduce: 0
        };

        if (sInfo.slots && Array.isArray(sInfo.slots)) {
            sInfo.slots.forEach(fragment => {
                if (fragment && fragment.effects) {
                    fragment.effects.forEach(effectKey => {
                        const effectConfig = MASTER_DATA.FRAGMENT_EFFECTS[effectKey];
                        if (effectConfig && effectConfig.calc) {
                            effectConfig.calc(effective);
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
        if (this.level < 100) {
            while (this.exp >= this.maxExp) {
                this.exp -= this.maxExp;
                this.level++;
                this.maxExp = 100;

                // レベルアップ時の成長（例：5ポイントを職業の重みで分配）
                this.distributePoints(5);
            }
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
        this.currentMaxHp = 100;
        this.stats = { hp: 100, pAtk: 10, pDef: 10, mAtk: 10, mDef: 10, spd: 10 };

        // 転生ボーナスポイントの分配
        let bonusPool = this.reincarnationCount * 80;
        this.distributePoints(bonusPool);
    }
}
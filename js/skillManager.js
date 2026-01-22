class SkillManager {
    constructor(savedInventory = null, savedFragments = null) {
        // inventory[skillId][level] = count という二次元構造にします
        this.inventory = savedInventory || {
            attack: { 0: 999 },
            slash: { 0: 0 },
            magic_bullet: { 0: 0 },
            heal: { 0: 0 }
        };
        this.fragments = savedFragments || [];
    }

    dropFragment() {
        const fragment = {
            uniqueId: Date.now() + Math.random(),
            name: "輝きのかけら",
            effects: []
        };

        // 1〜3個の効果を抽選
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
            // グループを統合して抽選
            const allEffects = [
                ...MASTER_DATA.FRAGMENT_GROUPS.group1
            ];
            const effect = allEffects[Math.floor(Math.random() * allEffects.length)];
            fragment.effects.push(effect);
        }
        this.fragments.push(fragment);
        return fragment;
    }

    // スキルを拾ったとき
    addSkill(skillId, level = 0) {
        if (!this.inventory[skillId]) this.inventory[skillId] = {};
        this.inventory[skillId][level] = (this.inventory[skillId][level] || 0) + 1;
    }

    // 合成ロジック: A(Lv.N) + A(Lv.N) = A(Lv.N+1)
    combineSkill(skillId, level) {
        if (this.inventory[skillId][level] >= 2) {
            this.inventory[skillId][level] -= 2;
            this.addSkill(skillId, level + 1);
            return true;
        }
        return false;
    }

    // 在庫があるか確認
    hasStock(skillId) {
        return this.inventory[skillId] > 0;
    }

    // スキルを装備（在庫を1減らす）
    consume(skillId, level) {
        if (this.inventory[skillId] && this.inventory[skillId][level] > 0) {
            if (skillId !== 'attack') this.inventory[skillId][level]--;
            return true;
        }
        return false;
    }

    // スキルを外す（指定レベルの在庫を1戻す）
    refund(skillId, level = 0) {
        if (skillId !== 'attack') {
            if (!this.inventory[skillId]) {
                this.inventory[skillId] = {};
            }
            this.inventory[skillId][level] = (this.inventory[skillId][level] || 0) + 1;
        }
    }
}
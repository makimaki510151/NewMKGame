class SkillManager {
    constructor(savedInventory = null) {
        // 初期スキル：attack(無限)以外は0からスタート
        this.inventory = savedInventory || {
            attack: 999,
            slash: 0,
            magic_bullet: 0,
            heal: 0
        };
    }

    // スキルを拾ったとき
    addSkill(skillId) {
        if (this.inventory[skillId] !== undefined) {
            this.inventory[skillId]++;
            return true;
        }
        return false;
    }

    // 在庫があるか確認
    hasStock(skillId) {
        return this.inventory[skillId] > 0;
    }

    // スキルを装備（在庫を1減らす）
    consume(skillId) {
        if (this.hasStock(skillId) && skillId !== 'attack') {
            this.inventory[skillId]--;
            return true;
        }
        return skillId === 'attack';
    }

    // スキルを外す（在庫を1戻す）
    refund(skillId) {
        if (skillId !== 'attack') {
            this.inventory[skillId]++;
        }
    }
}
class SkillManager {
    constructor() {
        // 所持しているスキルIDと個数のマップ
        this.inventory = {
            attack: 4,
            slash: 1,
            magic_bullet: 1,
            heal: 1
        };
    }

    addSkill(skillId) { /* ドロップ時に在庫を増やす */ }
    canEquip(skillId, currentEquippedCount) { /* 在庫チェック */ }
}
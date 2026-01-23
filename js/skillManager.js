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
        if (!this.inventory.scrap) {
            this.inventory.scrap = { count: 0 };
        }
    }

    get scrapCount() {
        return this.inventory.scrap.count || 0;
    }

    // 屑の所持数を設定するセッター
    set scrapCount(value) {
        this.inventory.scrap.count = value;
    }

    deleteFragment(uniqueId) {
        // IDが一致する要素のインデックスを探す
        const index = this.fragments.findIndex(f => String(f.uniqueId) === String(uniqueId));

        if (index !== -1) {
            const fragment = this.fragments[index];
            // 屑を増やす（効果の数に応じた個数）
            const gainScrap = fragment.effects.length;
            this.scrapCount += gainScrap;

            // 指定したインデックスの1件のみを削除
            this.fragments.splice(index, 1);

            return { success: true, gain: gainScrap };
        }
        return { success: false };
    }

    // 必要コストの計算（同類0:100, 1:300, 2:500）
    calculateScrapCost(fragment, effectId) {
        const sameEffectCount = fragment.effects.filter(e => e === effectId).length;
        if (sameEffectCount === 0) return 100;
        if (sameEffectCount === 1) return 300;
        if (sameEffectCount === 2) return 500;
        return 9999;
    }

    // 任意の効果を付与する
    addEffectToFragment(fragmentUniqueId, effectId, replaceIndex = -1) {
        const fragment = this.fragments.find(f => f.uniqueId === fragmentUniqueId);
        if (!fragment) return { success: false, message: "対象が見つかりません" };

        const cost = this.calculateScrapCost(fragment, effectId);
        if (this.scrapCount < cost) {
            return { success: false, message: `屑が不足しています（必要: ${cost}）` };
        }

        // 屑を消費
        this.scrapCount -= cost;

        if (fragment.effects.length >= 3) {
            // 3つ以上の場合は指定スロット（または最後）を上書き
            const idx = (replaceIndex >= 0 && replaceIndex < 3) ? replaceIndex : 2;
            fragment.effects[idx] = effectId;
        } else {
            // 空きがあれば追加
            fragment.effects.push(effectId);
        }

        return { success: true, cost: cost };
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

    combineAllSkills() {
        let combinedAny = false;
        let changed = true;

        // 合成の結果、さらに上のレベルが合成可能になるため、変化がなくなるまでループ
        while (changed) {
            changed = false;
            for (const skillId in this.inventory) {
                if (skillId === 'attack') continue;

                const levels = Object.keys(this.inventory[skillId]).map(Number).sort((a, b) => a - b);
                for (const level of levels) {
                    const count = this.inventory[skillId][level];
                    if (count >= 2) {
                        const pairs = Math.floor(count / 2);
                        this.inventory[skillId][level] -= pairs * 2;
                        this.addSkill(skillId, level + 1, pairs); // addSkillを複数個対応させるか、ループで回す

                        // 今回のコードのaddSkillは+1固定なので、ここで調整
                        for (let i = 1; i < pairs; i++) {
                            this.addSkill(skillId, level + 1);
                        }

                        changed = true;
                        combinedAny = true;
                    }
                }
            }
        }
        return combinedAny;
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
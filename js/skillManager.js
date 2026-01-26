class SkillManager {
    constructor(savedInventory = null, savedFragments = null, savedCrystals = null) {
        // inventory[skillId][level] = count という二次元構造にします
        this.inventory = savedInventory || {
            attack: { 0: 999 },
            slash: { 0: 0 },
            magic_bullet: { 0: 0 },
            heal: { 0: 0 }
        };
        this.fragments = savedFragments || [];
        this.crystals = savedCrystals || [];
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

    bulkDeleteFragments(type) {
        let count = 0;
        // 削除によるインデックスのズレを防ぐため逆順ループ
        for (let i = this.fragments.length - 1; i >= 0; i--) {
            const frag = this.fragments[i];

            // ロックされているものは絶対に削除しない
            if (frag.isLocked) continue;

            let shouldDelete = false;
            if (type === 'count12') {
                // 条件：効果数が1または2
                if (frag.effects.length === 1 || frag.effects.length === 2) {
                    shouldDelete = true;
                }
            } else if (type === 'unique3') {
                // 条件：効果が3つあり、かつ全てが別々のIDである
                if (frag.effects.length === 3) {
                    const uniqueEffects = new Set(frag.effects); // 効果IDの重複を除去
                    if (uniqueEffects.size === 3) {
                        shouldDelete = true;
                    }
                }
            }

            if (shouldDelete) {
                this.deleteFragment(frag.uniqueId);
                count++;
            }
        }
        return count;
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

    dropFragment(groupId = "group1") {
        const fragment = {
            uniqueId: Date.now() + Math.random(),
            name: "輝きのかけら",
            effects: []
        };

        // 指定されたグループが存在しない場合は group1 を参照
        const effectPool = MASTER_DATA.FRAGMENT_GROUPS[groupId] || MASTER_DATA.FRAGMENT_GROUPS.group1;

        // 1〜3個の効果を抽選
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
            const effect = effectPool[Math.floor(Math.random() * effectPool.length)];
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

    // かけらをIDで取得し、リストから削除する（装備時に使用）
    popFragment(uniqueId) {
        const index = this.fragments.findIndex(f => String(f.uniqueId) === String(uniqueId));
        if (index !== -1) {
            return this.fragments.splice(index, 1)[0]; // リストから抜き出して返す
        }
        return null;
    }

    // かけらをリストに戻す（外した時に使用）
    pushFragment(fragmentObj) {
        if (!fragmentObj) return;
        // 重複チェック（念のため）
        if (!this.fragments.some(f => String(f.uniqueId) === String(fragmentObj.uniqueId))) {
            this.fragments.push(fragmentObj);
        }
    }

    combineCrystals() {
        let createdAny = false;
        // 同じ効果3つが揃っている「かけら」を抽出
        const tripleFrags = this.fragments.filter(f =>
            f.effects.length === 3 && f.effects.every(e => e === f.effects[0])
        );

        const groups = {};
        tripleFrags.forEach(f => {
            const id = f.effects[0];
            if (!groups[id]) groups[id] = [];
            groups[id].push(f);
        });

        for (const effectId in groups) {
            // 同じトリプルかけらが3枚以上あれば合成可能
            while (groups[effectId].length >= 3) {
                for (let i = 0; i < 3; i++) {
                    const target = groups[effectId].shift();
                    const idx = this.fragments.findIndex(f => f.uniqueId === target.uniqueId);
                    if (idx !== -1) this.fragments.splice(idx, 1);
                }

                if (!this.crystals) this.crystals = [];
                this.crystals.push({
                    uniqueId: "cry_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                    baseEffectId: effectId,
                    name: MASTER_DATA.CRYSTALS[effectId].name
                });
                createdAny = true;
            }
        }
        return createdAny;
    }

    // 結晶をスキルの専用スロットに装備する
    equipCrystalToSkill(chara, skillIndex, crystalUniqueId) {
        const crystalIdx = this.crystals.findIndex(c => c.uniqueId === crystalUniqueId);
        if (crystalIdx === -1) return;

        const crystal = this.crystals[crystalIdx];
        const skill = chara.skills[skillIndex];

        // 既に何か装備していたら在庫に戻す
        if (skill.crystalSlot) {
            this.crystals.push(skill.crystalSlot);
        }

        skill.crystalSlot = crystal; // 結晶専用スロット
        this.crystals.splice(crystalIdx, 1); // 在庫から削除
    }

    combineSpecificFragments(uniqueIds) {
        // IDから実際のかけらデータを取り出す
        const targets = this.fragments.filter(f => uniqueIds.includes(String(f.uniqueId)));

        if (targets.length !== 3) return { success: false, message: "かけらが3つ見つかりません。" };

        // 「装備中」でないか再度確認（念のため）
        // ※ GameController側でフィルタリング済みならここは簡略化可能

        // 3つのかけらが共通して持っている「トリプル（同じ効果3つ）」を探す
        // かけらA: [power, power, power] なら power が対象
        const getTripleEffect = (frag) => {
            const counts = {};
            for (const e of frag.effects) counts[e] = (counts[e] || 0) + 1;
            return Object.keys(counts).find(e => counts[e] >= 3);
        };

        const effectId1 = getTripleEffect(targets[0]);
        const effectId2 = getTripleEffect(targets[1]);
        const effectId3 = getTripleEffect(targets[2]);

        if (!effectId1 || effectId1 !== effectId2 || effectId1 !== effectId3) {
            return { success: false, message: "同じ効果を3つ持つ「トリプルかけら」を3つ選んでください。" };
        }

        // 合成処理：かけらを削除
        uniqueIds.forEach(id => {
            const idx = this.fragments.findIndex(f => String(f.uniqueId) === String(id));
            if (idx !== -1) this.fragments.splice(idx, 1);
        });

        // 結晶を生成
        const crystal = {
            uniqueId: "cry_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
            baseEffectId: effectId1,
            name: MASTER_DATA.CRYSTALS[effectId1].name
        };
        this.crystals.push(crystal);

        return { success: true, crystalName: crystal.name };
    }
}
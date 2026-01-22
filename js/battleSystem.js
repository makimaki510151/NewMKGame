class BattleSystem {
    constructor() {
        this.maxCt = 100;
    }

    simulate(party, enemies) {
        let logs = [];
        let isBattleEnd = false;
        let winner = null;

        const units = [
            ...party.map(u => ({ type: 'player', data: u, ct: 0 })),
            ...enemies.map(e => ({ type: 'enemy', data: e, ct: 0 }))
        ];

        let turnLimit = 5000;
        while (!isBattleEnd && turnLimit > 0) {
            turnLimit--;

            units.forEach(unit => {
                const s = unit.type === 'player' ? unit.data.stats : unit.data;
                if (s.hp > 0) {
                    unit.ct += s.spd * 0.1;
                }
            });

            const readyUnits = units
                .filter(u => u.ct >= this.maxCt)
                .sort((a, b) => b.ct - a.ct);

            for (let actor of readyUnits) {
                if (isBattleEnd) break;

                const actorStats = actor.type === 'player' ? actor.data.stats : actor.data;
                if (actorStats.hp <= 0) continue;

                const result = this.executeAction(actor, units);
                if (result.log) logs.push(result.log);
                actor.ct -= this.maxCt;

                const alivePlayers = units.filter(u => u.type === 'player' && u.data.stats.hp > 0);
                const aliveEnemies = units.filter(u => u.type === 'enemy' && u.data.hp > 0);

                if (aliveEnemies.length === 0) {
                    winner = 'player';
                    isBattleEnd = true;
                    logs.push("敵を全滅させた！");
                    break;
                } else if (alivePlayers.length === 0) {
                    winner = 'enemy';
                    isBattleEnd = true;
                    logs.push("全滅した...");
                    break;
                }
            }
        }

        if (!winner) {
            winner = 'enemy';
            logs.push("時間切れ（引き分け）");
        }

        return { winner, logs, exp: winner === 'player' ? enemies.reduce((sum, e) => sum + e.exp, 0) : 0 };
    }

    executeAction(actor, allUnits) {
        const isPlayer = actor.type === 'player';
        const chara = actor.data;

        // ターゲット選定
        const targets = allUnits.filter(u =>
            (isPlayer ? u.type === 'enemy' : u.type === 'player') &&
            (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
        );
        if (targets.length === 0) return { log: "" };
        const target = targets[Math.floor(Math.random() * targets.length)];

        let selectedSkillId = "attack";
        let selectedSkillLevel = 0;

        if (isPlayer) {
            // プレイヤーのスキル選択（既存ロジック）
            for (let i = chara.skills.length - 1; i >= 0; i--) {
                const sInfo = chara.skills[i];
                const sData = chara.getSkillEffectiveData(sInfo);
                const isAvailable = (sInfo.currentCoolDown || 0) <= 0;
                const isConditionMet = this.checkSkillCondition(chara, sInfo.condition || 'always');

                if (isAvailable && isConditionMet) {
                    selectedSkillId = sInfo.id;
                    selectedSkillLevel = sInfo.level || 0;
                    sInfo.currentCoolDown = sData.coolTime || 0;
                    break;
                }
            }
            chara.updateCoolDowns();
        } else {
            // 敵のスキル選択
            // chara.skills が定義されている場合は、ランダムまたは順に選択（現在は簡易的にランダム）
            if (chara.skills && chara.skills.length > 0) {
                // attack以外のスキルがある場合、一定確率で使うなどのロジックも可能
                selectedSkillId = chara.skills[Math.floor(Math.random() * chara.skills.length)];
            }
        }

        // スキル詳細データの取得
        let skill;
        if (isPlayer) {
            skill = chara.getSkillEffectiveData({ id: selectedSkillId, level: selectedSkillLevel });
        } else {
            // 敵はレベル0として MASTER_DATA から取得
            skill = MASTER_DATA.SKILLS[selectedSkillId] || MASTER_DATA.SKILLS.attack;
        }

        // ステータス参照の統一
        const aStats = isPlayer ? chara.stats : chara;
        const dStats = isPlayer ? target.data : target.data.stats;

        // ダメージ計算
        let dmg = 0;
        if (skill.type === "physical") {
            dmg = Math.max(1, (aStats.pAtk * skill.power) - (dStats.pDef * 0.5));
        } else if (skill.type === "magical") {
            dmg = Math.max(1, (aStats.mAtk * skill.power) - (dStats.mDef * 0.5));
        } else if (skill.type === "heal") {
            const healAmt = Math.floor(aStats.mAtk * skill.power);
            if (isPlayer) {
                aStats.hp = Math.min(chara.currentMaxHp, aStats.hp + healAmt);
            } else {
                // 敵が自分を回復する場合（簡易実装）
                chara.hp = Math.min(chara.maxHp || chara.hp, chara.hp + healAmt);
            }
            return { log: `${isPlayer ? chara.name : chara.name}の[${skill.name}]！ HPが ${healAmt} 回復した。` };
        }

        dmg = Math.floor(dmg);
        if (isPlayer) {
            target.data.hp -= dmg;
        } else {
            target.data.stats.hp -= dmg;
        }

        const attackerName = chara.name;
        const targetName = isPlayer ? target.data.name : target.data.name;

        return { log: `${attackerName}の[${skill.name}]！ ${targetName}に ${dmg} のダメージ！` };
    }

    // スキルの使用条件を判定するヘルパー
    checkSkillCondition(chara, condition) {
        const hpRate = chara.stats.hp / chara.currentMaxHp;
        switch (condition) {
            case 'hp_low': return hpRate <= 0.5;
            case 'hp_high': return hpRate > 0.5;
            case 'always': return true;
            default: return true;
        }
    }
}
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

        // --- 1. 使用するスキルとデータの決定 ---
        let selectedSkillId = "attack";
        let selectedSkillLevel = 0;
        let sInfoRef = null;

        if (isPlayer) {
            for (let i = chara.skills.length - 1; i >= 0; i--) {
                const sInfo = chara.skills[i];
                const sData = chara.getSkillEffectiveData(sInfo);
                const isAvailable = (sInfo.currentCoolDown || 0) <= 0;
                const isConditionMet = this.checkSkillCondition(chara, sInfo.condition || 'always', allUnits);

                if (isAvailable && isConditionMet) {
                    selectedSkillId = sInfo.id;
                    selectedSkillLevel = sInfo.level || 0;
                    sInfo.currentCoolDown = sData.coolTime || 0;
                    sInfoRef = sInfo;
                    break;
                }
            }
            chara.updateCoolDowns();
        } else {
            if (chara.skills && chara.skills.length > 0) {
                selectedSkillId = chara.skills[Math.floor(Math.random() * chara.skills.length)];
            }
        }

        let skill;
        if (isPlayer) {
            skill = chara.getSkillEffectiveData(sInfoRef || { id: selectedSkillId, level: selectedSkillLevel });
        } else {
            skill = MASTER_DATA.SKILLS[selectedSkillId] || MASTER_DATA.SKILLS.attack;
        }

        // --- 2. ターゲットの選定 ---
        let targets;
        if (skill.type === "heal") {
            targets = allUnits.filter(u => u.type === actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
        } else {
            targets = allUnits.filter(u => u.type !== actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
        }

        if (targets.length === 0) return { log: "" };
        const target = targets[Math.floor(Math.random() * targets.length)];

        // --- 3. 実行（計算と適用） ---
        const aStats = isPlayer ? chara.stats : chara;
        const dStats = target.type === 'player' ? target.data.stats : target.data;
        const targetName = target.data.name;
        const attackerName = chara.name;
        const currentMaxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);

        let logs = [];

        // スキル本体の処理
        if (skill.type === "heal") {
            const healAmt = Math.floor(aStats.mAtk * skill.power);
            const tMaxHp = target.type === 'player' ? target.data.currentMaxHp : (target.data.maxHp || target.data.hp);
            dStats.hp = Math.min(tMaxHp, dStats.hp + healAmt);
            logs.push(`${attackerName}の[${skill.name}]！ ${targetName}のHPが ${healAmt} 回復。`);
        } else {
            let dmg = 0;
            if (skill.type === "physical") {
                // ダメージ / 防御力 の形式に変更
                const rawDmg = aStats.pAtk * skill.power;
                dmg = rawDmg / Math.max(1, dStats.pDef);
            } else if (skill.type === "magical") {
                // ダメージ / 防御力 の形式に変更
                const rawDmg = aStats.mAtk * skill.power;
                dmg = rawDmg / Math.max(1, dStats.mDef);
            }
            dmg = Math.max(1, Math.floor(dmg));
            dStats.hp -= dmg;
            logs.push(`${attackerName}の[${skill.name}]！ ${targetName}に ${dmg} のダメージ！`);

            if (skill.lifeSteal > 0) {
                const stealAmt = Math.floor(dmg * skill.lifeSteal);
                aStats.hp = Math.min(currentMaxHp, aStats.hp + stealAmt);
                logs.push(`${attackerName}は生命力を吸収し ${stealAmt} 回復。`);
            }
        }

        // かけらの追加効果（自傷・瞑想）
        if (skill.selfDamage > 0) {
            const selfDmg = Math.floor(currentMaxHp * skill.selfDamage);
            aStats.hp = Math.max(1, aStats.hp - selfDmg);
            logs.push(`${attackerName}は反動で ${selfDmg} ダメージ。`);
        }
        if (skill.healSelf) {
            const meditationHeal = Math.floor(aStats.mAtk * 0.5);
            aStats.hp = Math.min(currentMaxHp, aStats.hp + meditationHeal);
            logs.push(`${attackerName}は自身のHPを回復。`);
        }

        // --- 4. 追撃（再発動）の処理 ---
        // 無限ループを防ぐため、再発動時は確率判定を行わないように一時的にスキルデータを書き換えるか、
        // ここで直接もう一度ダメージ処理を行います。
        if (skill.doubleChance > 0 && Math.random() < skill.doubleChance) {
            logs.push(`>> 追撃発動！`);
            // 追撃分はCT消費や条件判定を飛ばして、この場でダメージ/回復を再計算
            const followUpResult = this.executeFollowUp(actor, skill, allUnits);
            if (followUpResult.log) logs.push(followUpResult.log);
        }

        return { log: logs.join(" ") };
    }

    // 追撃専用の軽量メソッド（CT消費などを行わない）
    executeFollowUp(actor, skill, allUnits) {
        const isPlayer = actor.type === 'player';
        const chara = actor.data;

        // ターゲット再選定（前のターゲットが死んでいる可能性があるため）
        let targets;
        if (skill.type === "heal") {
            targets = allUnits.filter(u => u.type === actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
        } else {
            targets = allUnits.filter(u => u.type !== actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
        }
        if (targets.length === 0) return { log: "" };
        const target = targets[Math.floor(Math.random() * targets.length)];

        const aStats = isPlayer ? chara.stats : chara;
        const dStats = target.type === 'player' ? target.data.stats : target.data;

        let dmgOrHeal = 0;
        if (skill.type === "heal") {
            dmgOrHeal = Math.floor(aStats.mAtk * skill.power);
            const tMaxHp = target.type === 'player' ? target.data.currentMaxHp : (target.data.maxHp || target.data.hp);
            dStats.hp = Math.min(tMaxHp, dStats.hp + dmgOrHeal);
            return { log: `[追撃] ${target.data.name}のHPを ${dmgOrHeal} 回復！` };
        } else {
            if (skill.type === "physical") {
                const rawDmg = aStats.pAtk * skill.power;
                dmgOrHeal = rawDmg / Math.max(1, dStats.pDef);
            } else if (skill.type === "magical") {
                const rawDmg = aStats.mAtk * skill.power;
                dmgOrHeal = rawDmg / Math.max(1, dStats.mDef);
            }
            dmgOrHeal = Math.max(1, Math.floor(dmgOrHeal));
            dStats.hp -= dmgOrHeal;
            return { log: `[追撃] ${target.data.name}に ${dmgOrHeal} ダメージ！` };
        }
    }

    // スキルの使用条件を判定するヘルパー
    checkSkillCondition(chara, condition, allUnits) {
        const hpRate = chara.stats.hp / chara.currentMaxHp;
        const alivePlayers = allUnits.filter(u => u.type === 'player' && u.data.stats.hp > 0);
        const aliveEnemies = allUnits.filter(u => u.type === 'enemy' && u.data.hp > 0);

        switch (condition) {
            case 'hp_low': return hpRate <= 0.5;
            case 'hp_high': return hpRate > 0.5;
            case 'enemy_many': return aliveEnemies.length >= 3;
            case 'ally_dead': return allUnits.filter(u => u.type === 'player' && u.data.stats.hp <= 0).length > 0;
            case 'always': return true;
            default: return true;
        }
    }
}
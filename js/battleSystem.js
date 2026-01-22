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

        // --- 1. まず使用するスキルを決める ---
        let selectedSkillId = "attack";
        let selectedSkillLevel = 0;

        if (isPlayer) {
            // プレイヤーのスキル選択
            for (let i = chara.skills.length - 1; i >= 0; i--) {
                const sInfo = chara.skills[i];
                const sData = chara.getSkillEffectiveData(sInfo);
                const isAvailable = (sInfo.currentCoolDown || 0) <= 0;
                const isConditionMet = this.checkSkillCondition(chara, sInfo.condition || 'always', allUnits);

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
            if (chara.skills && chara.skills.length > 0) {
                selectedSkillId = chara.skills[Math.floor(Math.random() * chara.skills.length)];
            }
        }

        // スキル詳細データの取得
        let skill;
        if (isPlayer) {
            skill = chara.getSkillEffectiveData({ id: selectedSkillId, level: selectedSkillLevel });
        } else {
            skill = MASTER_DATA.SKILLS[selectedSkillId] || MASTER_DATA.SKILLS.attack;
        }

        // --- 2. スキルのタイプに合わせてターゲットを選定する ---
        let targets;
        if (skill.type === "heal") {
            // 回復スキルの場合：自分と同じ陣営（isPlayerならplayer）の生存者
            targets = allUnits.filter(u =>
                u.type === actor.type &&
                (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
            );
        } else {
            // 攻撃スキルの場合：自分と違う陣営（isPlayerならenemy）の生存者
            targets = allUnits.filter(u =>
                u.type !== actor.type &&
                (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
            );
        }

        if (targets.length === 0) return { log: "" };
        const target = targets[Math.floor(Math.random() * targets.length)];

        // --- 3. 実行（ダメージ・回復計算） ---
        const aStats = isPlayer ? chara.stats : chara;
        // ターゲットがプレイヤーか敵かでステータスの場所が違うのを吸収
        const dStats = target.type === 'player' ? target.data.stats : target.data;
        const targetName = target.data.name;
        const attackerName = chara.name;

        if (skill.type === "heal") {
            const healAmt = Math.floor(aStats.mAtk * skill.power);
            const maxHp = target.type === 'player' ? target.data.currentMaxHp : target.data.hp; // 敵の最大HPは現在の値で代用

            dStats.hp = Math.min(maxHp, dStats.hp + healAmt);
            return { log: `${attackerName}の[${skill.name}]！ ${targetName}のHPが ${healAmt} 回復した。` };
        } else {
            // 攻撃
            let dmg = 0;
            if (skill.type === "physical") {
                dmg = Math.max(1, (aStats.pAtk * skill.power) - (dStats.pDef * 0.5));
            } else if (skill.type === "magical") {
                dmg = Math.max(1, (aStats.mAtk * skill.power) - (dStats.mDef * 0.5));
            }
            dmg = Math.floor(dmg);
            dStats.hp -= dmg;
            return { log: `${attackerName}の[${skill.name}]！ ${targetName}に ${dmg} のダメージ！` };
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
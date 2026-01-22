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

        // --- スキル選択ロジック ---
        let selectedSkillId = "attack";
        if (isPlayer) {
            // クールタイムが0かつ条件を満たすスキルを、リストの後ろ（強力なもの）から探す
            for (let i = chara.skills.length - 1; i >= 0; i--) {
                const sInfo = chara.skills[i];
                const sData = MASTER_DATA.SKILLS[sInfo.id];

                // クールタイム中かチェック
                const isAvailable = (sInfo.currentCoolDown || 0) <= 0;
                // 条件チェック（簡易版）
                const isConditionMet = this.checkSkillCondition(chara, sInfo.condition || 'always');

                if (isAvailable && isConditionMet) {
                    selectedSkillId = sInfo.id;
                    // クールタイムをセット
                    sInfo.currentCoolDown = sData.coolTime || 0;
                    break;
                }
            }
            // 全スキルのクールダウンを1進める（今回の使用分以外）
            chara.updateCoolDowns();
        }

        const skill = MASTER_DATA.SKILLS[selectedSkillId];
        const aStats = isPlayer ? chara.stats : chara;
        const dStats = isPlayer ? target.data : target.data.stats;

        // ダメージ計算（スキルのPowerを乗算）
        let dmg = 0;
        if (skill.type === "physical") {
            dmg = Math.max(1, (aStats.pAtk * skill.power) - (dStats.pDef * 0.5));
        } else if (skill.type === "magical") {
            dmg = Math.max(1, (aStats.mAtk * skill.power) - (dStats.mDef * 0.5));
        } else if (skill.type === "heal") {
            // 回復スキルの場合
            const healAmt = Math.floor(aStats.mAtk * skill.power);
            aStats.hp = Math.min(chara.currentMaxHp, aStats.hp + healAmt);
            return { log: `${chara.name}の[${skill.name}]！ HPが ${healAmt} 回復した。` };
        }

        dmg = Math.floor(dmg);
        if (isPlayer) {
            target.data.hp -= dmg;
        } else {
            target.data.stats.hp -= dmg;
        }

        const attackerName = isPlayer ? chara.name : chara.name;
        const targetName = isPlayer ? target.data.name : target.data.name;

        // スキル名を含んだログを返す
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
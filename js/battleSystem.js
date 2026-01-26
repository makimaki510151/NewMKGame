class BattleSystem {
    constructor() {
        this.maxCt = 100;
        this.baseHate = 10;
    }

    simulate(party, enemies) {
        let logs = [];
        let isBattleEnd = false;
        let winner = null;

        party.forEach(p => {
            p.currentHate = 0;
            // 真・瞑想などの戦闘内バフをリセット
            p.battleBuffs = { pAtk: 1.0, pDef: 1.0, mAtk: 1.0, mDef: 1.0, spd: 1.0 };
            p.damageImmuneCount = 0;
            p.nextDamageBonus = 0;
        });
        enemies.forEach(e => {
            e.currentHate = 0;
            e.battleBuffs = { pAtk: 1.0, pDef: 1.0, mAtk: 1.0, mDef: 1.0, spd: 1.0 };
        });

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

        let selectedSkillId = "attack";
        let sInfoRef = null;
        const skillList = isPlayer ? chara.skills : (chara.skills || []);

        for (let i = skillList.length - 1; i >= 0; i--) {
            const sInfo = skillList[i];
            const sData = isPlayer ? chara.getSkillEffectiveData(sInfo) : this.getEnemySkillData(sInfo);
            if (this.checkSkillCondition(actor, sInfo.condition || 'always', allUnits) && (sInfo.currentCoolDown || 0) <= 0) {
                selectedSkillId = sInfo.id;
                sInfoRef = sInfo;
                sInfo.currentCoolDown = sData.coolTime || 0;
                break;
            }
        }
        skillList.forEach(s => { if (s.currentCoolDown > 0) s.currentCoolDown--; });

        const skill = isPlayer
            ? chara.getSkillEffectiveData(sInfoRef || { id: selectedSkillId })
            : this.getEnemySkillData(sInfoRef || { id: selectedSkillId });

        // メイン行動の実行
        let result = this.performMove(actor, skill, allUnits);

        // 【真・軽業】2回連続発動（CTは消費済みなのでそのまま2回目）
        if (skill.doubleRepeat) {
            let secondResult = this.performMove(actor, skill, allUnits);
            result.log += " [連続発動] " + secondResult.log;
        }

        // 行動後のCT操作（真・神速）
        if (skill.instantExtraTurn && Math.random() < skill.instantExtraTurn) {
            actor.ct += this.maxCt;
            result.log += ` ${chara.name}は即再行動の機会を得た！`;
        }

        return result;
    }

    // 実際のダメージ・回復・特殊効果処理を分離
    performMove(actor, skill, allUnits) {
        const isPlayer = actor.type === 'player';
        const chara = actor.data;
        const baseStats = isPlayer ? chara.stats : chara;
        const buffs = chara.battleBuffs || { pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1 };

        const aStats = {
            pAtk: baseStats.pAtk * buffs.pAtk,
            pDef: baseStats.pDef * buffs.pDef,
            mAtk: baseStats.mAtk * buffs.mAtk,
            mDef: baseStats.mDef * buffs.mDef
        };

        if (skill.berserkImmune) {
            baseStats.hp = 1;
            chara.damageImmuneCount = (chara.damageImmuneCount || 0) + skill.berserkImmune;
        }

        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };

        const dBase = target.type === 'player' ? target.data.stats : target.data;
        const dBuffs = target.data.battleBuffs || { pDef: 1, mDef: 1 };
        const dStats = { pDef: dBase.pDef * dBuffs.pDef, mDef: dBase.mDef * dBuffs.mDef };

        const currentMaxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);
        const targetMaxHp = target.type === 'player' ? target.data.currentMaxHp : (target.data.maxHp || target.data.hp);

        let powerMult = skill.power;
        if (skill.firstStrikeMul && dBase.hp >= targetMaxHp) powerMult *= skill.firstStrikeMul;
        if (skill.desperatePower) powerMult *= (1 + (1 - baseStats.hp / currentMaxHp) * 2);

        let log = "";

        if (skill.type === "heal") {
            let healAmt = Math.floor(aStats.mAtk * powerMult);
            dBase.hp = Math.min(targetMaxHp, dBase.hp + healAmt);
            log = `${chara.name}の[${skill.name}]！ ${target.data.name}のHPが ${healAmt} 回復。`;
        } else {
            let dmg = (skill.type === "physical") ? (aStats.pAtk * powerMult / Math.max(1, dStats.pDef)) : (aStats.mAtk * powerMult / Math.max(1, dStats.mDef));
            dmg = Math.floor(dmg + (chara.nextDamageBonus || 0));
            chara.nextDamageBonus = 0;

            if (target.data.damageImmuneCount > 0) {
                dmg = 0; target.data.damageImmuneCount--;
                log = `${target.data.name}は攻撃を無効化した！`;
            } else {
                dmg = Math.max(1, dmg);
                dBase.hp -= dmg;
                log = `${chara.name}の[${skill.name}]！ ${target.data.name}に ${dmg} のダメージ！`;

                // ライフスティール（既存ロジック）と【真・吸血】
                if (skill.lifeSteal) {
                    let steal = Math.floor(dmg * skill.lifeSteal);
                    const overflow = Math.max(0, (baseStats.hp + steal) - currentMaxHp);
                    baseStats.hp = Math.min(currentMaxHp, baseStats.hp + steal);
                    log += ` ${chara.name}は ${steal} 吸収！`;

                    if (skill.overflowLifeSteal && overflow > 0) {
                        chara.nextDamageBonus = (chara.nextDamageBonus || 0) + overflow;
                    }
                }
            }
            if (skill.stunEnemy) { target.ct = Math.max(0, target.ct - 50); log += ` スタン付与！`; }
        }

        if (skill.permanentGrowth) {
            ["pAtk", "pDef", "mAtk", "mDef", "spd"].forEach(k => chara.battleBuffs[k] *= (1 + skill.permanentGrowth));
        }
        if (skill.resetHate && target.type === 'player') target.data.currentHate = 0;

        // 追撃判定
        const followUp = this.executeFollowUp(actor, skill, allUnits);
        if (followUp.log) log += " " + followUp.log;

        return { log };
    }

    // battleSystem.js 内のメソッドを更新

    selectTarget(actor, skill, allUnits) {
        if (skill.type === "heal") {
            // 【回復】HP割合が「最も低い」生存している味方を確実に選択
            const allyTargets = allUnits.filter(u =>
                u.type === actor.type &&
                (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
            );

            if (allyTargets.length === 0) return null;

            return allyTargets.reduce((prev, curr) => {
                const getHpRate = (u) => {
                    const s = u.type === 'player' ? u.data.stats : u.data;
                    const m = u.type === 'player' ? u.data.currentMaxHp : (u.data.maxHp || u.data.hp);
                    return s.hp / m;
                };
                return getHpRate(curr) < getHpRate(prev) ? curr : prev;
            });

        } else {
            // 【攻撃】生存している敵対勢力を取得
            const enemyTargets = allUnits.filter(u =>
                u.type !== actor.type &&
                (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
            );

            if (enemyTargets.length === 0) return null;

            // 敵がプレイヤーを狙う場合、ヘイトが「最も高い」キャラを確実に選択
            if (actor.type === 'enemy') {
                return enemyTargets.reduce((prev, curr) => {
                    const hPrev = (prev.data.currentHate || 0);
                    const hCurr = (curr.data.currentHate || 0);
                    // ヘイトが同じなら、配列の前方にいるキャラ（またはランダム）を優先
                    return hCurr > hPrev ? curr : prev;
                });
            }

            // プレイヤーが敵を狙う場合は、現状通り先頭またはランダム
            return enemyTargets[0];
        }
    }

    executeFollowUp(actor, skill, allUnits, chainCount = 0) {
        let chance = (chainCount === 0) ? (skill.doubleChance || 0) : (skill.chainDouble || 0);
        if (Math.random() >= chance) return { log: "" };

        const chara = actor.data;
        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };

        const baseStats = actor.type === 'player' ? chara.stats : chara;
        const buffs = chara.battleBuffs || { pAtk: 1, mAtk: 1 };
        const dBase = target.type === 'player' ? target.data.stats : target.data;
        const dBuffs = target.data.battleBuffs || { pDef: 1, mDef: 1 };

        let dmg = (skill.type === "physical")
            ? (baseStats.pAtk * buffs.pAtk * skill.power / Math.max(1, dBase.pDef * dBuffs.pDef))
            : (baseStats.mAtk * buffs.mAtk * skill.power / Math.max(1, dBase.mDef * dBuffs.mDef));

        dmg = Math.max(1, Math.floor(dmg));
        dBase.hp -= dmg;
        let currentLog = `[追撃] ${target.data.name}に ${dmg} ダメージ！`;

        // 真・追撃の連鎖
        if (skill.chainDouble) {
            const next = this.executeFollowUp(actor, skill, allUnits, chainCount + 1);
            if (next.log) currentLog += " " + next.log;
        }
        return { log: currentLog };
    }

    getEnemySkillData(sInfo) {
        const base = MASTER_DATA.SKILLS[sInfo.id] || MASTER_DATA.SKILLS.attack;
        const level = sInfo.level || 1;
        let effective = {
            ...base,
            power: base.power + (base.growth?.power || 0) * (level - 1),
            coolTime: Math.max(0, (base.coolTime || 0) + (base.growth?.coolTime || 0) * (level - 1)),
        };

        if (sInfo.fragments) {
            sInfo.fragments.forEach(fragId => {
                const fData = MASTER_DATA.FRAGMENT_EFFECTS[fragId];
                if (fData && fData.calc) fData.calc(effective);
            });
        }
        if (sInfo.crystals) {
            sInfo.crystals.forEach(crysId => {
                const cData = MASTER_DATA.CRYSTALS[crysId];
                if (cData && cData.crystalCalc) cData.crystalCalc(effective);
            });
        }
        return effective;
    }

    // スキルの使用条件を判定するヘルパー
    checkSkillCondition(actor, condition, allUnits) {
        const chara = actor.data;
        const isPlayer = actor.type === 'player';

        // ステータスと最大HPの取得先をタイプによって切り替え
        const stats = isPlayer ? chara.stats : chara;
        const maxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);

        const hpRate = stats.hp / maxHp;

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
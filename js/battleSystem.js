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
            p.battleBuffs = { pAtk: 1.0, pDef: 1.0, mAtk: 1.0, mDef: 1.0, spd: 1.0 };
            p.damageImmuneCount = 0;
            p.nextDamageBonus = 0; // 初期化
        });
        enemies.forEach(e => {
            e.currentHate = 0;
            e.battleBuffs = { pAtk: 1.0, pDef: 1.0, mAtk: 1.0, mDef: 1.0, spd: 1.0 };
            e.nextDamageBonus = 0; // 敵側も初期化
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

                let repeatCount = 0;
                let hasExtraTurn = true;

                while (hasExtraTurn && repeatCount < 5) { // 無限ループ防止のため最大3回まで
                    const result = this.executeAction(actor, units);
                    if (result.log) logs.push(result.log);

                    // 真・神速などが発動したかチェック
                    // executeAction内で判定した結果、再行動フラグが立っているかを確認
                    if (result.hasExtraTurn) {
                        repeatCount++;
                        // ログに再行動中であることを明記
                        logs.push(`${actor.data.name}の連続行動！ (${repeatCount}回目)`);

                        // 生存確認（反動ダメージ等で自滅していないか）
                        if (actorStats.hp <= 0) {
                            hasExtraTurn = false;
                        }
                    } else {
                        hasExtraTurn = false;
                    }

                    // 決着判定
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
                actor.ct -= this.maxCt;
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
                sInfo.currentCoolDown = (sData.coolTime || 0) + 1; // 実行ターンに-1されるため+1
                break;
            }
        }
        skillList.forEach(s => { if (s.currentCoolDown > 0) s.currentCoolDown--; });

        const skill = isPlayer
            ? chara.getSkillEffectiveData(sInfoRef || { id: selectedSkillId })
            : this.getEnemySkillData(sInfoRef || { id: selectedSkillId });

        let result = this.performMove(actor, skill, allUnits);

        if (skill.doubleRepeat) {
            let secondResult = this.performMove(actor, skill, allUnits);
            result.log += " [連続発動] " + secondResult.log;
        }

        if (skill.instantExtraTurn && Math.random() < skill.instantExtraTurn) {
            result.hasExtraTurn = true;
        }

        return result;
    }

    performMove(actor, skill, allUnits) {
        const isPlayer = actor.type === 'player';
        const chara = actor.data;
        const baseStats = isPlayer ? chara.stats : chara;
        const buffs = chara.battleBuffs || { pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1 };

        // Bonusがundefinedにならないよう確保
        const nextBonus = chara.nextDamageBonus || 0;

        const aStats = {
            pAtk: baseStats.pAtk * (buffs.pAtk || 1),
            pDef: baseStats.pDef * (buffs.pDef || 1),
            mAtk: baseStats.mAtk * (buffs.mAtk || 1),
            mDef: baseStats.mDef * (buffs.mDef || 1)
        };

        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };

        const dBase = target.type === 'player' ? target.data.stats : target.data;
        const dBuffs = target.data.battleBuffs || { pDef: 1, mDef: 1 };
        const dStats = {
            pDef: dBase.pDef * (dBuffs.pDef || 1),
            mDef: dBase.mDef * (dBuffs.mDef || 1)
        };

        const currentMaxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);
        const targetMaxHp = target.type === 'player' ? target.data.currentMaxHp : (target.data.maxHp || target.data.hp);

        let powerMult = skill.power || 1.0;
        if (skill.firstStrikeMul && dBase.hp >= targetMaxHp * 0.5) powerMult *= skill.firstStrikeMul;
        if (skill.desperatePower) powerMult *= (1 + (1 - (baseStats.hp / currentMaxHp)) * 2);

        let log = "";

        if (skill.type === "heal") {
            let healAmt = Math.floor(aStats.mAtk * powerMult);
            dBase.hp = Math.min(targetMaxHp, dBase.hp + healAmt);
            log = `${chara.name}の[${skill.name}]！ ${target.data.name}のHPが ${healAmt} 回復。`;
        } else {
            // nextBonusを加算。計算式全体がNaNにならないようMath.max(1, ...)でガード
            let dmg = (skill.type === "physical")
                ? (aStats.pAtk * (powerMult + nextBonus) / Math.max(1, dStats.pDef))
                : (aStats.mAtk * (powerMult + nextBonus) / Math.max(1, dStats.mDef));

            dmg = Math.floor(dmg);
            chara.nextDamageBonus = 0; // ボーナス消費

            if (target.data.damageImmuneCount > 0) {
                dmg = 0;
                target.data.damageImmuneCount--;
                log = `${target.data.name}は攻撃を無効化した！`;
            } else {
                dmg = Math.max(1, dmg);
                dBase.hp -= dmg;
                log = `${chara.name}の[${skill.name}]！ ${target.data.name}に ${dmg} のダメージ！`;

                // 死亡ログの追加
                if (dBase.hp <= 0) {
                    dBase.hp = 0;
                    log += ` ${target.data.name}は倒れた！`;
                }

                // 【追加】真・残像のマーク付与
                if (skill.markEcho) {
                    target.data.markedBy = actor;
                    log += ` ${target.data.name}をマークした！`;
                }

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
            if (skill.stunEnemy) {
                target.ct = Math.max(0, target.ct - 50);
                log += ` スタン付与！`;
            }
        }

        if (skill.selfDamage && skill.selfDamage > 0) {
            const stats = isPlayer ? chara.stats : chara;
            const maxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);

            const selfDmg = Math.floor(maxHp * skill.selfDamage);
            stats.hp = Math.max(1, stats.hp - selfDmg);

            if (log) {
                log += ` (反動で ${selfDmg} ダメージ！)`;
            }

            if (skill.berserkImmune && maxHp * skill.berserkImmune <= selfDmg) {
                chara.nextDamageBonus = (chara.nextDamageBonus || 0) + selfDmg * 0.01;
                log += ` (【真・諸刃】条件通過)`;
            }
        }

        if (skill.permanentGrowth) {
            ["pAtk", "pDef", "mAtk", "mDef", "spd"].forEach(k => {
                chara.battleBuffs[k] = (chara.battleBuffs[k] || 1) * (1 + skill.permanentGrowth);
            });
        }
        if (skill.resetHate && target.type === 'player') target.data.currentHate = 0;

        // 【追加】真・残像の追撃発動チェック（味方がマークされた敵を攻撃した場合）
        if (target.data.markedBy && target.data.markedBy.type === actor.type && target.data.markedBy !== actor) {
            const shader = target.data.markedBy;
            const echoResult = this.executeFollowUp(shader, skill, allUnits, 1.0); // 100%発動
            if (echoResult.log) log += ` [残像追撃] ${echoResult.log}`;
        }
        else {
            const followUp = this.executeFollowUp(actor, skill, allUnits);
            if (followUp.log) log += " " + followUp.log;
        }


        return { log };
    }

    selectTarget(actor, skill, allUnits) {
        if (skill.type === "heal") {
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
            const enemyTargets = allUnits.filter(u =>
                u.type !== actor.type &&
                (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
            );
            if (enemyTargets.length === 0) return null;
            if (actor.type === 'enemy') {
                return enemyTargets.reduce((prev, curr) => {
                    const hPrev = (prev.data.currentHate || 0);
                    const hCurr = (curr.data.currentHate || 0);
                    return hCurr > hPrev ? curr : prev;
                });
            }
            return enemyTargets[0];
        }
    }

    executeFollowUp(actor, skill, allUnits, currentChance = null) {
        // 確率の計算: 初回は doubleChance * chainDouble、以降は前回の確率 * chainDouble
        let chance;
        if (currentChance === null) {
            chance = (skill.doubleChance || 0)
        } else {
            chance = currentChance * (skill.chainDouble || 0);
        }

        if (Math.random() >= chance) {

            return { log: "" };
        }

        const chara = actor.data;
        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };

        const baseStats = actor.type === 'player' ? chara.stats : chara;
        const buffs = chara.battleBuffs || { pAtk: 1, pDef: 1, mAtk: 1, mDef: 1, spd: 1 };
        const dBase = target.type === 'player' ? target.data.stats : target.data;
        const targetMaxHp = target.type === 'player' ? target.data.currentMaxHp : (target.data.maxHp || target.data.hp);

        const aStats = {
            pAtk: baseStats.pAtk * (buffs.pAtk || 1),
            mAtk: baseStats.mAtk * (buffs.mAtk || 1)
        };

        let currentLog = "";
        let powerMult = skill.power || 1.0;

        if (skill.type === "heal") {
            // 回復スキルの追撃処理
            let healAmt = Math.floor(aStats.mAtk * powerMult);
            dBase.hp = Math.min(targetMaxHp, dBase.hp + healAmt);
            currentLog = `[追撃] ${target.data.name}のHPが ${healAmt} 回復！`;
        } else {
            // 攻撃スキルの追撃処理
            const dBuffs = target.data.battleBuffs || { pDef: 1, mDef: 1 };
            const dStats = {
                pDef: dBase.pDef * (dBuffs.pDef || 1),
                mDef: dBase.mDef * (dBuffs.mDef || 1)
            };

            let dmg = (skill.type === "physical")
                ? (aStats.pAtk * powerMult / Math.max(1, dStats.pDef))
                : (aStats.mAtk * powerMult / Math.max(1, dStats.mDef));

            dmg = Math.max(1, Math.floor(dmg));
            dBase.hp -= dmg;
            currentLog = `[追撃] ${target.data.name}に ${dmg} ダメージ！`;

            if (dBase.hp <= 0) {
                dBase.hp = 0;
                currentLog += ` ${target.data.name}は倒れた！`;
            }
        }
        console.log(currentLog)

        // chainDoubleが存在する場合、次回の判定へ
        if (skill.chainDouble) {
            const next = this.executeFollowUp(actor, skill, allUnits, chance);
            if (next.log) currentLog += " " + next.log;
        }
        return { log: currentLog };
    }

    getEnemySkillData(sInfo) {
        const base = MASTER_DATA.SKILLS[sInfo.id] || MASTER_DATA.SKILLS.attack;
        const level = sInfo.level || 1;
        let effective = {
            ...base,
            power: (base.power || 1.0) + (base.growth?.power || 0) * (level - 1),
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

    checkSkillCondition(actor, condition, allUnits) {
        const chara = actor.data;
        const isPlayer = actor.type === 'player';
        const stats = isPlayer ? chara.stats : chara;
        const maxHp = isPlayer ? chara.currentMaxHp : (chara.maxHp || chara.hp);
        const hpRate = stats.hp / maxHp;

        switch (condition) {
            case 'hp_low': return hpRate <= 0.5;
            case 'hp_high': return hpRate > 0.5;
            case 'enemy_many':
                return allUnits.filter(u => u.type !== actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)).length >= 3;
            case 'ally_dead':
                return allUnits.filter(u => u.type === actor.type && (u.type === 'player' ? u.data.stats.hp <= 0 : u.data.hp <= 0)).length > 0;
            case 'always': return true;
            default: return true;
        }
    }
}
class BattleSystem {
    constructor() {
        this.maxCt = 100;
        this.baseHate = 10;
    }

    simulate(party, enemies) {
        let logs = [];
        let isBattleEnd = false;
        let winner = null;

        party.forEach(p => p.currentHate = 0);
        enemies.forEach(e => e.currentHate = 0);

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

        // 共通のスキルリスト取得
        const skillList = isPlayer ? chara.skills : (chara.skills || []);

        // 使用可能なスキルの選定
        for (let i = skillList.length - 1; i >= 0; i--) {
            const sInfo = skillList[i];
            const sData = isPlayer ? chara.getSkillEffectiveData(sInfo) : this.getEnemySkillData(sInfo);

            const isAvailable = (sInfo.currentCoolDown || 0) <= 0;
            const isConditionMet = this.checkSkillCondition(actor, sInfo.condition || 'always', allUnits);

            if (isAvailable && isConditionMet) {
                selectedSkillId = sInfo.id;
                sInfoRef = sInfo;
                sInfo.currentCoolDown = sData.coolTime || 0;
                break;
            }
        }

        // 行動ごとに全スキルのクールダウンを1減らす
        skillList.forEach(s => {
            if (s.currentCoolDown > 0) s.currentCoolDown--;
        });

        // 最終的なスキルデータの確定
        const skill = isPlayer
            ? chara.getSkillEffectiveData(sInfoRef || { id: selectedSkillId })
            : this.getEnemySkillData(sInfoRef || { id: selectedSkillId });

        // ターゲット選定
        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };

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
                const rawDmg = aStats.pAtk * skill.power;
                dmg = rawDmg / Math.max(1, dStats.pDef);
            } else if (skill.type === "magical") {
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

        if (isPlayer) {
            const finalHateGain = Math.floor((skill.hate || 10) * (skill.hateMod || 1.0));
            chara.currentHate = (chara.currentHate || 0) + finalHateGain;
        }

        // 相手のヘイトを減少させる効果（挑発解除スキルなど）
        if (skill.hateReduce > 0 && target.type === 'player') {
            target.data.currentHate = Math.max(0, (target.data.currentHate || 0) - skill.hateReduce);
            logs.push(`${targetName}のヘイトが減少した。`);
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
            logs.push(`${attackerName}は自身のHPを${meditationHeal}回復。`);
        }

        // --- 4. 追撃（再発動）の処理 ---
        if (skill.doubleChance > 0 && Math.random() < skill.doubleChance) {
            logs.push(`>> 追撃発動！`);
            // 追撃時もターゲットを再選定（ヘイト基準）
            const followUpResult = this.executeFollowUp(actor, skill, allUnits);
            if (followUpResult.log) logs.push(followUpResult.log);
        }

        return { log: logs.join(" ") };
    }

    // ヘイトに基づいた重み付け抽選関数（BattleSystemクラス内に追加してください）
    selectTarget(actor, skill, allUnits) {
        let targets;
        if (skill.type === "heal") {
            // 回復：HP割合が最も低い味方を探す
            targets = allUnits.filter(u => u.type === actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
            if (targets.length === 0) return null;

            return targets.reduce((prev, curr) => {
                const getHpRate = (u) => {
                    const s = u.type === 'player' ? u.data.stats : u.data;
                    const m = u.type === 'player' ? u.data.currentMaxHp : (u.data.maxHp || u.data.hp);
                    return s.hp / m;
                };
                return getHpRate(curr) < getHpRate(prev) ? curr : prev;
            });
        } else {
            // 攻撃：敵対勢力を取得
            targets = allUnits.filter(u => u.type !== actor.type && (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0));
            if (targets.length === 0) return null;

            // 敵がプレイヤーを狙う場合のみヘイト抽選、それ以外（プレイヤーが敵を狙う等）はランダム
            if (actor.type === 'enemy') {
                return this.selectTargetByHate(targets);
            }
            return targets[Math.floor(Math.random() * targets.length)];
        }
    }

    // 敵のスキル情報をレベル・かけら込みの実行データに変換
    getEnemySkillData(sInfo) {
        const base = MASTER_DATA.SKILLS[sInfo.id] || MASTER_DATA.SKILLS.attack;
        const level = sInfo.level || 1;
        const fragments = sInfo.fragments || [];
        const growth = base.growth || {};

        // 1. 基本性能にレベル成長を適用
        // growth: { power: 0.2, coolTime: -0.1 } のような設定を想定
        let effective = {
            ...base,
            power: base.power + (growth.power || 0) * (level - 1),
            coolTime: Math.max(0, (base.coolTime || 0) + (growth.coolTime || 0) * (level - 1)),
            level: level
        };

        // 2. 輝きのかけらの効果を反映（最大9つ）
        fragments.slice(0, 9).forEach(fragId => {
            const fData = MASTER_DATA.FRAGMENTS[fragId];
            if (!fData) return;

            // 各種ステータス補正の合算
            if (fData.powerMod) effective.power += fData.powerMod;
            if (fData.coolTimeMod) effective.coolTime = Math.max(0, effective.coolTime + fData.coolTimeMod);
            if (fData.doubleChance) effective.doubleChance = (effective.doubleChance || 0) + fData.doubleChance;
            if (fData.selfDamage) effective.selfDamage = (effective.selfDamage || 0) + fData.selfDamage;
            if (fData.lifeSteal) effective.lifeSteal = (effective.lifeSteal || 0) + fData.lifeSteal;
            if (fData.healSelf) effective.healSelf = true; // 瞑想効果の付与
        });

        return effective;
    }

    // 追撃専用の軽量メソッド（CT消費などを行わない）
    executeFollowUp(actor, skill, allUnits) {
        const isPlayer = actor.type === 'player';
        const chara = actor.data;

        // ターゲット再選定（前のターゲットが死んでいる可能性があるため）
        const target = this.selectTarget(actor, skill, allUnits);
        if (!target) return { log: "" };
        
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
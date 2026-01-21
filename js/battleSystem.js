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

        // 生存している敵対ターゲットを取得
        const targets = allUnits.filter(u =>
            (isPlayer ? u.type === 'enemy' : u.type === 'player') &&
            (u.type === 'player' ? u.data.stats.hp > 0 : u.data.hp > 0)
        );

        if (targets.length === 0) return { log: "" };

        // ターゲットをランダムに1体選択（スケーラビリティのため）
        const target = targets[Math.floor(Math.random() * targets.length)];

        const aStats = isPlayer ? actor.data.stats : actor.data;
        const dStats = isPlayer ? target.data : target.data.stats;

        // ダメージ計算
        const damage = Math.max(1, Math.floor(aStats.pAtk - (dStats.pDef / 2)));
        dStats.hp -= damage;

        return {
            log: `${isPlayer ? actor.data.name : actor.data.name}の攻撃！ ${isPlayer ? target.data.name : target.data.name}に ${damage} のダメージ`
        };
    }
}
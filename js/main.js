class GameController {
    constructor() {
        this.SAVE_KEY = 'new_mkrpg_save_data';
        this.loadGame(); // コンストラクタの最初で読み込み

        this.currentEnemies = []; // 配列に変更
        this.lastBattleTime = 0;
        this.battleInterval = 1000; // 1秒(1000ms)
        this.currentScene = 'title';
        this.currentMap = null;
        this.currentEnemy = null;
        this.selectedCharaId = null;

        this.skillManager = new SkillManager();
        this.battleSystem = new BattleSystem();
        this.gameLoop = this.gameLoop.bind(this);

        this.isPressing = false;
        this.canBattle = true;
        this.init();
    }

    saveGame() {
        const saveData = {
            party: this.party.map(c => ({ id: c.id, name: c.name, data: c.serialize() })),
            inventory: this.skillManager.inventory // インベントリを保存対象に追加
        };
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    }

    loadGame() {
        const rawData = localStorage.getItem(this.SAVE_KEY);
        if (rawData) {
            const parsed = JSON.parse(rawData);
            this.party = parsed.party.map(p => new Character(p.id, p.name, p.data));
            this.skillManager = new SkillManager(parsed.inventory); // 在庫を復元
        } else {
            this.party = [new Character(1, "Hero")];
            this.skillManager = new SkillManager();
        }
    }

    init() {
        this.setupSceneEvents();
        this.setupBattleInputs();
        this.updatePartyUI();

        // ループを開始（一度だけ呼び出す）
        requestAnimationFrame(this.gameLoop);
    }

    setupSceneEvents() {
        const btnGo = document.getElementById('btn-go-adventure');
        if (btnGo) {
            btnGo.onclick = () => this.changeScene('map-select');
        }

        const btnEquip = document.getElementById('btn-go-equip'); // HTMLに追加が必要
        if (btnEquip) {
            btnEquip.onclick = () => this.changeScene('equip');
        }

        document.querySelectorAll('.btn-back').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                this.changeScene('title');
            };
        });

        const mapList = document.getElementById('map-list');
        if (mapList) {
            mapList.innerHTML = ''; // リストを一旦空にする
            MASTER_DATA.MAPS.forEach(map => {
                const btn = document.createElement('button');
                btn.innerText = map.name;
                btn.onclick = () => this.startBattle(map);
                mapList.appendChild(btn);
            });
        }
    }

    setupBattleInputs() {
        const attackBtn = document.getElementById('btn-attack-hold');
        if (!attackBtn) return;

        // 単押しクリックの対応
        attackBtn.addEventListener('click', () => {
            if (this.currentScene === 'battle') {
                this.runBattle();
            }
        });

        // 長押し対応（マウス）
        attackBtn.addEventListener('mousedown', () => { this.isPressing = true; });
        window.addEventListener('mouseup', () => { this.isPressing = false; });

        // タッチ
        attackBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isPressing = true;
        });
        window.addEventListener('touchend', () => { this.isPressing = false; });
    }

    changeScene(sceneId) {
        this.currentScene = sceneId;
        document.getElementById('scene-title').classList.toggle('hidden', sceneId !== 'title');
        document.getElementById('scene-map-select').classList.toggle('hidden', sceneId !== 'map-select');
        document.getElementById('scene-battle').classList.toggle('hidden', sceneId !== 'battle');
        document.getElementById('scene-equip').classList.toggle('hidden', sceneId !== 'equip');

        if (sceneId === 'equip') {
            this.renderEquipScene();
        } else {
            this.updatePartyUI();
        }
    }

    renderEquipScene() {
        const partyList = document.getElementById('equip-party-list');
        const invList = document.getElementById('equip-inventory-list');
        if (!partyList || !invList) return;

        // 左側：キャラクター選択と装備スロット
        partyList.innerHTML = '<h3>キャラクター選択</h3>';
        this.party.forEach(chara => {
            const div = document.createElement('div');
            div.className = `equip-chara-card ${this.selectedCharaId === chara.id ? 'selected' : ''}`;

            let skillSlots = '';
            if (Array.isArray(chara.skills)) {
                chara.skills.forEach((sInfo, index) => {
                    const sId = typeof sInfo === 'string' ? sInfo : sInfo.id;
                    const sData = MASTER_DATA.SKILLS[sId];
                    if (!sData) return;

                    const isAttack = sId === 'attack';
                    const currentCond = sInfo.condition || 'always';

                    let options = MASTER_DATA.SKILL_CONDITIONS.map(cond =>
                        `<option value="${cond.id}" ${currentCond === cond.id ? 'selected' : ''}>${cond.name}</option>`
                    ).join('');

                    skillSlots += `
                    <div class="skill-slot-item" style="border-bottom:1px solid #444; margin-bottom:5px; padding:5px;">
                        <span>${sData.name}</span>
                        <select onchange="gameApp.changeSkillCondition(${chara.id}, ${index}, this.value)" style="margin-left:5px;">${options}</select>
                        ${!isAttack ? `<button onclick="gameApp.unequipSkill(${chara.id}, ${index})" style="margin-left:5px;">外す</button>` : '<small> (固定)</small>'}
                    </div>`;
                });
            }

            div.innerHTML = `<div><strong>${chara.name}</strong></div>${skillSlots}`;
            div.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
                this.selectedCharaId = chara.id;
                this.renderEquipScene();
            };
            partyList.appendChild(div);
        });

        // 右側：在庫表示
        invList.innerHTML = '<h3>所持スキル（クリックで装備）</h3>';
        for (const [sId, count] of Object.entries(this.skillManager.inventory)) {
            if (sId === 'attack' || count <= 0) continue;
            const skillData = MASTER_DATA.SKILLS[sId];

            const btn = document.createElement('button');
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.margin = '5px 0';
            btn.style.padding = '10px';
            btn.innerText = `${skillData.name} (在庫:${count}個)`;

            btn.onclick = () => this.equipSkill(sId);
            invList.appendChild(btn);
        }
    }

    // 足りなかったメソッドを補完
    equipSkill(skillId) {
        if (!this.selectedCharaId) return alert('キャラクターを左側から選択してください');
        const chara = this.party.find(c => c.id === this.selectedCharaId);

        // 最大スロット数を3（通常攻撃+自由枠2）に制限
        if (chara.skills.length >= 3) return alert('スキル枠がいっぱいです。何かを外してください。');

        if (this.skillManager.consume(skillId)) {
            chara.skills.push({
                id: skillId,
                currentCoolDown: 0,
                condition: 'always'
            });
            this.saveGame();
            this.renderEquipScene();
        }
    }

    unequipSkill(charaId, slotIndex) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        const skillObj = chara.skills[slotIndex];

        if (skillObj.id === 'attack') return; // 通常攻撃は外せない

        this.skillManager.refund(skillObj.id);
        chara.skills.splice(slotIndex, 1);
        this.saveGame();
        this.renderEquipScene();
    }

    changeSkillCondition(charaId, skillIndex, newCondition) {
        const chara = this.party.find(c => c.id === charaId);
        if (chara) {
            chara.skills[skillIndex].condition = newCondition;
            this.saveGame();
        }
    }

    // main.js の updatePartyUI 内のループ箇所を修正
    updatePartyUI() {
        const partyArea = document.getElementById('party-area');
        if (!partyArea) return;
        partyArea.innerHTML = '<h2>Party Status</h2>';

        this.party.forEach(chara => {
            const data = chara.getDisplayData();
            const charaDiv = document.createElement('div');
            charaDiv.className = 'chara-status-card';

            // 表示用のパーセント計算（内部数値が100を超えていても、表示は100%で止める）
            const expPercent = Math.min(100, (data.exp / data.maxExp) * 100);

            charaDiv.innerHTML = `
            <div class="chara-header">
                <strong>${data.name}</strong> (Lv.${data.level} / 転生:${data.reincarnation})
            </div>
            <div class="chara-exp">
                EXP: ${Math.floor(data.exp)} / ${data.maxExp}
                <div class="exp-bar-bg"><div class="exp-bar-fill" style="width: ${expPercent}%"></div></div>
            </div>
            <div class="chara-stats">
                HP: ${data.hp} / ${data.maxHp} | SPD: ${data.spd}<br>
                物攻: ${data.pAtk} | 物防: ${data.pDef}<br>
                魔攻: ${data.mAtk} | 魔防: ${data.mDef}
            </div>
        `;

            if (data.level >= 100 && this.currentScene === 'title') {
                const btn = document.createElement('button');
                btn.className = 'reincarnate-btn';
                btn.innerText = '転生する';
                btn.onclick = () => this.executeReincarnation(chara.id);
                charaDiv.appendChild(btn);
            }

            partyArea.appendChild(charaDiv);
        });

        this.updateInventoryUI();
    }

    // 転生実行用メソッドを GameController に追加
    executeReincarnation(charaId) {
        // 型の違いを考慮して == で比較するか、確実に型を合わせる
        const chara = this.party.find(c => String(c.id) === String(charaId));

        if (!chara) {
            console.error("転生対象のキャラクターが見つかりません ID:", charaId);
            return;
        }

        if (typeof chara.reincarnate !== 'function') {
            console.error("reincarnate メソッドが存在しません。インスタンス化に失敗しています。");
            return;
        }

        if (confirm(`${chara.name}を転生させますか？（レベルが1に戻り、ボーナスを得ます）`)) {
            chara.reincarnate();
            console.log("転生処理実行完了:", chara);
            this.saveGame();
            this.updatePartyUI();
        }
    }

    setupInputs() {
        // Mouse, Touch, Keyboard の各イベントをリスン
        window.addEventListener('mousedown', () => this.isPressing = true);
        window.addEventListener('mouseup', () => this.isPressing = false);
        // キーボード（Space等）も同様
    }

    generateRandomEnemy() {
        const encounters = this.currentMap.encounters;
        const enemyGroupIds = encounters[Math.floor(Math.random() * encounters.length)];

        // 敵データを作成（個別にHPを管理するためコピーを作成）
        this.currentEnemies = enemyGroupIds.map(id => {
            const data = MASTER_DATA.ENEMIES[id];
            return { ...data, currentHp: data.hp }; // 敵側のHPプロパティ名はbattleSystemに合わせる
        });

        const names = this.currentEnemies.map(e => e.name).join(", ");
        document.getElementById('enemy-display').innerText = `${names} が現れた！`;
    }

    gameLoop(timeStamp) {
        if (this.isPressing && this.currentScene === 'battle') {
            const elapsed = timeStamp - this.lastBattleTime;

            if (elapsed >= this.battleInterval) {
                this.runBattle();
                this.lastBattleTime = timeStamp;
            }
        } else {
            // 指を離している間は即座に反応できるようタイマーをリセット
            this.lastBattleTime = timeStamp - this.battleInterval;
        }

        requestAnimationFrame(this.gameLoop);
    }

    startBattle(map) {
        this.currentMap = map;
        this.changeScene('battle');
        this.generateRandomEnemy();
    }

    generateRandomEnemy() {
        // 安全のためのチェック
        if (!this.currentMap || !this.currentMap.encounters) {
            console.error("マップデータまたは出現テーブルが見つかりません");
            return;
        }

        const encounters = this.currentMap.encounters;
        const enemyGroupIds = encounters[Math.floor(Math.random() * encounters.length)];

        // 敵データを作成
        this.currentEnemies = enemyGroupIds.map(id => {
            const data = MASTER_DATA.ENEMIES[id];
            if (!data) {
                console.error(`敵データ ID: ${id} が見つかりません`);
                return null;
            }
            return { ...data, hp: data.hp }; // 敵のHP初期化
        }).filter(e => e !== null); // 見つからなかった敵を除外

        if (this.currentEnemies.length > 0) {
            const names = this.currentEnemies.map(e => e.name).join(", ");
            document.getElementById('enemy-display').innerText = `${names} が現れた！`;
        }
    }

    updateInventoryUI() {
        const invList = document.getElementById('skill-inventory-list');
        if (!invList) return;
        invList.innerHTML = '';

        for (const [id, count] of Object.entries(this.skillManager.inventory)) {
            if (id === 'attack') continue; // 通常攻撃は表示しない
            const skillName = MASTER_DATA.SKILLS[id].name;
            const div = document.createElement('div');
            div.innerText = `${skillName}: ${count}個`;
            invList.appendChild(div);
        }
    }

    // updatePartyUI の最後や changeScene('title') 内で呼び出す

    // 長押し中の処理
    runBattle() {
        // 1. 敵がいない、または全滅している場合は「その場」で新しく生成
        if (this.currentEnemies.length === 0 || this.currentEnemies.every(e => e.hp <= 0)) {
            this.generateRandomEnemy();
            // ここで return せず、そのまま下の戦闘計算へ進む
        }

        // 2. パーティの状態を整える
        this.party.forEach(chara => chara.fullHeal());

        // 3. ログエリアの初期化
        const logEl = document.getElementById('battle-log');
        logEl.innerHTML = '';

        // 4. 戦闘計算の実行
        // generateRandomEnemy直後であれば、最新の敵データに対してシミュレートが行われる
        const result = this.battleSystem.simulate(this.party, this.currentEnemies);

        // 5. ログの表示
        result.logs.forEach(msg => {
            const div = document.createElement('div');
            div.innerText = msg;
            logEl.appendChild(div);
        });
        logEl.scrollTop = logEl.scrollHeight;

        // 6. 戦闘結果の反映
        if (result.winner === 'player') {
            this.party.forEach(chara => chara.gainExp(result.exp));

            // ドロップ判定
            this.currentEnemies.forEach(enemy => {
                if (enemy.drop && Math.random() < enemy.drop.rate) {
                    const skillId = enemy.drop.id;
                    this.skillManager.addSkill(skillId);
                    const skillName = MASTER_DATA.SKILLS[skillId].name;
                    const dropDiv = document.createElement('div');
                    dropDiv.innerText = `宝箱から [${skillName}] を手に入れた！`;
                    dropDiv.style.color = "#ffff00";
                    document.getElementById('battle-log').appendChild(dropDiv);
                }
            });

            this.saveGame();
            this.currentEnemies = [];
        } else if (result.winner === 'enemy') {
            this.isPressing = false;
            const div = document.createElement('div');
            div.innerText = ">> 敗北しました。拠点に戻ってください。";
            logEl.appendChild(div);
            this.currentEnemies = [];
        }

        this.updatePartyUI();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameController();
});

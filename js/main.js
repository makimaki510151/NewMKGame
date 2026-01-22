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

        this.skillManager = new SkillManager();
        this.battleSystem = new BattleSystem();
        this.gameLoop = this.gameLoop.bind(this);

        this.isPressing = false;
        this.canBattle = true;
        this.init();
    }

    saveGame() {
        const saveData = {
            party: this.party.map(c => ({ id: c.id, name: c.name, data: c.serialize() }))
        };
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    }

    loadGame() {
        const rawData = localStorage.getItem(this.SAVE_KEY);
        if (rawData) {
            try {
                const parsed = JSON.parse(rawData);
                // 保存データを元に、Characterクラスのインスタンスとして作り直す
                this.party = parsed.party.map(p => new Character(p.id, p.name, p.data));
            } catch (e) {
                console.error("セーブデータの読み込みに失敗しました", e);
                this.party = [new Character(1, "Hero")];
            }
        } else {
            this.party = [new Character(1, "Hero")];
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
        // 画面の表示/非表示を切り替え
        document.getElementById('scene-title').classList.toggle('hidden', sceneId !== 'title');
        document.getElementById('scene-map-select').classList.toggle('hidden', sceneId !== 'map-select');
        document.getElementById('scene-battle').classList.toggle('hidden', sceneId !== 'battle');

        if (sceneId === 'title') {
            this.updatePartyUI();
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
            this.party.forEach(chara => {
                chara.gainExp(result.exp);
            });
            this.saveGame();
            // 敵をクリア（次のrunBattleの冒頭で新しく生成される）
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

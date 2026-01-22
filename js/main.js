class GameController {
    constructor() {
        this.SAVE_KEY = 'new_mkrpg_save_data';

        // 1. まず各マネージャーのインスタンスを作成（空の状態でよい）
        this.skillManager = new SkillManager();
        this.battleSystem = new BattleSystem();
        this.hasJoinedBonusChara = false;

        // 2. 次にデータをロード（ここで skillManager の中身が上書きされる）
        this.loadGame();

        this.currentEnemies = [];
        this.lastBattleTime = 0;
        this.battleInterval = 500;
        this.currentScene = 'title';
        this.currentMap = null;
        this.currentEnemy = null;
        this.selectedCharaId = null;

        this.gameLoop = this.gameLoop.bind(this);

        this.isPressing = false;
        this.canBattle = true;
        this.fragmentSortType = 'default';
        this.fragmentFilterEffect = 'all';

        this.init();
    }

    // GameController 内の loadGame メソッドを修正
    loadGame() {
        const json = localStorage.getItem(this.SAVE_KEY);
        if (!json) {
            this.party = [new Character('chara_1', '勇者')];
            // 新規開始時
            this.skillManager = new SkillManager();
            return;
        }
        const data = JSON.parse(json);
        this.party = data.party.map(p => new Character(p.id, p.name, p.data));

        // セーブデータから在庫とかけらを復元
        this.skillManager = new SkillManager(data.skillInventory, data.fragmentInventory);
        this.hasJoinedBonusChara = data.hasJoinedBonusChara || false;
    }

    // GameController 内の saveGame メソッドを修正
    saveGame() {
        const saveData = {
            party: this.party.map(c => ({ id: c.id, name: c.name, data: c.serialize() })),
            skillInventory: this.skillManager.inventory,
            fragmentInventory: this.skillManager.fragments, // かけらリストを保存対象に追加
            hasJoinedBonusChara: this.hasJoinedBonusChara
        };
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    }

    init() {
        this.setupSceneEvents();
        this.setupBattleInputs();
        this.updatePartyUI();
        document.getElementById('btn-change-name').addEventListener('click', () => {
            this.openNameChangeDialog();
        });

        // ループを開始（一度だけ呼び出す）
        requestAnimationFrame(this.gameLoop);
    }

    generateFragment() {
        const effects = ["power_up", "ct_down", "multi_target", "life_steal", "debuff_spd", "double_cast", "heal_self", "berserk", "heavy", "resonate", "lucky"];
        const fragment = {
            id: Date.now(),
            name: "輝きのかけら",
            stats: []
        };

        // 1〜3つの効果をランダムに付与
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
            const effect = effects[Math.floor(Math.random() * effects.length)];
            fragment.stats.push(effect);
        }
        return fragment;
    }

    sortFragments() {
        if (this.fragmentSortType === 'name') {
            this.skillManager.fragments.sort((a, b) => {
                const nameA = a.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e].name).join("");
                const nameB = b.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e].name).join("");
                return nameA.localeCompare(nameB, 'ja');
            });
        }
        this.renderEquipScene();
    }

    openNameChangeDialog() {
        // 変更したいキャラクターを選択（複数学命いる場合を想定）
        const charas = this.party.map((c, i) => `${i + 1}: ${c.name}`).join('\n');
        const choice = prompt(`名前を変えるキャラの番号を入力してください：\n${charas}`);

        if (choice === null) return; // キャンセル

        const index = parseInt(choice) - 1;
        if (this.party[index]) {
            const chara = this.party[index];
            const newName = prompt(`「${chara.name}」の新しい名前を入力してください（最大10文字）`, chara.name);

            if (newName && newName.trim().length > 0) {
                chara.name = newName.trim().substring(0, 10);
                this.updatePartyUI(); // UI更新
                this.saveGame();      // セーブ
                alert(`名前を「${chara.name}」に変更しました。`);
            }
        } else {
            alert("無効な番号です。");
        }
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

        partyList.innerHTML = '<h3>キャラクター選択</h3>';
        this.party.forEach(chara => {
            const div = document.createElement('div');
            div.className = `equip-chara-card ${this.selectedCharaId === chara.id ? 'selected' : ''}`;

            let skillSlotsHtml = '';
            if (Array.isArray(chara.skills)) {
                chara.skills.forEach((sInfo, sIndex) => {
                    const sData = chara.getSkillEffectiveData(sInfo);
                    const isAttack = sInfo.id === 'attack';
                    const currentCond = sInfo.condition || 'always';

                    const displayPower = (Math.floor(sData.power * 10) / 10).toFixed(1);

                    let options = MASTER_DATA.SKILL_CONDITIONS.map(cond =>
                        `<option value="${cond.id}" ${currentCond === cond.id ? 'selected' : ''}>${cond.name}</option>`
                    ).join('');

                    // かけらスロットの生成（IDを引用符で囲む修正）
                    let fragmentSlotsHtml = '<div class="skill-slot-container" style="display:flex; gap:5px; margin-top:5px;">';
                    if (!sInfo.slots) sInfo.slots = [null, null, null];

                    sInfo.slots.forEach((frag, slotIdx) => {
                        const filledClass = frag ? 'filled' : '';
                        const label = frag ? '★' : '+';
                        const title = frag ? frag.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e].name).join("/") + "\n(クリックで外す)" : "空きスロット";

                        // onclick 処理を分岐：中身があれば detach、なければ picker を表示
                        const clickAction = frag
                            ? `gameApp.detachFragment('${chara.id}', ${sIndex}, ${slotIdx})`
                            : `gameApp.showFragmentPicker('${chara.id}', ${sIndex}, ${slotIdx})`;

                        fragmentSlotsHtml += `
                            <div class="fragment-slot ${filledClass}" 
                                 style="width:20px; height:20px; border:1px dashed #666; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; background:${frag ? '#fff9c4' : '#fff'};"
                                 title="${title}"
                                 onclick="event.stopPropagation(); ${clickAction}">
                                ${label}
                            </div>`;
                    });
                    fragmentSlotsHtml += '</div>';

                    skillSlotsHtml += `
                        <div class="skill-slot-item" style="border-bottom:1px solid #444; margin-bottom:5px; padding:5px; font-size:0.85em;">
                            <strong>${sData.name}</strong> (威力:${displayPower})<br>
                            <select onchange="gameApp.changeSkillCondition('${chara.id}', ${sIndex}, this.value)">${options}</select>
                            ${!isAttack ? `<button onclick="gameApp.unequipSkill('${chara.id}', ${sIndex})">外す</button>` : '<small> (固定)</small>'}
                            ${fragmentSlotsHtml}
                        </div>`;
                });
            }

            div.innerHTML = `<div><strong>${chara.name}</strong></div>${skillSlotsHtml}`;
            div.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.classList.contains('fragment-slot')) return;
                this.selectedCharaId = chara.id;
                this.renderEquipScene();
            };
            partyList.appendChild(div);
        });

        // 右側：所持スキルと合成
        invList.innerHTML = '<h3>所持スキル・合成</h3>';
        for (const [sId, levels] of Object.entries(this.skillManager.inventory)) {
            if (sId === 'attack') continue;
            for (const [level, count] of Object.entries(levels)) {
                if (count <= 0) continue;
                const lvlInt = parseInt(level);
                const sData = this.party[0].getSkillEffectiveData({ id: sId, level: lvlInt });
                const displayPower = (Math.floor(sData.power * 10) / 10).toFixed(1);
                const displayCT = (Math.floor(sData.coolTime * 10) / 10).toFixed(1);

                const itemDiv = document.createElement('div');
                itemDiv.style = "border-bottom:1px solid #eee; padding:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.9em;";
                itemDiv.innerHTML = `
                    <div>
                        <strong>${sData.name}</strong> (在庫:${count})<br>
                        <small>威力:${displayPower} / CT:${displayCT}</small>
                    </div>
                    <div>
                        <button onclick="gameApp.equipSkill('${sId}', ${lvlInt})">装備</button>
                        ${count >= 2 ? `<button onclick="gameApp.combineSkill('${sId}', ${lvlInt})" style="background:#eef;">合成</button>` : ''}
                    </div>
                `;
                invList.appendChild(itemDiv);
            }
        }

        if (this.skillManager.fragments) {
            const fragContainer = document.createElement('div');
            fragContainer.style.marginTop = "20px";

            // ヘッダーとフィルターUI
            const filterHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ccc; padding-bottom:5px;">
            <h4 style="margin:0;">所持中のかけら</h4>
            <div style="display:flex; gap:5px;">
                <select id="frag-filter-select" onchange="gameApp.fragmentFilterEffect = this.value; gameApp.renderEquipScene();" style="font-size:0.7em;">
                    <option value="all">すべて表示</option>
                    ${Object.entries(MASTER_DATA.FRAGMENT_EFFECTS).map(([id, info]) =>
                `<option value="${id}" ${this.fragmentFilterEffect === id ? 'selected' : ''}>${info.name}</option>`
            ).join('')}
                </select>
                <button onclick="gameApp.fragmentSortType = 'name'; gameApp.sortFragments();" style="font-size:0.7em;">ソート</button>
            </div>
        </div>
    `;
            fragContainer.innerHTML = filterHtml;
            invList.appendChild(fragContainer);

            // フィルタリング処理
            let displayFrags = this.skillManager.fragments;
            if (this.fragmentFilterEffect !== 'all') {
                displayFrags = displayFrags.filter(f => f.effects.includes(this.fragmentFilterEffect));
            }

            if (displayFrags.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.innerText = "該当するかけらはありません";
                emptyMsg.style = "font-size:0.8em; color:#999; padding:10px;";
                invList.appendChild(emptyMsg);
            } else {
                // renderEquipScene 内の displayFrags.forEach 部分
                displayFrags.forEach(frag => {
                    const fDiv = document.createElement('div');
                    fDiv.style = "border-bottom:1px solid #eee; padding:8px; font-size:0.8em; background:#f9f9f9; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;";

                    // 効果説明のテキスト
                    const effectDetails = frag.effects.map(e => {
                        const info = MASTER_DATA.FRAGMENT_EFFECTS[e];
                        const isMatch = e === this.fragmentFilterEffect;
                        return `<span style="color:${isMatch ? '#007bff' : '#d32f2f'}; font-weight:bold;">【${info.name}】</span>${info.desc}`;
                    }).join("<br>");

                    // 左側：テキスト情報
                    const infoDiv = document.createElement('div');
                    infoDiv.innerHTML = `輝きのかけら ${frag.isLocked ? '🔒' : ''}<br>${effectDetails}`;

                    // 右側：操作ボタン
                    const btnDiv = document.createElement('div');
                    btnDiv.style = "display:flex; flex-direction:column; gap:2px;";

                    // ロックボタン
                    const lockBtn = document.createElement('button');
                    lockBtn.innerText = frag.isLocked ? "解除" : "ロック";
                    lockBtn.style.fontSize = "0.8em";
                    lockBtn.onclick = () => this.toggleFragmentLock(frag.uniqueId);

                    // 削除ボタン
                    const delBtn = document.createElement('button');
                    delBtn.innerText = "削除";
                    delBtn.style.fontSize = "0.8em";
                    delBtn.style.backgroundColor = frag.isLocked ? "#ccc" : "#ffcccc";
                    delBtn.disabled = frag.isLocked;
                    delBtn.onclick = () => this.deleteFragment(frag.uniqueId);

                    btnDiv.appendChild(lockBtn);
                    btnDiv.appendChild(delBtn);

                    fDiv.appendChild(infoDiv);
                    fDiv.appendChild(btnDiv);
                    invList.appendChild(fDiv);
                });
            }
        }
    }

    // かけらのロック状態を切り替える
    toggleFragmentLock(uniqueId) {
        const frag = this.skillManager.fragments.find(f => f.uniqueId === uniqueId);
        if (frag) {
            frag.isLocked = !frag.isLocked;
            this.saveGame();
            this.renderEquipScene();
        }
    }

    // かけらを削除する（確認ダイアログを廃止）
    deleteFragment(uniqueId) {
        const index = this.skillManager.fragments.findIndex(f => f.uniqueId === uniqueId);
        if (index === -1) return;

        const frag = this.skillManager.fragments[index];

        // ロックされている場合は何もしない（アラートも出さないことで連続操作を妨げない）
        if (frag.isLocked) return;

        // 即座に削除を実行
        this.skillManager.fragments.splice(index, 1);
        this.saveGame();
        this.renderEquipScene();
    }

    combineSkill(skillId, level) {
        // SkillManager側の合成処理を呼び出し
        if (this.skillManager.combineSkill(skillId, level)) {
            const sData = MASTER_DATA.SKILLS[skillId];
            this.saveGame();
            this.renderEquipScene();
        }
    }

    detachFragment(charaId, sIndex, slotIdx) {
        const chara = this.party.find(c => c.id === charaId);
        if (!chara || !chara.skills[sIndex]) return;

        const skill = chara.skills[sIndex];
        const fragment = skill.slots[slotIdx];

        if (fragment) {
            // インベントリに戻す
            this.skillManager.fragments.push(fragment);
            // スロットを空にする
            skill.slots[slotIdx] = null;

            this.saveGame();
            this.renderEquipScene();
        }
    }

    // かけら選択用ポップアップ
    showFragmentPicker(charaId, sIdx, slotIdx) {
        let frags = this.skillManager.fragments;

        // 現在のフィルターを適用
        if (this.fragmentFilterEffect !== 'all') {
            frags = frags.filter(f => f.effects.includes(this.fragmentFilterEffect));
        }

        if (frags.length === 0) {
            alert("条件に合う「輝きのかけら」を持っていません。フィルターを解除してください。");
            return;
        }

        const fragList = frags.map((f, idx) => {
            const details = f.effects.map(e => {
                const info = MASTER_DATA.FRAGMENT_EFFECTS[e];
                return `${info.name}(${info.desc})`;
            }).join(" / ");
            return `${idx}: ${details}`;
        }).join("\n");

        const filterNote = this.fragmentFilterEffect !== 'all' ? `（現在「${MASTER_DATA.FRAGMENT_EFFECTS[this.fragmentFilterEffect].name}」で絞り込み中）\n` : "";
        const input = prompt(`${filterNote}装着する番号を入力してください:\n${fragList}`);

        if (input !== null && input !== "" && frags[input]) {
            this.attachFragment(charaId, sIdx, slotIdx, frags[input].uniqueId);
        }
    }

    attachFragment(charaId, sIdx, slotIdx, fragUniqueId) {
        const chara = this.party.find(c => c.id === charaId);
        const skill = chara.skills[sIdx];

        // 現在のスロットにあるものを回収
        if (skill.slots[slotIdx]) {
            this.skillManager.fragments.push(skill.slots[slotIdx]);
        }

        // 新しいものを装着
        const fIdx = this.skillManager.fragments.findIndex(f => f.uniqueId === fragUniqueId);
        const fragment = this.skillManager.fragments.splice(fIdx, 1)[0];
        skill.slots[slotIdx] = fragment;

        this.saveGame();
        this.renderEquipScene();
    }

    // 足りなかったメソッドを補完
    equipSkill(skillId, level = 0) {
        if (!this.selectedCharaId) return alert('キャラクターを選択してください');
        const chara = this.party.find(c => c.id === this.selectedCharaId);

        // 上限チェックを削除
        if (this.skillManager.consume(skillId, level)) {
            chara.skills.push({
                id: skillId,
                level: parseInt(level),
                currentCoolDown: 0,
                condition: 'always'
            });
            this.saveGame();
            this.renderEquipScene();
        }
    }

    // スキル自体を外す処理（既存の関数を修正）
    unequipSkill(charaId, skillIndex) {
        const chara = this.party.find(c => c.id === charaId);
        if (!chara) return;

        const skill = chara.skills[skillIndex];

        // 輝きのかけらが装着されていたら、インベントリに戻す
        if (skill.slots && Array.isArray(skill.slots)) {
            skill.slots.forEach((fragment, slotIdx) => {
                if (fragment) {
                    this.skillManager.fragments.push(fragment);
                    skill.slots[slotIdx] = null; // スロットを空にする
                }
            });
        }

        // スキル本体を戻す
        this.skillManager.addSkill(skill.id, skill.level || 0);
        chara.skills.splice(skillIndex, 1);

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

    checkLevelEvents() {
        // パーティにLv10以上のキャラがいて、まだボーナスキャラが加入していない場合
        if (!this.hasJoinedBonusChara && this.party.some(c => c.level >= 10)) {
            this.addNewAlly();
        }
    }

    addNewAlly() {
        const newId = Date.now(); // 重複しないIDを生成
        const newChara = new Character(newId, "Mage"); // 新しい仲間
        this.party.push(newChara);
        this.hasJoinedBonusChara = true;

        // 通知演出
        this.showNotification("新たな仲間「Mage」がパーティに加わりました！");
        this.saveGame();
        this.updatePartyUI();
    }

    showNotification(message) {
        // バトルログがある場合はそこに出し、なければアラート
        const logEl = document.getElementById('battle-log');
        if (logEl) {
            const div = document.createElement('div');
            div.style.color = "#00ffff";
            div.style.fontWeight = "bold";
            div.style.border = "1px solid #00ffff";
            div.style.padding = "5px";
            div.style.margin = "10px 0";
            div.innerText = `【EVENT】${message}`;
            logEl.appendChild(div);
            logEl.scrollTop = logEl.scrollHeight;
        } else {
            alert(message);
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
        this.party.forEach(chara => {
            chara.fullHeal();        // HP全快
            chara.resetCoolDowns();  // クールタイム全解消（追加）
        });

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

            if (Math.random() < MASTER_DATA.FRAGMENT_DROP_CHANCE) {
                const frag = this.skillManager.dropFragment();
                const fragNames = frag.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e].name).join(", ");
                const dropDiv = document.createElement('div');
                dropDiv.innerText = `★輝きのかけら入手！ [${fragNames}]`;
                dropDiv.style.color = "#00ffff";
                document.getElementById('battle-log').appendChild(dropDiv);
            }

            this.checkLevelEvents();

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

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
        this.fragmentSortType = 'newest'; // 'default' から 'newest' に変更、または追記
        this.fragmentFilterEffect = 'all';

        this.init();
    }

    async setupDiscord() {
        try {
            this.discord = await initDiscord();
            if (this.discord) {
                console.log("Discord連携完了");
            }
        } catch (e) {
            console.error("Discord SDKの初期化に失敗:", e);
        }
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

        const sortSelect = document.getElementById('sort-fragments');
        if (sortSelect) {
            sortSelect.onchange = (e) => {
                this.fragmentSortType = e.target.value;
                this.renderEquipScene(); // 画面を再描画
            };
        }

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

        // clickイベントによる即時実行を廃止し、gameLoopに統合
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

        // --- 1. 描画前に現在のスクロール位置を保存 ---
        const scrollBoxOld = invList.querySelector('.fragment-scroll-container');
        const savedScrollTop = scrollBoxOld ? scrollBoxOld.scrollTop : 0;

        partyList.innerHTML = '<h3>キャラクター選択</h3>';
        this.party.forEach(chara => {
            const isSelected = String(this.selectedCharaId) === String(chara.id);
            const div = document.createElement('div');
            div.className = `equip-chara-card ${isSelected ? 'selected' : ''}`;

            let skillSlotsHtml = '';
            if (Array.isArray(chara.skills)) {
                chara.skills.forEach((sInfo, sIndex) => {
                    const sData = chara.getSkillEffectiveData(sInfo);
                    const isAttack = sInfo.id === 'attack';
                    const currentCond = sInfo.condition || 'always';
                    const displayPower = (Math.floor(sData.power * 10) / 10).toFixed(1);
                    const displayCT = (Math.floor(sData.coolTime * 10) / 10).toFixed(1);

                    let options = MASTER_DATA.SKILL_CONDITIONS.map(cond =>
                        `<option value="${cond.id}" ${currentCond === cond.id ? 'selected' : ''}>${cond.name}</option>`
                    ).join('');

                    let fragmentSlotsHtml = '<div class="skill-slot-container" style="display:flex; gap:5px; margin-top:5px;">';
                    // スロット配列がない場合の初期化
                    if (!sInfo.slots) sInfo.slots = [null, null, null];

                    sInfo.slots.forEach((slotValue, slotIdx) => {
                        // slotValue が オブジェクト(実体) か ID かを判定して取得
                        let fragment = null;
                        if (slotValue && typeof slotValue === 'object' && slotValue.uniqueId) {
                            // すでにオブジェクトとして入っている場合
                            fragment = slotValue;
                        } else if (slotValue) {
                            // IDだけが入っている場合、管理リストから実体を探す
                            fragment = this.skillManager.fragments.find(f => String(f.uniqueId) === String(slotValue));
                        }

                        const filledClass = fragment ? 'filled' : '';
                        const label = fragment ? '★' : '+'; // 装備されていれば★、空なら＋

                        // 表示用のテキスト（マウスオーバー時など）
                        const title = fragment
                            ? fragment.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e]?.name || "不明").join("/") + "\n(クリックで外す)"
                            : "空きスロット";

                        // 背景色などのスタイル（装備済みなら黄色、空なら白）
                        const slotBg = fragment ? '#ffed4a' : '#fff';

                        const clickAction = fragment
                            ? `gameApp.detachFragment('${chara.id}', ${sIndex}, ${slotIdx})`
                            : `gameApp.showFragmentPicker('${chara.id}', ${sIndex}, ${slotIdx})`;

                        fragmentSlotsHtml += `
    <div class="fragment-slot ${filledClass}" 
         style="width:20px; height:20px; border:1px dashed #666; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; background:${slotBg}; color:#000;"
         title="${title}"
         onclick="event.stopPropagation(); ${clickAction}">
        ${label}
    </div>`;
                    });
                    fragmentSlotsHtml += '</div>';

                    skillSlotsHtml += `
                <div class="skill-slot-item" style="border-bottom:1px solid #444; margin-bottom:5px; padding:5px; font-size:0.85em;">
                    <strong>${sData.name}</strong> (威力:${displayPower} / CT:${displayCT})<br>
                    <select onchange="gameApp.changeSkillCondition('${chara.id}', ${sIndex}, this.value)">${options}</select>
                    ${!isAttack ? `<button onclick="gameApp.unequipSkill('${chara.id}', ${sIndex})">外す</button>` : '<small> (固定)</small>'}
                    ${fragmentSlotsHtml}
                </div>`;
                });
            }

            div.innerHTML = `<div><strong>${isSelected ? '▶ ' : ''}${chara.name}</strong></div>${skillSlotsHtml}`;
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
                // パーティの誰が参照しても基本データは同じなので[0]を使用
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

        // --- 2. 所持中のかけらリストの描画 ---
        if (this.skillManager.fragments) {
            const fragSection = document.createElement('div');
            fragSection.style.marginTop = "20px";

            // フィルタとソートのUI
            const filterHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ccc; padding-bottom:5px;">
                <h4 style="margin:0;">所持中のかけら</h4>
                <div style="display:flex; gap:5px;">
                    <select id="frag-filter-select" style="font-size:0.7em; color:#000;">
                        <option value="all" ${this.fragmentFilterEffect === 'all' ? 'selected' : ''}>すべて表示</option>
                        ${Object.entries(MASTER_DATA.FRAGMENT_EFFECTS).map(([id, info]) =>
                `<option value="${id}" ${this.fragmentFilterEffect === id ? 'selected' : ''}>${info.name}</option>`
            ).join('')}
                    </select>
                    <select id="frag-sort-select" style="font-size:0.7em; color:#000;">
                        <option value="newest" ${this.fragmentSortType === 'newest' ? 'selected' : ''}>新しい順</option>
                        <option value="effect_count_desc" ${this.fragmentSortType === 'effect_count_desc' ? 'selected' : ''}>効果数：多</option>
                        <option value="effect_count_asc" ${this.fragmentSortType === 'effect_count_asc' ? 'selected' : ''}>効果数：少</option>
                    </select>
                </div>
            </div>
            `;
            fragSection.innerHTML = filterHtml;

            const scrollBox = document.createElement('div');
            scrollBox.className = "fragment-scroll-container";
            scrollBox.style.height = "300px";
            scrollBox.style.overflowY = "auto";
            scrollBox.style.border = "1px solid #eee";
            scrollBox.style.background = "#fff";

            // --- データのフィルタリングとソート ---
            let displayFrags = [...this.skillManager.fragments];

            // フィルタ
            if (this.fragmentFilterEffect !== 'all') {
                displayFrags = displayFrags.filter(f => f.effects.includes(this.fragmentFilterEffect));
            }

            // ソート
            if (this.fragmentSortType === 'effect_count_desc') {
                displayFrags.sort((a, b) => b.effects.length - a.effects.length);
            } else if (this.fragmentSortType === 'effect_count_asc') {
                displayFrags.sort((a, b) => a.effects.length - b.effects.length);
            } else if (this.fragmentSortType === 'newest') {
                displayFrags.sort((a, b) => b.uniqueId - a.uniqueId);
            }

            if (displayFrags.length === 0) {
                scrollBox.innerHTML = `<div style="font-size:0.8em; color:#999; padding:10px;">該当するかけらはありません</div>`;
            } else {
                displayFrags.forEach(frag => {
                    const fDiv = document.createElement('div');
                    fDiv.style = "border-bottom:1px solid #eee; padding:8px; font-size:0.8em; background:#f9f9f9; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; color:#000;";

                    const effectDetails = frag.effects.map(e => {
                        const info = MASTER_DATA.FRAGMENT_EFFECTS[e];
                        const isMatch = e === this.fragmentFilterEffect;
                        return `<span style="color:${isMatch ? '#007bff' : '#d32f2f'}; font-weight:bold;">【${info.name}】</span>${info.desc}`;
                    }).join("<br>");

                    const infoDiv = document.createElement('div');
                    infoDiv.innerHTML = `輝きのかけら ${frag.isLocked ? '🔒' : ''}<br>${effectDetails}`;

                    const btnDiv = document.createElement('div');
                    btnDiv.style = "display:flex; flex-direction:column; gap:2px;";

                    const lockBtn = document.createElement('button');
                    lockBtn.innerText = frag.isLocked ? "解除" : "ロック";
                    lockBtn.style.fontSize = "0.8em";
                    lockBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleFragmentLock(frag.uniqueId); // toggleFragmentLockを実装してください
                    };

                    const delBtn = document.createElement('button');
                    delBtn.innerText = "削除";
                    delBtn.style.fontSize = "0.8em";
                    delBtn.style.backgroundColor = frag.isLocked ? "#ccc" : "#ffcccc";
                    delBtn.disabled = frag.isLocked;
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.deleteFragment(frag.uniqueId); // deleteFragmentを実装してください
                    };

                    btnDiv.appendChild(lockBtn);
                    btnDiv.appendChild(delBtn);
                    fDiv.appendChild(infoDiv);
                    fDiv.appendChild(btnDiv);
                    scrollBox.appendChild(fDiv);
                });
            }
            fragSection.appendChild(scrollBox);
            invList.appendChild(fragSection);

            // イベントリスナーの設定（再描画のためにthisを使用）
            fragSection.querySelector('#frag-filter-select').onchange = (e) => {
                this.fragmentFilterEffect = e.target.value;
                this.renderEquipScene();
            };
            fragSection.querySelector('#frag-sort-select').onchange = (e) => {
                this.fragmentSortType = e.target.value;
                this.renderEquipScene();
            };

            // スクロール位置の復元
            scrollBox.scrollTop = savedScrollTop;
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

    detachFragment(charaId, sIdx, slotIdx) {
        // 1. 型不一致を防ぐため String に変換して対象キャラを特定
        const chara = this.party.find(c => String(c.id) === String(charaId));

        if (!chara || !chara.skills || !chara.skills[sIdx]) {
            console.error("対象のキャラクターまたはスキルが見つかりません");
            return;
        }

        const skill = chara.skills[sIdx];
        if (!skill.slots) return;

        // 2. 指定されたスロットにかけらがあるか確認
        const fragment = skill.slots[slotIdx];

        if (fragment) {
            // オブジェクトとしてインベントリに戻す
            this.skillManager.fragments.push(fragment);
            // スロットを空にする
            skill.slots[slotIdx] = null;
        }

        // 3. 表示を更新するために選択中のキャラIDを同期
        this.selectedCharaId = chara.id;

        // 4. 保存して再描画
        this.saveGame();
        this.renderEquipScene();
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
        // 1. 型不一致を防ぐため String に変換して検索
        const chara = this.party.find(c => String(c.id) === String(charaId));

        if (!chara || !chara.skills || !chara.skills[sIdx]) {
            console.error("対象のキャラクターまたはスキルが見つかりません");
            return;
        }

        const skill = chara.skills[sIdx];
        if (!skill.slots) skill.slots = [null, null, null];

        // 2. 現在のスロットにあるものをインベントリに回収
        if (skill.slots[slotIdx]) {
            this.skillManager.fragments.push(skill.slots[slotIdx]);
        }

        // 3. インベントリから新しいかけらを探して装着
        const fIdx = this.skillManager.fragments.findIndex(f => String(f.uniqueId) === String(fragUniqueId));

        if (fIdx !== -1) {
            const fragment = this.skillManager.fragments.splice(fIdx, 1)[0];
            skill.slots[slotIdx] = fragment;
        } else {
            console.error("インベントリに対象のかけらが見つかりません");
        }

        // 4. 重要：現在操作したキャラを選択状態にして、確実にそのキャラの表示を更新させる
        this.selectedCharaId = chara.id;

        // 5. データを保存して画面をフルリフレッシュ
        this.saveGame();
        this.renderEquipScene();
    }

    // 足りなかったメソッドを補完
    equipSkill(skillId, level = 0) {
        if (!this.selectedCharaId) return alert('キャラクターを選択してください');
        const chara = this.party.find(c => String(c.id) === String(this.selectedCharaId)); // ID比較を安全に

        if (this.skillManager.consume(skillId, level)) {
            chara.skills.push({
                id: skillId,
                level: parseInt(level),
                currentCoolDown: 0,
                condition: 'always',
                slots: [null, null, null] // ★ここを追加：空のスロットを初期化
            });
            this.saveGame();
            this.renderEquipScene();
        }
    }

    // スキル自体を外す処理（既存の関数を修正）
    unequipSkill(charaId, skillIndex) {
        // String() で囲むことで数値IDと文字列IDの不一致を防ぐ
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara) return;

        const skill = chara.skills[skillIndex];
        if (skill.slots) {
            skill.slots.forEach((fragment, idx) => {
                if (fragment) {
                    this.skillManager.fragments.push(fragment);
                    skill.slots[idx] = null;
                }
            });
        }

        this.skillManager.addSkill(skill.id, skill.level || 0);
        chara.skills.splice(skillIndex, 1);

        this.saveGame();
        this.renderEquipScene();
    }

    changeSkillCondition(charaId, skillIndex, newCondition) {
        const chara = this.party.find(c => charaId === c.id);
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
        // マップに入った時点で一戦実行
        this.runBattle();
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
            chara.fullHeal();

            // クールタイムを解消（0にする）のではなく、スキルの最大CTをセットするように変更
            if (chara.skills) {
                chara.skills.forEach(sInfo => {
                    // 通常攻撃(attack)以外は、開始時にCTを最大値にする
                    if (sInfo.id !== 'attack') {
                        const sData = chara.getSkillEffectiveData(sInfo);
                        sInfo.currentCoolDown = sData.coolTime;
                    } else {
                        sInfo.currentCoolDown = 0;
                    }
                });
            }
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
                // 従来の enemy.drop ではなく enemy.drops をループする
                if (enemy.drops && Array.isArray(enemy.drops)) {
                    enemy.drops.forEach(dropItem => {
                        if (Math.random() < dropItem.rate) {
                            const skillId = dropItem.id;
                            this.skillManager.addSkill(skillId);
                            const skillName = MASTER_DATA.SKILLS[skillId].name;
                            const dropDiv = document.createElement('div');
                            dropDiv.innerText = `宝箱から [${skillName}] を手に入れた！`;
                            dropDiv.style.color = "#ffff00";
                            document.getElementById('battle-log').appendChild(dropDiv);
                        }
                    });
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
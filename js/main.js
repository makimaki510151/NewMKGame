const SUPABASE_URL = 'https://aajqzjuxmtjqwprfikti.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n4twHmtalxsk_7j2j2tnTg_GgVMGIKT';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class GameController {
    constructor() {
        this.SAVE_KEY = 'new_mkrpg_save_data';
        this.currentUser = null;
        this.usedCodes = [];

        // 1. まず各マネージャーのインスタンスを作成（空の状態でよい）
        this.skillManager = new SkillManager();
        this.battleSystem = new BattleSystem();
        this.hasJoinedBonusChara = false;
        this.hasJoinedKnightChara = false;

        this.initAuthListener();

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
        this.fragmentFilterLocked = false;
        this.selectedFragmentIds = [];

        this.init();
    }

    initAuthListener() {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.currentUser = session.user;
                this.syncCloudData(); // ログインしたらクラウドと同期
            } else {
                this.currentUser = null;
            }
        });
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
        this.party = data.party.map(p => new Character(p.id, p.name, p));

        // セーブデータから在庫とかけらを復元
        this.skillManager = new SkillManager(data.inventory, data.fragments, data.crystals);
        this.hasJoinedBonusChara = data.hasJoinedBonusChara || false;
        this.hasJoinedKnightChara = data.hasJoinedKnightChara || false;
        this.usedCodes = data.usedCodes || [];
    }

    // GameController 内の saveGame メソッドを修正
    async saveGame() {
        // 1. 保存用データの構築
        const saveData = {
            party: this.party,
            inventory: this.skillManager.inventory,
            fragments: this.skillManager.fragments,
            crystals: this.skillManager.crystals,
            hasJoinedBonusChara: this.hasJoinedBonusChara,
            hasJoinedKnightChara: this.hasJoinedKnightChara,
            usedCodes: this.usedCodes
        };

        // 2. ローカルストレージ（保険として残す）
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));

        // 3. ログイン中ならSupabaseへアップロード
        if (this.currentUser) {
            try {
                await supabaseClient
                    .from('player_saves')
                    .upsert({
                        id: this.currentUser.id,
                        save_data: saveData,
                        updated_at: new Date()
                    });
            } catch (e) {
                console.error("クラウド保存失敗:", e);
            }
        }
    }

    openSecretCodeDialog() {
        const code = prompt("秘密の合言葉を入力してください");
        if (!code) return;

        if (this.usedCodes.includes(code)) {
            alert("その合言葉はすでに使用されています。");
            return;
        }

        const reward = MASTER_DATA.SECRET_CODES[code];
        if (reward) {
            this.applySecretReward(reward, code);
        } else {
            alert("合言葉が正しくありません。");
        }
    }

    applySecretReward(reward, code) {
        // ステージ以外は即座に使用済みフラグを立てる
        if (reward.type !== 'stage') {
            this.usedCodes.push(code);
        }

        switch (reward.type) {
            case 'skill':
                this.skillManager.addSkill(reward.skillId, reward.level, 1);
                alert(reward.message);
                break;
            case 'fragment':
                const frag = {
                    uniqueId: Date.now(),
                    effects: reward.effects,
                    isLocked: false
                };
                this.skillManager.fragments.push(frag);
                alert(reward.message);
                break;
            case 'stage':
                // ステージの場合は、戦闘開始直前に使用済みにする
                if (confirm(reward.message + "\n挑戦しますか？（一度拠点に戻ると消滅します）")) {
                    this.usedCodes.push(code);
                    this.saveGame();
                    const mapData = MASTER_DATA.SECRET_MAPS[reward.mapId];
                    this.startBattle(mapData);
                }
                return; // stageの場合は下でsaveGameを呼ぶのでreturn
        }
        this.saveGame();
    }

    async syncCloudData() {
        if (!this.currentUser) return;

        const { data, error } = await supabaseClient
            .from('player_saves')
            .select('save_data')
            .single();

        if (data && data.save_data) {
            const cloudData = data.save_data;

            if (cloudData.party) {
                this.party = cloudData.party.map(d => new Character(d.id, d.name, d));
            }
            if (cloudData.inventory) {
                this.skillManager.inventory = cloudData.inventory;
            }
            if (cloudData.fragments) {
                this.skillManager.fragments = cloudData.fragments;
            }
            if (cloudData.crystals) {
                this.skillManager.crystals = cloudData.crystals;
            }
            this.hasJoinedBonusChara = cloudData.hasJoinedBonusChara || false;
            this.hasJoinedKnightChara = cloudData.hasJoinedKnightChara || false;
            this.updatePartyUI();
            console.log("クラウドからデータを復元しました");

            // データ読み込み完了後、タイトル画面へ戻す
            this.changeScene('title');
        } else {
            console.log("新規ユーザー：現在のデータをクラウドに同期します");
            await this.saveGame();

            // 初回保存完了後もタイトル画面へ戻す
            this.changeScene('title');
        }
    }

    async handleSignup() {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) {
            document.getElementById('auth-message').innerText = "登録失敗: " + error.message;
        } else {
            document.getElementById('auth-message').innerText = "登録完了。そのままログインしてください";
        }
    }

    async handleLogin() {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            document.getElementById('auth-message').innerText = "ログイン失敗: " + error.message;
        } else {
            // ここではメッセージを出すだけにするか、何もしない（syncCloudDataで画面が変わるため）
            document.getElementById('auth-message').innerText = "ログイン中...";
        }
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

        // 全体的な制御として document または特定のコンテナに追加
        document.addEventListener('mousemove', (e) => {
            const tooltips = document.querySelectorAll('.tooltip:hover .tooltip-text');
            tooltips.forEach(tooltip => {
                // マウス位置から少しずらして表示（指やカーソルに被らないように）
                const offsetX = 15;
                const offsetY = -15;

                // 画面の端でツールチップが切れないための簡易計算
                let x = e.clientX + offsetX;
                let y = e.clientY + offsetY;

                // ツールチップの底辺をマウスに合わせる指示なので、
                // Y座標をツールの高さ分マイナス方向に調整
                tooltip.style.left = x + 'px';
                tooltip.style.top = (y - tooltip.offsetHeight) + 'px';
            });
        });

        // init() メソッド内に追加
        document.getElementById('btn-do-signup').addEventListener('click', () => this.handleSignup());
        document.getElementById('btn-do-login').addEventListener('click', () => this.handleLogin());
        document.getElementById('btn-auth-back').addEventListener('click', () => this.changeScene('title'));

        // 拠点画面に「ログイン/同期」ボタンを追加する場合（任意）
        const loginBtn = document.createElement('button');
        loginBtn.innerText = "クラウド同期";
        loginBtn.className = "menu-button";

        // ここを修正：function(){} ではなく () => {} にする
        loginBtn.onclick = () => this.changeScene('auth');

        document.querySelector('#scene-title .main-menu').appendChild(loginBtn);

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

        const btnSecret = document.getElementById('btn-secret-code');
        if (btnSecret) {
            btnSecret.onclick = () => this.openSecretCodeDialog();
        }

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

        // ログイン画面の切り替えを追加
        const authScene = document.getElementById('scene-auth');
        if (authScene) {
            authScene.classList.toggle('hidden', sceneId !== 'auth');
        }

        if (sceneId === 'equip') {
            this.renderEquipScene();
            this.updatePartyUI();
        } else {
            this.updatePartyUI();
        }
    }

    // メインの描画メソッド
    renderEquipScene() {
        const partyList = document.getElementById('equip-party-list');
        const invList = document.getElementById('equip-inventory-list');
        const fragList = document.getElementById('equip-fragment-list');
        const crystalList = document.getElementById('equip-crystal-list');
        if (!partyList || !invList || !fragList) return;

        // スクロール位置の保存（かけらリスト用）
        const scrollBoxOld = fragList.querySelector('.fragment-scroll-container');
        const savedScrollTop = scrollBoxOld ? scrollBoxOld.scrollTop : 0;

        // 各セクションの描画
        this.renderEquipPartyList(partyList);
        this.renderEquipInventory(invList); // 引数からスクロール位置を削除
        this.renderFragmentList(fragList, savedScrollTop); // かけらリストを独立して描画
        this.renderCrystalList(crystalList);
    }

    // 左側：キャラクターと装備スキルの描画
    renderEquipPartyList(container) {
        container.innerHTML = '<h3>キャラクター選択</h3>';
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

                    const currentPriority = sInfo.priority !== undefined ? sInfo.priority : 5;

                    const displayPower = (Math.floor(sData.power * 10) / 10).toFixed(1);
                    const displayCT = (Math.floor(sData.coolTime * 10) / 10).toFixed(1);
                    const displayHate = sData.hate || MASTER_DATA.SKILLS[sInfo.id]?.hate || 10;

                    let options = MASTER_DATA.SKILL_CONDITIONS.map(cond =>
                        `<option value="${cond.id}" ${currentCond === cond.id ? 'selected' : ''}>${cond.name}</option>`
                    ).join('');

                    let priorityOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(p =>
                        `<option value="${p}" ${currentPriority == p ? 'selected' : ''}>${p}${p == 1 ? "優" : p == 9 ? "後" : ""}</option>`
                    ).join('');

                    // --- かけらスロットの生成 ---
                    let fragmentSlotsHtml = '<div class="skill-slot-wrapper" style="display:flex; align-items:center; gap:10px; margin-top:5px;">';
                    fragmentSlotsHtml += '<div class="fragment-slots-group" style="display:flex; gap:5px;">';

                    if (!sInfo.slots) sInfo.slots = [null, null, null];
                    sInfo.slots.forEach((slotValue, slotIdx) => {
                        const fragment = slotValue;
                        const isSlotSelected = this.selectedSlot &&
                            String(this.selectedSlot.charaId) === String(chara.id) &&
                            this.selectedSlot.skillIndex === sIndex &&
                            this.selectedSlot.slotIndex === slotIdx;

                        const filledClass = fragment ? 'filled' : '';
                        const label = fragment ? '★' : '+';
                        const slotBg = isSlotSelected ? '#4a9eff' : (fragment ? '#ffed4a' : '#fff');
                        const borderStyle = isSlotSelected ? '2px solid #fff' : '1px dashed #666';

                        let detailText = "空きスロット";
                        if (fragment && fragment.effects) {
                            detailText = fragment.effects.map(e => {
                                const info = MASTER_DATA.FRAGMENT_EFFECTS[e];
                                return `【${info.name}】${info.desc}`;
                            }).join('\n\n');
                        }

                        fragmentSlotsHtml += `
                        <div class="fragment-slot ${filledClass} tooltip" 
                                style="width:24px; height:24px; border:${borderStyle}; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; background:${slotBg}; color:#000; box-shadow:${isSlotSelected ? '0 0 8px #4a9eff' : 'none'};"
                                onclick="event.stopPropagation(); gameApp.selectFragmentSlot('${chara.id}', ${sIndex}, ${slotIdx})"
                                ondragover="event.preventDefault();"
                                ondrop="event.preventDefault(); gameApp.handleDropFragment(event, '${chara.id}', ${sIndex}, ${slotIdx})">
                            ${label}
                            <span class="tooltip-text">${detailText}<br>(クリックで選択/外す)</span>
                        </div>`;
                    });
                    fragmentSlotsHtml += '</div>'; // group end

                    // --- 結晶スロットの生成 (ここを追加) ---
                    const crystal = sInfo.crystalSlot; // スキルに紐付いた結晶データ
                    const isCrystalSelected = this.selectedCrystalSlot &&
                        String(this.selectedCrystalSlot.charaId) === String(chara.id) &&
                        this.selectedCrystalSlot.skillIndex === sIndex;

                    const crystalLabel = crystal ? '◆' : '◇';
                    const crystalBg = isCrystalSelected ? '#4a9eff' : (crystal ? '#b366ff' : '#333');
                    const crystalBorder = isCrystalSelected ? '2px solid #fff' : '2px solid #b366ff';

                    let crystalDetail = "結晶スロット (未装備)";
                    if (crystal) {
                        const cInfo = MASTER_DATA.CRYSTALS[crystal.baseEffectId];
                        crystalDetail = `【${cInfo.name}】\n${cInfo.desc}`;
                    }

                    fragmentSlotsHtml += `
                    <div style="border-left: 1px solid #555; height: 20px; margin: 0 5px;"></div>
                    <div class="crystal-slot tooltip" 
                         style="width:28px; height:28px; border:${crystalBorder}; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px; background:${crystalBg}; color:#fff; border-radius:4px;"
                         onclick="event.stopPropagation(); ${crystal ? `gameApp.unequipCrystal('${chara.id}', ${sIndex})` : `gameApp.selectCrystalSlot('${chara.id}', ${sIndex})`}">
                        ${crystalLabel}
                        <span class="tooltip-text">${crystalDetail}<br>(クリックで結晶を装備/外す)</span>
                    </div>`;

                    fragmentSlotsHtml += '</div>'; // wrapper end

                    skillSlotsHtml += `
                    <div class="skill-slot-item" style="border-bottom:1px solid #444; margin-bottom:5px; padding:5px; font-size:0.85em;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <strong>${sData.name}</strong> 
                            <span style="font-size:0.9em;">(威力:${displayPower} / CT:${displayCT} / <span style="color:#ffcc00;">ヘイト:${displayHate}</span>)</span>
                        </div>
                                
                        <div style="display:flex; gap:5px; align-items:center; margin-bottom:5px;">
                            <select style="background:#333; color:#fff; border:1px solid #666; font-size:0.8em;" 
                                    onchange="gameApp.changeSkillPriority('${chara.id}', ${sIndex}, this.value)">
                                ${priorityOptions}
                            </select>
                                
                            <select onchange="gameApp.changeSkillCondition('${chara.id}', ${sIndex}, this.value)">${options}</select>
                                
                            ${!isAttack ? `<button onclick="gameApp.unequipSkill('${chara.id}', ${sIndex})">外す</button>` : '<small> (固定)</small>'}
                        </div>
                        ${fragmentSlotsHtml}
                    </div>`;
                });
            }

            div.innerHTML = `<div><strong>${isSelected ? '▶ ' : ''}${chara.name}</strong></div>${skillSlotsHtml}`;
            div.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.closest('.fragment-slot') || e.target.closest('.crystal-slot')) return;
                this.selectedCharaId = chara.id;
                this.renderEquipScene();
            };
            container.appendChild(div);
        });
    }

    // 右側：インベントリ全体の描画
    renderEquipInventory(container) {
        const savedScrollTop = container.scrollTop;
        container.innerHTML = '<h3>所持スキル・合成</h3>';

        // 屑の表示
        const scrapDisplay = document.createElement('div');
        scrapDisplay.style = "background:#2a2a36; color:#fff; padding:10px; border-radius:8px; margin-bottom:10px; text-align:center; border:1px solid var(--accent);";
        scrapDisplay.innerHTML = `✨ かけらの屑: <strong>${this.skillManager.scrapCount}</strong>`;
        container.appendChild(scrapDisplay);

        // 一括合成ボタン
        const allCombineBtn = document.createElement('button');
        allCombineBtn.innerText = "すべてのスキルを一括合成";
        allCombineBtn.className = "menu-button";
        allCombineBtn.style = "width:100%; margin-bottom:10px; padding:10px; cursor:pointer;";
        allCombineBtn.onclick = () => this.combineAllSkills();
        container.appendChild(allCombineBtn);

        const scrollBox = document.createElement('div');
        scrollBox.className = "fragment-scroll-container";
        scrollBox.style = "height:400px; overflow-y:auto; border:1px solid #eee; background:#fff; border-radius:4px;";

        let hasSkill = false;
        for (const [sId, levels] of Object.entries(this.skillManager.inventory)) {
            if (sId === 'attack' || sId === 'scrap' || sId === 'count') continue;
            for (const [level, count] of Object.entries(levels)) {
                if (count <= 0) continue;
                hasSkill = true;
                const lvlInt = parseInt(level);
                // データの取得
                const sData = this.party[0].getSkillEffectiveData({ id: sId, level: lvlInt });

                // ヘイト値の取得（MASTER_DATAから参照）
                const hateVal = MASTER_DATA.SKILLS[sId]?.hate || 10;

                const itemDiv = document.createElement('div');
                itemDiv.style = "border-bottom:1px solid #eee; padding:8px; font-size:0.8em; background:#f9f9f9; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; color:#000;";

                itemDiv.innerHTML = `
            <div>
                <strong>${sData.name}</strong> (Lv.${lvlInt})<br>
                <small>威力:${(Math.floor(sData.power * 10) / 10).toFixed(1)} / CT:${(Math.floor(sData.coolTime * 10) / 10).toFixed(1)} / <span style="color:#d32f2f;">ヘイト:${hateVal}</span></small><br>
                <small style="color:#666;">所持数: ${count}</small>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; min-width:60px;">
                <button onclick="gameApp.equipSkill('${sId}', ${lvlInt})" style="font-size:0.8em; padding:4px;">装備</button>
                ${count >= 2 ? `<button onclick="gameApp.combineSkill('${sId}', ${lvlInt})" style="font-size:0.8em; padding:4px; background:#eef;">合成</button>` : ''}
            </div>`;
                scrollBox.appendChild(itemDiv);
            }
        }

        if (!hasSkill) {
            scrollBox.innerHTML = `<div style="font-size:0.8em; color:#999; padding:10px; text-align:center;">所持スキルはありません</div>`;
        }

        container.appendChild(scrollBox);
        requestAnimationFrame(() => {
            scrollBox.scrollTop = savedScrollTop;
        });
    }

    // かけらリスト部分の描画（フィルタ・ソート・ドラッグ元）
    renderFragmentList(container, savedScrollTop) {
        // コンテナをクリアして二重スクロールを防止
        container.innerHTML = '';

        const fragSection = document.createElement('div');
        fragSection.style.marginTop = "0px";

        // --- 1. 合成実行ボタンエリア ---
        const combineBtnText = `合成を実行 (${this.selectedFragmentIds.length}/3)`;
        const canCombine = this.selectedFragmentIds.length === 3;

        fragSection.innerHTML = `
    <div style="margin-bottom:10px;">
        <button id="btn-combine-selected" 
            style="width:100%; padding:12px; background:${canCombine ? '#ffed4a' : '#444'}; 
            color:${canCombine ? '#000' : '#888'}; font-weight:bold; border:none; border-radius:4px; cursor:pointer;"
            onclick="gameApp.combineSelectedFragments()">
            ${combineBtnText}
        </button>
    </div>
    `;

        // --- 2. フィルタ・ソートUI ---
        // 「トリプルのみ」のチェックボックスを追加
        fragSection.innerHTML += `
    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; border-bottom:2px solid #ccc; padding-bottom:5px; margin-bottom:5px;">
        <h4 style="margin:0;">所持中のかけら</h4>
        <div style="display:flex; gap:5px; align-items:center;">
            <label style="font-size:0.7em; color:#fff; cursor:pointer;">
                <input type="checkbox" id="frag-filter-triple" ${this.fragmentFilterTriple ? 'checked' : ''}> トリプルのみ
            </label>
            <label style="font-size:0.7em; color:#fff; cursor:pointer;">
                <input type="checkbox" id="frag-filter-locked" ${this.fragmentFilterLocked ? 'checked' : ''}> ロック中のみ
            </label>
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
    <div style="display:flex; gap:10px; margin-bottom:10px; padding:5px; background:rgba(255,255,255,0.1); border-radius:4px; align-items:center;">
        <span style="font-size:0.7em; color:#aaa;">一括処分:</span>
        <button id="btn-bulk-12" style="font-size:0.7em; background:#442222; color:#ffcccc; border:1px solid #663333; cursor:pointer; padding:2px 5px;">効果1〜2個</button>
        <button id="btn-bulk-unique3" style="font-size:0.7em; background:#442222; color:#ffcccc; border:1px solid #663333; cursor:pointer; padding:2px 5px;">効果3種バラバラ</button>
    </div>`;

        const scrollBox = document.createElement('div');
        scrollBox.className = "fragment-scroll-container";
        scrollBox.style = "height:400px; overflow-y:auto; border:1px solid #eee; background:#fff; border-radius:4px;";

        // --- 3. フィルタリングとソート ---
        const equippedIds = this.getAllEquippedFragmentIds();
        let displayFrags = [...this.skillManager.fragments];

        displayFrags = displayFrags.filter(f => !equippedIds.has(String(f.uniqueId)));

        // 新しく追加：トリプルフィルター
        if (this.fragmentFilterTriple) {
            displayFrags = displayFrags.filter(f => {
                const counts = {};
                for (const e of f.effects) counts[e] = (counts[e] || 0) + 1;
                return Object.values(counts).some(count => count >= 3);
            });
        }

        if (this.fragmentFilterLocked) displayFrags = displayFrags.filter(f => f.isLocked);
        if (this.fragmentFilterEffect !== 'all') displayFrags = displayFrags.filter(f => f.effects.includes(this.fragmentFilterEffect));

        if (this.fragmentSortType === 'effect_count_desc') displayFrags.sort((a, b) => b.effects.length - a.effects.length);
        else if (this.fragmentSortType === 'effect_count_asc') displayFrags.sort((a, b) => a.effects.length - b.effects.length);
        else if (this.fragmentSortType === 'newest') displayFrags.sort((a, b) => b.uniqueId - a.uniqueId);

        // --- 4. かけらリストの描画 ---
        if (displayFrags.length === 0) {
            scrollBox.innerHTML = `<div style="font-size:0.8em; color:#999; padding:10px; text-align:center;">該当するかけらはありません</div>`;
        } else {
            displayFrags.forEach(frag => {
                const isSelectedForCombine = this.selectedFragmentIds.includes(String(frag.uniqueId));
                const fDiv = document.createElement('div');
                fDiv.draggable = true;

                fDiv.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', frag.uniqueId);
                };

                fDiv.style = `
                border: ${isSelectedForCombine ? '3px solid #ffed4a' : '1px solid #eee'};
                background: ${isSelectedForCombine ? '#fff9e6' : '#f9f9f9'};
                padding: 8px; font-size: 0.8em; margin-bottom: 4px; display: flex; 
                justify-content: space-between; align-items: center; color: #000; cursor: pointer;
            `;

                fDiv.onclick = () => {
                    if (this.selectedSlot) {
                        this.attachFragmentToSelectedSlot(frag.uniqueId);
                    } else {
                        this.toggleFragmentSelection(String(frag.uniqueId));
                    }
                };

                const effectDetails = frag.effects.map(e => {
                    const info = MASTER_DATA.FRAGMENT_EFFECTS[e];
                    const isFiltered = this.fragmentFilterEffect === e;
                    const labelColor = isFiltered ? '#00b7ff' : '#d32f2f';
                    return `<span style="color:${labelColor}; font-weight:bold;">【${info.name}】</span>${info.desc}`;
                }).join("<br>");

                let actionButtons = `
                <button onclick="event.stopPropagation(); gameApp.openFragmentEnhanceModal(${JSON.stringify(frag).replace(/"/g, '&quot;')})" style="font-size:0.8em;">強化</button>
                <button onclick="event.stopPropagation(); gameApp.toggleFragmentLock('${frag.uniqueId}')" style="font-size:0.8em;">${frag.isLocked ? "解除" : "ロック"}</button>
            `;

                if (this.selectedSlot) {
                    actionButtons = `<button onclick="event.stopPropagation(); gameApp.attachFragmentToSelectedSlot('${frag.uniqueId}')" style="font-size:0.8em; background:#4a9eff; color:#fff; font-weight:bold;">はめる</button>` + actionButtons;
                } else {
                    actionButtons += `<button onclick="event.stopPropagation(); gameApp.deleteFragment('${frag.uniqueId}')" style="font-size:0.8em; background:${frag.isLocked ? '#ccc' : '#ffcccc'}; color:${frag.isLocked ? '#888' : '#000'};" ${frag.isLocked ? 'disabled' : ''}>削除</button>`;
                }

                fDiv.innerHTML = `
            <div style="flex:1;">
                <strong>輝きのかけら ${frag.isLocked ? '🔒' : ''}</strong><br>
                ${effectDetails}
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; min-width:60px;">
                ${actionButtons}
            </div>`;

                scrollBox.appendChild(fDiv);
            });
        }

        fragSection.appendChild(scrollBox);
        container.appendChild(fragSection);

        // --- 5. リスナー設定 ---
        // トリプルフィルターのリスナー追加
        const filterTriple = fragSection.querySelector('#frag-filter-triple');
        if (filterTriple) filterTriple.onchange = (e) => { this.fragmentFilterTriple = e.target.checked; this.renderEquipScene(); };

        const filterLocked = fragSection.querySelector('#frag-filter-locked');
        if (filterLocked) filterLocked.onchange = (e) => { this.fragmentFilterLocked = e.target.checked; this.renderEquipScene(); };

        const filterSelect = fragSection.querySelector('#frag-filter-select');
        if (filterSelect) filterSelect.onchange = (e) => { this.fragmentFilterEffect = e.target.value; this.renderEquipScene(); };

        const sortSelect = fragSection.querySelector('#frag-sort-select');
        if (sortSelect) sortSelect.onchange = (e) => { this.fragmentSortType = e.target.value; this.renderEquipScene(); };

        const bulk12 = fragSection.querySelector('#btn-bulk-12');
        if (bulk12) bulk12.onclick = () => {
            if (confirm('ロックされていない「効果数1〜2」のかけらをすべて処分しますか？')) {
                const count = this.skillManager.bulkDeleteFragments('count12');
                alert(`${count}個を処分しました。`);
                this.renderEquipScene();
                this.saveGame();
            }
        };

        const bulkUnique3 = fragSection.querySelector('#btn-bulk-unique3');
        if (bulkUnique3) bulkUnique3.onclick = () => {
            if (confirm('ロックされていない「効果3つがすべて異なる」かけらをすべて処分しますか？')) {
                const count = this.skillManager.bulkDeleteFragments('unique3');
                alert(`${count}個を処分しました。`);
                this.renderEquipScene();
                this.saveGame();
            }
        };

        requestAnimationFrame(() => {
            scrollBox.scrollTop = savedScrollTop;
        });
    }

    // 結晶リストの描画
    renderCrystalList(container) {
        container.innerHTML = '<h3>所持中の輝きの結晶</h3>';

        // 合成ボタンエリア（既存のUIマナーに合わせる）
        const actionArea = document.createElement('div');
        actionArea.style.marginBottom = "15px";
        container.appendChild(actionArea);

        // リストコンテナ（inventory-gridを使用）
        const scrollBox = document.createElement('div');
        scrollBox.className = "inventory-grid";

        if (!this.skillManager.crystals || this.skillManager.crystals.length === 0) {
            scrollBox.innerHTML = '<div style="color:var(--text-sub); font-size:0.9em; padding:10px;">所持している結晶はありません</div>';
        }

        this.skillManager.crystals.forEach(cry => {
            const info = MASTER_DATA.CRYSTALS[cry.baseEffectId];
            const div = document.createElement('div');
            div.className = "fragment-item tooltip crystal-item-card";

            div.innerHTML = `
            <div class="fragment-icon" style="color:#b366ff;">◆</div>
            <div class="fragment-info">
                <div class="fragment-name" style="color:#e0b3ff;">${info.name}</div>
                <div class="fragment-effects">${info.desc}</div>
            </div>
            <span class="tooltip-text">${info.desc}</span>
        `;

            div.onclick = () => this.handleCrystalClick(cry.uniqueId);
            scrollBox.appendChild(div);
        });

        container.appendChild(scrollBox);
    }

    changeSkillPriority(charaId, skillIndex, priorityValue) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (chara && chara.skills[skillIndex]) {
            // 数値として保存
            chara.skills[skillIndex].priority = parseInt(priorityValue);
            this.saveGame();
            // UIの再描画は不要（セレクトボックスの値は既に変わっているため）
        }
    }

    // 選択状態を切り替えるメソッド
    toggleFragmentSelection(uniqueId) {
        if (!this.selectedFragmentIds) this.selectedFragmentIds = [];

        const idStr = String(uniqueId);
        const index = this.selectedFragmentIds.indexOf(idStr);

        if (index > -1) {
            this.selectedFragmentIds.splice(index, 1);
        } else {
            if (this.selectedFragmentIds.length >= 3) return;
            this.selectedFragmentIds.push(idStr);
        }

        // 直接 renderFragmentList を呼ぶのではなく、
        // シーン全体の描画を呼ぶことでコンテナの未定義エラーを防ぎます
        this.renderEquipScene();
    }

    // 合成を実行するメソッド
    combineSelectedFragments() {
        if (!this.selectedFragmentIds || this.selectedFragmentIds.length !== 3) {
            alert("合成にはかけらが3つ必要です。");
            return;
        }

        const result = this.skillManager.combineSpecificFragments(this.selectedFragmentIds);
        if (result.success) {
            alert(result.crystalName + " が完成しました！");
            this.selectedFragmentIds = []; // 選択をリセット
            this.saveGame();
            this.renderEquipScene();
        } else {
            alert(result.message);
        }
    }

    selectCrystalSlot(charaId, skillIndex) {
        // 既に選択されていたら解除
        if (this.selectedCrystalSlot &&
            this.selectedCrystalSlot.charaId === charaId &&
            this.selectedCrystalSlot.skillIndex === skillIndex) {
            this.selectedCrystalSlot = null;
        } else {
            // スロットを選択状態にする（かけらの選択は解除）
            this.selectedCrystalSlot = { charaId, skillIndex };
            this.selectedSlot = null;
            this.selectedFragmentId = null;
            this.selectedCrystalId = null;
        }
        this.renderEquipScene();
    }

    // 結晶リスト内のアイテムをクリックした時
    handleCrystalClick(crystalUniqueId) {
        if (!this.selectedCrystalSlot) {
            alert("先にスキルの結晶枠（◆）を選択してください。");
            return;
        }

        const { charaId, skillIndex } = this.selectedCrystalSlot;
        const chara = this.party.find(c => String(c.id) === String(charaId));
        const skill = chara.skills[skillIndex];

        // 装備処理
        const cryIdx = this.skillManager.crystals.findIndex(c => c.uniqueId === crystalUniqueId);
        if (cryIdx !== -1) {
            // 既に装備があれば戻す
            if (skill.crystalSlot) {
                this.skillManager.crystals.push(skill.crystalSlot);
            }
            const crystal = this.skillManager.crystals.splice(cryIdx, 1)[0];
            skill.crystalSlot = crystal;

            // 装備完了したら選択を解除
            this.selectedCrystalSlot = null;
            this.renderEquipScene();
            this.saveGame();
        }
    }

    unequipCrystal(charaId, skillIndex) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara || !chara.skills[skillIndex]) return;

        const skillInfo = chara.skills[skillIndex];
        if (skillInfo.crystalSlot) {
            // スキルから結晶を取り出す
            const crystal = skillInfo.crystalSlot;
            skillInfo.crystalSlot = null;

            // インベントリ（skillManager）に結晶を戻す
            this.skillManager.crystals.push(crystal);

            alert("結晶を外しました。");
            this.renderEquipScene();
            this.saveGame();
        }
    }

    /**
 * 全キャラクターが装備中の全かけらuniqueIdをSetで返す
 */
    getAllEquippedFragmentIds() {
        const equippedIds = new Set();
        this.party.forEach(chara => {
            if (chara.skills) {
                chara.skills.forEach(skill => {
                    if (skill.slots) {
                        skill.slots.forEach(slotValue => {
                            if (slotValue) {
                                // uniqueIdがオブジェクトか文字列かに関わらず文字列で統一して保存
                                const uid = (typeof slotValue === 'object') ? slotValue.uniqueId : slotValue;
                                if (uid) equippedIds.add(String(uid));
                            }
                        });
                    }
                });
            }
        });
        return equippedIds;
    }

    openFragmentEnhanceModal(fragment) {
        const effectOptions = Object.entries(MASTER_DATA.FRAGMENT_EFFECTS).map(([id, info]) => {
            const cost = this.skillManager.calculateScrapCost(fragment, id);
            return `<option value="${id}">${info.name} (屑:${cost})</option>`;
        }).join('');

        const html = `
        <div id="enhance-modal" style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; color:#000; padding:20px; border:2px solid #444; z-index:2000; width:90%; max-width:400px; border-radius:12px;">
            <h4>かけらの強化</h4>
            <p style="font-size:0.8em;">付与したい効果を選択してください。<br>3つ以上の場合は上書きスロットを選んでください。</p>
            
            <label>付与する効果:</label><br>
            <select id="enhance-effect-id" style="width:100%; padding:5px; margin-bottom:15px;">${effectOptions}</select>
            
            <label>上書きスロット (3つある場合のみ):</label><br>
            <select id="enhance-replace-idx" style="width:100%; padding:5px; margin-bottom:15px;">
                <option value="0">スロット1</option>
                <option value="1">スロット2</option>
                <option value="2">スロット3</option>
            </select>

            <div style="display:flex; gap:10px;">
                <button id="btn-do-enhance" style="flex:1; padding:10px; background:#4caf50; color:white;">強化実行</button>
                <button id="btn-cancel-enhance" style="flex:1; padding:10px; background:#ccc;">キャンセル</button>
            </div>
        </div>
        <div id="enhance-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:1999;"></div>
    `;

        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('btn-cancel-enhance').onclick = () => {
            document.getElementById('enhance-modal').remove();
            document.getElementById('enhance-overlay').remove();
        };

        document.getElementById('btn-do-enhance').onclick = () => {
            const effectId = document.getElementById('enhance-effect-id').value;
            const replaceIdx = parseInt(document.getElementById('enhance-replace-idx').value);

            const result = this.skillManager.addEffectToFragment(fragment.uniqueId, effectId, replaceIdx);

            if (result.success) {
                alert(`強化完了！ 屑を ${result.cost} 消費しました。`);
                document.getElementById('enhance-modal').remove();
                document.getElementById('enhance-overlay').remove();
                this.saveGame();
                this.renderEquipScene();
            } else {
                alert(result.message);
            }
        };
    }

    handleDropFragment(e, charaId, skillIndex, slotIndex) {
        e.preventDefault();
        const fragmentUniqueId = e.dataTransfer.getData('text/plain');
        this.executeAttachFragment(charaId, skillIndex, slotIndex, fragmentUniqueId);
    }

    // かけらのロック状態を切り替える
    toggleFragmentLock(uniqueId) {
        const frag = this.skillManager.fragments.find(f => String(f.uniqueId) === String(uniqueId));
        if (frag) {
            frag.isLocked = !frag.isLocked;
            this.saveGame();
            this.renderEquipScene(); // これで画面が更新され、削除ボタンが disabled になります
        }
    }

    // かけらを削除する（確認ダイアログを廃止）
    deleteFragment(uniqueId) {
        // 1. マネージャー側の削除メソッドを呼ぶ
        const result = this.skillManager.deleteFragment(uniqueId);

        if (result.success) {
            // 2. セーブを実行（inventoryとfragmentsの両方が保存される）
            this.saveGame();

            // 3. UIを再描画
            this.renderEquipScene();

            // オプション：ログを表示する場合
            console.log(`かけらを分解しました。屑を ${result.gain} 個獲得しました。`);
        } else {
            alert("削除対象のかけらが見つかりませんでした。");
        }
    }

    combineSkill(skillId, level) {
        // SkillManager側の合成処理を呼び出し
        if (this.skillManager.combineSkill(skillId, level)) {
            const sData = MASTER_DATA.SKILLS[skillId];
            this.saveGame();
            this.renderEquipScene();
        }
    }

    combineAllSkills() {
        if (this.skillManager.combineAllSkills()) {
            this.saveGame();
            this.renderEquipScene();
        } else {
            alert("合成可能なスキルがありません。");
        }
    }

    // スロットを選択するメソッド（新規追加）
    selectFragmentSlot(charaId, skillIndex, slotIndex) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara || !chara.skills[skillIndex]) return;

        // すでに同じスロットを選択中の場合は、装備を外すか選択解除
        if (this.selectedSlot &&
            this.selectedSlot.charaId === charaId &&
            this.selectedSlot.skillIndex === skillIndex &&
            this.selectedSlot.slotIndex === slotIndex) {

            // 既に何かがはまっているなら外す
            if (chara.skills[skillIndex].slots[slotIndex]) {
                this.detachFragment(charaId, skillIndex, slotIndex);
            }
            this.selectedSlot = null;
        } else {
            // 新しくスロットを選択
            this.selectedSlot = { charaId, skillIndex, slotIndex };
        }
        this.renderEquipScene();
    }

    // 選択中のスロットにかけらをはめるメソッド（新規追加）
    attachFragmentToSelectedSlot(fragmentUniqueId) {
        if (!this.selectedSlot) return;
        const { charaId, skillIndex, slotIndex } = this.selectedSlot;

        // 既存の装備ロジックを呼び出す
        this.executeAttachFragment(charaId, skillIndex, slotIndex, fragmentUniqueId);

        // 装備完了したら選択状態をクリア
        this.selectedSlot = null;
        this.renderEquipScene();
    }

    // 共通の装備実行ロジック（既存のロジックを集約）
    executeAttachFragment(charaId, skillIndex, slotIndex, fragmentUniqueId) {
        // 二重装備防止チェック
        const exists = this.skillManager.fragments.some(f => String(f.uniqueId) === String(fragmentUniqueId));
        if (!exists) {
            alert("そのかけらは既に装備されているか、存在しません。");
            return;
        }

        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara || !chara.skills[skillIndex]) return;

        // すでにそのスロットに何かあれば先に外す
        if (chara.skills[skillIndex].slots[slotIndex]) {
            this.detachFragment(charaId, skillIndex, slotIndex);
        }

        // リストから実体を取り出して装備
        const fragment = this.skillManager.popFragment(fragmentUniqueId);
        if (fragment) {
            chara.skills[skillIndex].slots[slotIndex] = fragment;
            if (this.selectedFragmentIds.includes(String(fragmentUniqueId))) this.toggleFragmentSelection(fragmentUniqueId);
            this.saveGame();
            this.renderEquipScene();
        }
    }

    // 解除処理
    detachFragment(charaId, skillIndex, slotIndex) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara || !chara.skills[skillIndex]) return;

        const fragment = chara.skills[skillIndex].slots[slotIndex];
        if (fragment) {
            // リストに実体を戻す
            this.skillManager.pushFragment(fragment);
            chara.skills[skillIndex].slots[slotIndex] = null; // スロットを空にする

            this.saveGame();
            this.renderEquipScene();
        }
    }

    // かけら選択用ポップアップ
    showFragmentPicker(charaId, skillIndex, slotIndex) {
        const equippedIds = this.getAllEquippedFragmentIds(); // 装備済みを取得

        // 装備されていないかけらだけを抽出
        const availableFrags = this.skillManager.fragments.filter(f => !equippedIds.has(String(f.uniqueId)));
        let fragListHtml = availableFrags.length > 0 ? '' : '<p style="text-align:center; padding:20px;">装備可能なかけらがありません</p>';

        availableFrags.forEach(f => {
            // 各かけらが持つエフェクトの情報を詳細に取得
            const effectDetails = f.effects.map(eId => {
                const info = MASTER_DATA.FRAGMENT_EFFECTS[eId];
                return `<div>・${info.name}: ${info.desc}</div>`;
            }).join('');

            fragListHtml += `
    <div class="fragment-selection-item" 
         style="padding:12px; border-bottom:1px solid #444; cursor:pointer; transition: background 0.2s;"
         onclick="gameApp.attachFragment('${charaId}', ${skillIndex}, ${slotIndex}, '${f.uniqueId}'); document.getElementById('fragment-picker-modal').remove();"
         onmouseover="this.style.backgroundColor='#333'"
         onmouseout="this.style.backgroundColor='transparent'">
        <div style="font-weight:bold; color:var(--accent); margin-bottom:4px;">${f.name}</div>
        <div style="font-size:0.85rem; color:var(--text-sub); line-height:1.4;">
            ${effectDetails}
        </div>
    </div>`;
        });

        const modal = document.createElement('div');
        modal.id = 'fragment-picker-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
        <div class="modal-content" style="width: 320px; border: 2px solid var(--accent);">
            <h3 style="margin-top:0; text-align:center; border-bottom:1px solid var(--border); padding-bottom:10px;">装備するかけらを選択</h3>
            <div style="max-height:400px; overflow-y:auto;">${fragListHtml}</div>
            <button onclick="document.getElementById('fragment-picker-modal').remove()" 
                    class="menu-button" 
                    style="width:100%; margin-top:15px; padding:10px; background:#444;">キャンセル</button>
        </div>
    `;
        document.body.appendChild(modal);
    }

    // かけらが既に他のスロットに装備されているかチェックするヘルパー
    isFragmentEquipped(fragmentId) {
        return this.party.some(c =>
            c.skills.some(s =>
                s.slots && s.slots.some(slot => slot && String(slot.uniqueId) === String(fragmentId))
            )
        );
    }

    // 足りなかったメソッドを補完
    equipSkill(skillId, level = 0) {
        if (!this.selectedCharaId) return alert('キャラクターを選択してください');
        const chara = this.party.find(c => String(c.id) === String(this.selectedCharaId)); // ID比較を安全に

        // 同じIDのスキル（レベル違い含む）が既に装備されているかチェック
        const isAlreadyEquipped = chara.skills.some(s => s.id === skillId);
        if (isAlreadyEquipped) {
            alert('同じスキルを複数装備することはできません。');
            return;
        }

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

    // スキル自体を外す処理
    unequipSkill(charaId, skillIndex) {
        const chara = this.party.find(c => String(c.id) === String(charaId));
        if (!chara) return;

        const skill = chara.skills[skillIndex];

        // 1. かけらをインベントリに戻す
        if (skill.slots) {
            skill.slots.forEach((fragment, idx) => {
                if (fragment) {
                    this.skillManager.fragments.push(fragment);
                    skill.slots[idx] = null;
                }
            });
        }

        // 2. 結晶（crystalSlot）をインベントリに戻す (追加箇所)
        if (skill.crystalSlot) {
            this.skillManager.crystals.push(skill.crystalSlot);
            skill.crystalSlot = null;
        }

        // 3. スキル在庫を戻して装備解除
        this.skillManager.addSkill(skill.id, skill.level || 0);
        chara.skills.splice(skillIndex, 1);

        this.saveGame();
        this.renderEquipScene();
    }

    changeSkillCondition(charaId, skillIndex, newCondition) {
        // String() で囲むことで、数値と文字列のどちらが来ても正しく比較できるようにします
        const chara = this.party.find(c => String(charaId) === String(c.id));

        if (chara && chara.skills[skillIndex]) {
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

            const jobKey = chara.job || 'adventurer';
            const jobData = MASTER_DATA.JOBS[jobKey];
            const expPercent = Math.min(100, (data.exp / data.maxExp) * 100);

            // 基本情報の構築
            let html = `
            <div class="chara-header">
                <strong>${data.name}</strong> [${jobData.name}] (Lv.${data.level} / 転生:${data.reincarnation})
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

            charaDiv.innerHTML = html;

            // 転生ボタン（タイトル画面のみ）
            if (data.level >= 100 && this.currentScene === 'title') {
                const btn = document.createElement('button');
                btn.className = 'reincarnate-btn';
                btn.innerText = '転生する';
                btn.onclick = () => this.executeReincarnation(chara.id);
                charaDiv.appendChild(btn);
            }

            // スキル変更画面のみプルダウンを表示
            if (this.currentScene === 'equip') {
                const jobEditArea = document.createElement('div');
                jobEditArea.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px dashed var(--border); display:flex; align-items:center; gap:8px;';

                // プルダウン作成
                const select = document.createElement('select');
                select.className = 'job-select-dropdown'; // CSSで装飾可能
                select.style.cssText = 'background:#1e1e26; color:var(--text-main); border:1px solid var(--accent); border-radius:4px; padding:2px 5px; font-size:0.8em;';

                for (let key in MASTER_DATA.JOBS) {
                    const opt = document.createElement('option');
                    opt.value = key;
                    opt.innerText = MASTER_DATA.JOBS[key].name;
                    opt.selected = (key === jobKey);
                    select.appendChild(opt);
                }

                select.onchange = (e) => this.changeJob(chara.id, e.target.value);

                // 説明テキスト（重み）
                const w = jobData.weights;
                const desc = document.createElement('span');
                desc.style.cssText = 'font-size:0.7em; color:var(--text-sub);';
                desc.innerText = `重み\nHP:${w.hp} | SPD:${w.spd}\n物攻:${w.pAtk} | 物防:${w.pDef}\n魔攻:${w.mAtk} | 魔防:${w.mDef}`;

                jobEditArea.appendChild(select);
                jobEditArea.appendChild(desc);
                charaDiv.appendChild(jobEditArea);
            }

            partyArea.appendChild(charaDiv);
        });
    }
    // 職業変更メソッドを GameController クラスに追加
    changeJob(charaId, jobKey) {
        const chara = this.party.find(c => c.id === charaId);
        if (chara) {
            chara.job = jobKey;
            this.updatePartyUI(); // UIを即時更新
            this.saveGame();      // 保存
        }
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
                const groupId = this.currentMap ? this.currentMap.fragmentGroupId : 'group1';
                const frag = this.skillManager.dropFragment(groupId);
                const fragNames = frag.effects.map(e => MASTER_DATA.FRAGMENT_EFFECTS[e].name).join(", ");
                const dropDiv = document.createElement('div');
                dropDiv.innerText = `★輝きのかけら入手！ [${fragNames}]`;
                dropDiv.style.color = "#00ffff";
                document.getElementById('battle-log').appendChild(dropDiv);
            }

            const hasDefeatedKnight = this.currentEnemies.some(e => e.id === 'armored_knight');

            if (hasDefeatedKnight && !this.hasJoinedKnightChara) {
                this.hasJoinedKnightChara = true;

                // 3キャラ目のデータを作成して追加
                // キャラクターID: 3, 名前: クレア（例）
                const newChara = new Character(3, "クレア");
                newChara.job = "warrior"; // 初期職業を戦士などに設定

                this.party.push(newChara);

                const dropDiv = document.createElement('div');
                dropDiv.innerText = ">> 重装騎士を討伐した証として、新たな仲間が加わった！";
                dropDiv.style.color = "#ffaa00";
                document.getElementById('battle-log').appendChild(dropDiv);
                this.updatePartyUI()
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

        logEl.scrollTop = logEl.scrollHeight;
        this.updatePartyUI();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameController();
});
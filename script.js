// ------------- 定数・要素取得 -------------
const board      = document.getElementById("board");
const message    = document.getElementById("message");
const size       = 7;

// ステータス表示用要素
const p1HpText     = document.getElementById("p1-hp-text");
const p2HpText     = document.getElementById("p2-hp-text");

const p1HpBar      = document.getElementById("p1-hp-bar");
const p2HpBar      = document.getElementById("p2-hp-bar");

const p1AttackText = document.getElementById("p1-attack-text");
const p2AttackText = document.getElementById("p2-attack-text");

// アップグレード選択の<select>
const p1UpgradeSelect = document.getElementById("p1Upgrade");
const p2UpgradeSelect = document.getElementById("p2Upgrade");

// ゲームスタートボタン
const startButton     = document.getElementById("startButton");

// プレイヤーオブジェクトを格納する配列（2人分）
let players = [null, null];

// ボム情報を格納：{ x, y, timeoutId }
let bombs = [];

// 各プレイヤーのインターバル管理用
let commandIntervals = {};

// ------------- ユーティリティ関数 -------------

// ランダム位置取得（exclude がある場合はその座標を除外）
function getRandomPosition(exclude = []) {
  let x, y;
  do {
    x = Math.floor(Math.random() * size);
    y = Math.floor(Math.random() * size);
  } while (exclude.some(p => p.x === x && p.y === y));
  return { x, y };
}

// ランダムな向き（0:上, 1:右, 2:下, 3:左）
function getRandomDirection() {
  return Math.floor(Math.random() * 4);
}

// ------------- 描画処理 -------------

// 全プレイヤー・ボムを描画して HPバーも更新
function drawBoard() {
  board.innerHTML = "";

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      // プレイヤーを配置
      players.forEach(pl => {
        if (!pl || !pl.alive) return;
        if (pl.x === x && pl.y === y) {
          const imgEl = document.createElement("img");
          imgEl.src = pl.img;
          imgEl.style.transform = `rotate(${pl.dir * 90}deg)`;
          cell.appendChild(imgEl);
        }
      });

      // ボムを配置（💣 アイコンを重ねる）
      bombs.forEach(b => {
        if (b.x === x && b.y === y) {
          const bombEl = document.createElement("div");
          bombEl.className = "bomb-icon";
          bombEl.textContent = "💣";
          cell.appendChild(bombEl);
        }
      });

      board.appendChild(cell);
    }
  }

  updateHpBars();
}

// HPバーの幅とテキスト更新
function updateHpBars() {
  if (players[0]) {
    p1HpText.textContent = players[0].hp;
    const ratio1 = Math.max(players[0].hp / players[0].maxHp, 0);
    p1HpBar.style.width = `${ratio1 * 100}%`;
  }
  if (players[1]) {
    p2HpText.textContent = players[1].hp;
    const ratio2 = Math.max(players[1].hp / players[1].maxHp, 0);
    p2HpBar.style.width = `${ratio2 * 100}%`;
  }
}

// ------------- 移動・旋回・攻撃ロジック -------------

// 前進
function moveForward(player) {
  if (!player.alive) return;
  const dx = [0, 1, 0, -1];
  const dy = [-1, 0, 1, 0];
  const newX = player.x + dx[player.dir];
  const newY = player.y + dy[player.dir];
  if (newX >= 0 && newX < size && newY >= 0 && newY < size) {
    player.x = newX;
    player.y = newY;
  }
  drawBoard();
}

// 左旋回
function turnLeft(player) {
  if (!player.alive) return;
  player.dir = (player.dir + 3) % 4;
  drawBoard();
}

// 右旋回
function turnRight(player) {
  if (!player.alive) return;
  player.dir = (player.dir + 1) % 4;
  drawBoard();
}

// 弾道上に「最初に」当たるプレイヤーインデックスを返す (見つからなければ -1)
function getFirstHitIndex(attacker) {
  if (!attacker.alive) return -1;
  const dx = [0, 1, 0, -1];
  const dy = [-1, 0, 1, 0];
  let tx = attacker.x;
  let ty = attacker.y;

  while (true) {
    tx += dx[attacker.dir];
    ty += dy[attacker.dir];
    // 盤外なら命中しない
    if (tx < 0 || tx >= size || ty < 0 || ty >= size) {
      return -1;
    }
    // 生存中のプレイヤーを探す
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      if (!pl || !pl.alive) continue;
      if (pl.x === tx && pl.y === ty && pl !== attacker) {
        return i;
      }
    }
  }
}

// 攻撃処理：レイ上で最初にヒットした相手にダメージ
function attack(attacker) {
  if (!attacker.alive) return;
  const targetIdx = getFirstHitIndex(attacker);
  if (targetIdx < 0) {
    message.textContent = "攻撃は外れた！";
    return;
  }
  const target = players[targetIdx];
  target.hp -= attacker.attack;
  if (target.hp > 0) {
    message.textContent =
      `プレイヤー${attacker.id} の攻撃がヒット！ダメージ ${attacker.attack}、` +
      `プレイヤー${target.id} の残りHP ${target.hp}`;
  } else {
    target.alive = false;
    message.textContent = `プレイヤー${attacker.id} の勝利！（プレイヤー${target.id} を撃破）`;
    resetCommands();
  }
  drawBoard();
}

// 攻撃予測をメッセージ表示
function tryAttackDecision(attacker) {
  if (!attacker.alive) {
    message.textContent = `プレイヤー${attacker.id} は既に倒れています。`;
    return;
  }
  const idx = getFirstHitIndex(attacker);
  if (idx >= 0) {
    message.textContent = `プレイヤー${attacker.id} の攻撃は プレイヤー${players[idx].id} に当たります！`;
  } else {
    message.textContent = `プレイヤー${attacker.id} の攻撃は誰にも当たりません。`;
  }
}

// ------------- ボムロジック -------------

// プレイヤーのマスにボムを設置
function placeBomb(player) {
  if (!player.alive) return;
  // 同じマスに既存ボムがあれば置けない
  const exists = bombs.some(b => b.x === player.x && b.y === player.y);
  if (exists) {
    message.textContent = "このマスには既にボムがあります！";
    return;
  }
  // ボム情報を追加
  const bomb = { x: player.x, y: player.y, timeoutId: null };
  bombs.push(bomb);
  drawBoard();
  message.textContent = `プレイヤー${player.id} がボムを設置！6秒後に爆発します。`;

  // 6秒後に爆発
  bomb.timeoutId = setTimeout(() => {
    explodeBomb(bomb);
  }, 6000);
}

// ボム爆発処理
function explodeBomb(bomb) {
  // ボム設置セルの全プレイヤーにダメージ50
  players.forEach(pl => {
    if (pl.alive && pl.x === bomb.x && pl.y === bomb.y) {
      pl.hp -= 50;
      if (pl.hp <= 0) {
        pl.hp = 0;
        pl.alive = false;
        message.textContent = `ボムが爆発！プレイヤー${pl.id} を撃破！`;
      } else {
        message.textContent = `ボムが爆発！プレイヤー${pl.id} はダメージ50、残りHP${pl.hp}`;
      }
    }
  });
  // 再描画
  drawBoard();
  // 爆発後はボムを削除
  bombs = bombs.filter(b => b !== bomb);
}

// ------------- コマンド自動実行（インターバル） -------------
function runCommands(player, inputId) {
  if (!player) return;
  const input = document.getElementById(inputId);
  const commandStr = input.value.trim().toLowerCase();
  if (!commandStr) return;

  // ► ここで「実行中」ステータスをセット
  const statusEl = document.getElementById(`player${player.id}Status`);
  if (statusEl) statusEl.textContent = "実行中";

  let index = 0;
  if (commandIntervals[inputId]) {
    clearInterval(commandIntervals[inputId]);
  }

  commandIntervals[inputId] = setInterval(() => {
    if (!player.alive) {
      // プレイヤーが倒れたら強制停止してステータスを「待機中」に戻す
      clearInterval(commandIntervals[inputId]);
      if (statusEl) statusEl.textContent = "待機中";
      return;
    }

    // 他のプレイヤーが全滅していたら停止
    const aliveCount = players.filter(pl => pl && pl.alive).length;
    if (aliveCount <= 1) {
      clearInterval(commandIntervals[inputId]);
      if (statusEl) statusEl.textContent = "待機中";
      return;
    }

    const command = commandStr[index];
    const actionMap = {
      f: () => moveForward(player),
      l: () => turnLeft(player),
      r: () => turnRight(player),
      a: () => attack(player),
      m: () => placeBomb(player),
      // ───── ここから「ランダム行動キー u」追加 ─────
      x: () => {
        const choice = Math.floor(Math.random() * 4);
        switch (choice) {
          case 0: moveForward(player); break;
          case 1: turnLeft(player);   break;
          case 2: turnRight(player);  break;
          case 3: attack(player);     break;
        }
      },
      y: () => {
        const choice = Math.floor(Math.random() * 5);
        switch (choice) {
          case 0: moveForward(player); break;
          case 1: turnLeft(player);   break;
          case 2: turnRight(player);  break;
          case 3: attack(player);     break;
          case 4: placeBomb(player);  break;
        }
      },
      // ───── ここまで追加 ─────
      b: () => (getFirstHitIndex(player) >= 0 ? moveForward(player) : turnLeft(player)),
      c: () => (getFirstHitIndex(player) >= 0 ? moveForward(player) : turnRight(player)),
      d: () => (getFirstHitIndex(player) >= 0 ? moveForward(player) : attack(player)),
      g: () => (getFirstHitIndex(player) >= 0 ? turnLeft(player) : moveForward(player)),
      h: () => (getFirstHitIndex(player) >= 0 ? turnLeft(player) : turnRight(player)),
      i: () => (getFirstHitIndex(player) >= 0 ? turnLeft(player) : attack(player)),
      n: () => (getFirstHitIndex(player) >= 0 ? turnRight(player) : moveForward(player)),
      o: () => (getFirstHitIndex(player) >= 0 ? turnRight(player) : turnLeft(player)),
      p: () => (getFirstHitIndex(player) >= 0 ? turnRight(player) : attack(player)),
      q: () => (getFirstHitIndex(player) >= 0 ? attack(player) : moveForward(player)),
      z: () => (getFirstHitIndex(player) >= 0 ? attack(player) : turnLeft(player)),
      s: () => (getFirstHitIndex(player) >= 0 ? attack(player) : turnRight(player))
    };

    if (actionMap[command]) {
      actionMap[command]();
    } else {
      console.warn("無効なコマンド:", command);
    }

    index = (index + 1) % commandStr.length;
  }, player.speed);
}

// すべてのコマンドのインターバルをクリア
function resetCommands() {
  // ► ここで全プレイヤーを「待機中」に戻す
  players.forEach(pl => {
    if (!pl) return;
    const statusEl = document.getElementById(`player${pl.id}Status`);
    if (statusEl) statusEl.textContent = "待機中";
  });

  for (let key in commandIntervals) {
    clearInterval(commandIntervals[key]);
  }
  commandIntervals = {};
}

// ------------- ゲーム開始処理 -------------

function startGame() {
  resetCommands();
  message.textContent = "";

  // 各プレイヤーの選択した “タイプ” を取得
  const p1Type = p1UpgradeSelect.value;
  const p2Type = p2UpgradeSelect.value;

  // 各タイプごとのパラメータ定義
  const typeParams = {
    normal:   { attack: 3, hp: 24, speed: 700 },
    attacker: { attack: 4, hp: 24, speed: 1100 },
    tank:     { attack: 3, hp: 48, speed: 700 },
    speed:    { attack: 2, hp: 16, speed: 300 },
    super:    { attack: 2, hp: 12, speed: 40 }
  };

  // プレイヤー画像ファイル名（青・赤）
  const imgNames = ["tank_blue", "tank_red"];

  // 配列クリア
  players = [null, null];
  bombs = [];
  const usedPositions = [];

  // 2人をランダム配置
  for (let i = 0; i < 2; i++) {
    const selectedType = i === 0 ? p1Type : p2Type;
    const params = typeParams[selectedType];

    const pos = getRandomPosition(usedPositions);
    usedPositions.push(pos);

    players[i] = {
      id: i + 1,
      x: pos.x,
      y: pos.y,
      dir: getRandomDirection(),
      alive: true,
      hp: params.hp,
      maxHp: params.hp,
      attack: params.attack,
      speed: params.speed,
      img: `${imgNames[i]}.jpg`,
      destroyedImg: `${imgNames[i]}_destroyed.jpg`
    };
  }

  // ステータス表示更新
  p1HpText.textContent     = players[0].hp;
  p1AttackText.textContent = players[0].attack;
  p2HpText.textContent     = players[1].hp;
  p2AttackText.textContent = players[1].attack;

  updateHpBars();
  drawBoard();
}

// スタートボタンにイベントリスナー
startButton.addEventListener("click", startGame);

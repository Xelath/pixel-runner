  // 9. 游戏状态机
  // ============================================================
  const Game = {
    // menu | help | settings | levelSelect | gallery | shop | itemSelect
    // levelIntro | playing | paused | dying | dead | win | gameComplete
    state: 'menu',
    lives: PHYS.START_LIVES,
    maxLives: PHYS.START_LIVES, // 当前难度生命上限（HUD 心形数量）
    level: 0,
    coins: 0,              // 当前关金币
    totalCoins: 0,         // 累计金币
    tick: 0,
    introTimer: 0,
    levelTime: 0,          // 本关已用帧数
    levelNoHit: true,      // 本关是否全程未受伤（无伤奖章）
    runTime: 0,            // 本次流程累计用时（闯关结算用）
    confetti: [],          // 通关庆祝粒子（屏幕空间）
    deathMark: null,       // 上次死亡位置虚影
    bossCarry: 0,          // 死亡重生保留的 Boss 已损失血量
    menuSelected: 0,       // 主菜单当前项（与 UI.menuButtons 顺序一致）
    settingsSelected: 0,
    capturingKey: null,    // 设置页正在等待新按键（'jump' / 'dash'）
    levelSel: 0,
    levelAct: 0,           // 选关页当前篇章（0 = 1-16，1 = 17-32）
    galleryTab: 0,         // 图鉴中心页签（0 = 奖章，1 = 怪物）
    pauseSelected: 0,
    themeIndex: 0,         // 当前配色主题（无尽模式也复用）
    levelItem: null,       // 本关临时道具 id
    itemSel: 0,            // 道具选择光标
    shield: 0,             // 护盾层数（道具 + 永久能力）
    slowFactor: 1,         // 时间减速倍率（1 = 正常）
    shopSelected: 0,       // 能力商店光标
    shopMsg: '',           // 商店操作反馈
    endless: false,        // 是否处于无尽模式
    daily: false,          // 是否处于每日挑战（复用无尽流程）
    multiplayer: false,    // 是否处于多人联机模式（大厅/对局）
    endlessRoom: 1,        // 当前无尽房间序号
    endlessSeed: 0,        // 本局随机种子（每局布局不同）
    endlessFinished: false,// 本局无尽是否已结算入账
    reviveUsed: false,     // 本关是否已消耗「不屈意志」
    shake: 0,              // 震屏剩余帧数
    dyingTimer: 0,         // 死亡延迟计时（30 帧 = 0.5 秒）
    deadFade: 0,           // 死亡界面淡入进度
    winFade: 0,            // 过关界面淡入进度

    init() {
      Storage.load();
      Input.init();
      BgTiles.build(THEMES[0]);
      this.state = 'menu';
      this.lives = Storage.startLives();
      this.maxLives = Storage.startLives();
      this.level = 0;
      this.themeIndex = 0;
      this.coins = 0;
      this.totalCoins = 0;
      this.endless = false;
      this.levelItem = null;
    },

    // ---- 存档：刷新历史最高金币 ----
    updateBest() {
      if (this.totalCoins > Storage.data.bestCoins) {
        Storage.data.bestCoins = this.totalCoins;
        Storage.save();
      }
    },

    // 开始整局游戏
    startNewGame() {
      this.lives = Storage.startLives();
      this.maxLives = Storage.startLives();
      this.totalCoins = 0;
      this.runTime = 0;
      this.confetti = [];
      this.deathMark = null;
      this.bossCarry = 0;
      this.level = 0;
      this.endless = false;
      this.daily = false;
      this.levelItem = null;
      this.loadLevel(0);
    },

    // 从关卡选择进入（重新开始该关，金币从 0 计）
    startLevel(idx) {
      this.lives = Storage.startLives();
      this.maxLives = Storage.startLives();
      this.totalCoins = 0;
      this.runTime = 0;
      this.confetti = [];
      this.deathMark = null;
      this.bossCarry = 0;
      this.endless = false;
      this.daily = false;
      this.levelItem = null;
      this.loadLevel(idx);
    },

    // 开始无尽模式：房间逐间生成，生命与金币跨房间保留
    // seed 可选：每日挑战传入固定日期种子
    startEndless(seed) {
      this.lives = Storage.startLives();
      this.maxLives = Storage.startLives();
      this.totalCoins = 0;
      this.runTime = 0;
      this.confetti = [];
      this.deathMark = null;
      this.bossCarry = 0;
      this.endless = true;
      this.daily = false;
      this.endlessRoom = 1;
      this.endlessSeed = seed === undefined
        ? Math.floor(Math.random() * 1e9) : (seed >>> 0);
      this.endlessFinished = false;
      this.levelItem = null;
      this.loadEndlessRoom(1);
    },

    // 每日挑战：同一天使用同一随机种子，记录当日最佳
    startDaily() {
      const key = dailyKey();
      const d = Storage.data.daily ||
        (Storage.data.daily = { date: '', bestRoom: 0, bestCoins: 0 });
      if (d.date !== key) {
        d.date = key;
        d.bestRoom = 0;
        d.bestCoins = 0;
        Storage.save();
      }
      this.startEndless(dailySeed(key));
      this.daily = true;
    },

    // 联机开局（房主）：固定 3 心、无道具、从第 1 关开始
    startMultiplayer(partySize) {
      this.multiplayer = true;
      this.setPartySize(Math.max(1, Math.min(4, partySize | 0)));
      this.endless = false;
      this.daily = false;
      this.levelItem = null;
      this.confetti = [];
      this.deathMark = null;
      this.bossCarry = 0;
      this.totalCoins = 0;
      this.runTime = 0;
      this.level = 0;
      this.themeIndex = 0;
      this.levelTime = 0;
      Level.load(0);
      this.resetParty();
      Particles.clear();
      Camera.reset();
      this.shake = 0;
      BgTiles.build(THEMES[0]);
      this.state = 'levelIntro';
      this.introTimer = 120;
    },

    // 联机客机：按房主下发的关卡与人数准备本地场景（随后由快照驱动）
    prepareGuestLevel(level, partySize) {
      this.multiplayer = true;
      this.endless = false;
      this.levelItem = null;
      this.confetti = [];
      this.deathMark = null;
      this.bossCarry = 0;
      this.coins = 0;
      this.totalCoins = 0;
      this.runTime = 0;
      this.levelTime = 0;
      this.level = level;
      this.themeIndex = level % THEMES.length;
      this.setPartySize(partySize);
      Level.load(level);
      this.resetParty();
      Particles.clear();
      Camera.reset();
      this.shake = 0;
      BgTiles.build(THEMES[this.themeIndex]);
      Music.setLevel(level);
      this.state = 'levelIntro';
      this.introTimer = 120;
    },

    // 加载无尽房间：运行时生成关卡数据后交给 Level.load
    loadEndlessRoom(n) {
      this.endlessRoom = n;
      this.level = 0;
      this.themeIndex = (n - 1) % THEMES.length;
      this.coins = 0;
      this.levelTime = 0;
      this.levelNoHit = true;
      Music.setLevel(n - 1);
      Level.load(Endless.build(n, this.endlessSeed));
      this.resetParty();
      Particles.clear();
      Camera.reset();
      this.shake = 0;
      this.levelItem = null;
      this.applyItemState();
      BgTiles.build(THEMES[this.themeIndex]);
      this.state = 'itemSelect';
      this.itemSel = 0;
    },

    // 选择本关临时道具（null 表示不选）
    chooseItem(id) {
      this.levelItem = id || null;
      this.applyItemState();
      this.state = 'levelIntro';
      this.introTimer = 110;
      Sound.click();
    },

    // 当前生命上限（联机固定 5；单人受「生命强化」加成）
    heartCap() {
      return this.multiplayer ? HEART_CAP : Storage.heartCap();
    },

    // 房主把视听反馈事件塞进下一份快照，供客人端播放
    netEvent(kind, x, y, extra) {
      if (!this.multiplayer || Net.role !== 'host' || !Net.inGame) return;
      const ev = { k: kind, x: Math.round(x), y: Math.round(y) };
      if (extra) Object.assign(ev, extra);
      if (Net.events.length < 48) Net.events.push(ev);
    },

    // 应用临时道具与永久能力效果（换关 / 重生时刷新）
    applyItemState() {
      this.slowFactor = this.levelItem === 'slow' ? 0.65 : 1;
      const shields = (this.levelItem === 'shield' ? 1 : 0) +
                      (Storage.upgrade('shield') > 0 ? 1 : 0);
      for (const p of players) p.shield = shields;
      this.shield = players[0].shield;   // 单人模式兼容
    },

    // 设置房间人数（1~4），多人核心与网络层共用
    setPartySize(n) {
      n = Math.max(1, Math.min(4, n | 0));
      while (players.length < n) {
        const p = createPartyPlayer(players.length, makeInputState());
        players.push(p);
        if (Level.data) p.reset(partySpawn(p.id, Level.spawnPoint()));
      }
      while (players.length > 1 && players.length > n) players.pop();
      this.lives = players[0].hearts;
    },

    // 重置整个队伍到出生点 / 检查点（每人独立生命）
    resetParty() {
      const base = Level.spawnPoint();
      const start = this.multiplayer ? DIFFICULTY.normal.lives : Storage.startLives();
      this.reviveUsed = false;
      for (const p of players) {
        p.reset(partySpawn(p.id, base));
        p.hearts = start;
        p.visualId = p.id;
        p.invuln = Storage.invulnFrames();
      }
      this.lives = players[0].hearts;
      this.maxLives = start;
      this.applyItemState();
    },

    // 当前磁铁吸附半径（永久能力受设置开关控制；临时道具始终生效；0 表示无）
    magnetRadius() {
      const up = Storage.data.magnetOn ? (MAGNET_RADIUS[Storage.upgrade('magnet')] || 0) : 0;
      const item = this.levelItem === 'magnet' ? ITEM_MAGNET_RADIUS : 0;
      return Math.max(up, item);
    },

    // 无尽结算：本局金币转入可支配金币，并记录最远房间 / 每日最佳
    finishEndless() {
      if (!this.endless || this.endlessFinished) return;
      this.endlessFinished = true;
      Storage.earnBank(this.totalCoins);
      if (this.daily) {
        const d = Storage.data.daily;
        if (d) {
          const key = dailyKey();
          if (d.date !== key) {
            d.date = key;
            d.bestRoom = 0;
            d.bestCoins = 0;
          }
          d.bestRoom = Math.max(d.bestRoom | 0, this.endlessRoom);
          d.bestCoins = Math.max(d.bestCoins | 0, this.totalCoins);
        }
      } else {
        Storage.data.endlessBest = Math.max(Storage.data.endlessBest, this.endlessRoom);
      }
      Storage.save();
      this.updateBest();
    },

    // 加载指定关卡并进入道具选择
    loadLevel(idx) {
      this.level = idx;
      this.themeIndex = (LEVELS[idx] && LEVELS[idx].themeIndex !== undefined)
        ? LEVELS[idx].themeIndex
        : idx % THEMES.length;
      this.coins = 0;
      this.levelTime = 0;
      this.levelNoHit = true;
      this.levelItem = null;
      Music.setLevel(idx);                 // 按关卡段切换主题 BGM
      Level.load(idx);
      this.resetParty();
      Particles.clear();
      Camera.reset();
      this.shake = 0;
      // 联机模式跳过道具选择，直接进入关卡过渡（道具由房主统一置空）
      this.state = this.multiplayer ? 'levelIntro' : 'itemSelect';
      if (this.multiplayer) this.introTimer = 120;
      this.itemSel = 0;
      BgTiles.build(THEMES[this.themeIndex]);   // 每关独立配色
    },

    // 重玩当前关（死亡后）；保留已选道具
    retryLevel() {
      // 无尽 / 每日挑战在生命耗尽后已结算，再重试视为开启新一局
      if (this.endless && this.endlessFinished) {
        if (this.daily) this.startDaily();
        else this.startEndless();
        return;
      }
      this.lives = Storage.startLives();
      this.maxLives = Storage.startLives();
      const item = this.levelItem;
      if (this.endless) this.loadEndlessRoom(this.endlessRoom);
      else this.loadLevel(this.level);
      this.levelItem = item;
      this.applyItemState();
      this.state = 'levelIntro';
      this.introTimer = 120;
      // Boss 战重试：保留 50% 已损失血量，并从 Boss 房入口重生
      if (this.bossCarry > 0 && Level.boss) {
        Level.boss.hp = Math.max(1, Level.boss.maxHp - this.bossCarry);
        if (Level.boss.hp <= Math.floor(Level.boss.maxHp / 2)) {
          Level.boss.phase = 2;
          Level.boss.summonCd = 90;
        }
        Level.bossFightStarted = true;
        for (const p of players) p.reset(partySpawn(p.id, Level.spawnPoint()));
      }
      this.bossCarry = 0;
    },

    // 暂停 / 继续
    pauseGame() {
      this.state = 'paused';
      this.pauseSelected = 0;
      Music.stop();
      Sound.pause();
    },
    resumeGame() {
      this.state = 'playing';
      Sound.pause();
    },

    // 返回主菜单（自动存档；无尽 / 每日挑战先结算）
    goMenu() {
      // 联机中返回：先结束联机对局，再回到大厅
      if (this.multiplayer) { Net.endToLobby(); return; }
      if (this.endless) this.finishEndless();
      this.endless = false;
      this.daily = false;
      this.levelItem = null;
      this.state = 'menu';
      this.menuSelected = 0;
      this.confetti = [];
      Music.stop();
      this.updateBest();
      Storage.save();
    },

    // 队伍传送：所有玩家回到最近检查点（不扣心，用于胆小鬼 / 队友受伤）
    teleportParty() {
      const base = Level.spawnPoint();
      this.coins = Level.snapshot ? Level.snapshot.coins : 0;
      // Boss 战普通受伤：回检查点但保留 Boss 当前血量与阶段，避免一次失误抹掉整场进度
      const bossKeep = (Level.boss && Level.boss.alive && Level.bossFightStarted)
        ? {
            hp: Level.boss.hp, maxHp: Level.boss.maxHp,
            phase: Level.boss.phase, summonCd: Level.boss.summonCd
          }
        : null;
      for (const p of players) {
        p.reset(partySpawn(p.id, base));
        p.invuln = Storage.invulnFrames();
        p.flash = 14;
      }
      this.applyItemState();
      Level.restoreSnapshot();             // 敌人 / 金币状态回滚到检查点
      Level.resetBoss();
      if (bossKeep && Level.boss) {
        Level.boss.hp = bossKeep.hp;
        Level.boss.maxHp = bossKeep.maxHp;
        Level.boss.phase = bossKeep.phase;
        Level.boss.summonCd = bossKeep.summonCd;
      }
      this.bossCarry = 0;
      Level.resetFallPlats();
      Level.resetTraps();
      Level.resetLava();
      this.lives = players[0].hearts;
    },

    // 损失生命（actor 为受伤玩家）：只有该玩家扣心，全队回检查点
    loseLife(actor, knockbackDir, cause) {
      // 兼容旧签名 loseLife(方向, 原因)
      if (typeof actor !== 'object') {
        cause = knockbackDir; knockbackDir = actor; actor = player;
      }
      const victim = actor || player;
      // 胆小鬼模式：坠落 / 熔岩等直接伤害也不扣心，仅回到检查点（联机规则优先）
      if (COWARD.NO_DAMAGE && Storage.coward() && !this.multiplayer) {
        this.teleportParty();
        this.shake = 3;
        Level.addPopup(victim.x + victim.w / 2, victim.y - 10,
                       '胆小鬼：生命不减', '#7ff0a8');
        return;
      }
      this.levelNoHit = false;
      // 记录受伤位置（重生后短暂显示虚影）
      this.deathMark = {
        x: victim.x, y: victim.y,
        level: this.level, timer: FEEL.DEATH_MARK_FRAMES
      };
      if (Level.boss && Level.bossFightStarted && Level.boss.alive) {
        this.bossCarry = Math.floor((Level.boss.maxHp - Level.boss.hp) * FEEL.BOSS_KEEP_DAMAGE);
      }

      victim.hearts = Math.max(0, victim.hearts - 1);
      this.lives = players[0].hearts;      // 单人 HUD 兼容
      this.shake = 9;
      Level.addPopup(victim.x + victim.w / 2, victim.y - 18,
                     'P' + (victim.id + 1) + ' -1 心', '#ff8a8a');
      this.netEvent('hurt', victim.x + victim.w / 2, victim.y + victim.h / 2,
                    { id: victim.id });

      // 不屈意志：每关第一次致命伤害改为保留 1 颗心
      if (victim.hearts <= 0 && Storage.upgrade('revive') > 0 && !this.reviveUsed) {
        this.reviveUsed = true;
        victim.hearts = 1;
        this.lives = players[0].hearts;
        this.shake = 12;
        Sound.heart();
        Level.addPopup(victim.x + victim.w / 2, victim.y - 30,
                       '不屈意志：保留 1 心', '#ffd23f');
        this.netEvent('revive', victim.x + victim.w / 2, victim.y + victim.h / 2,
                      { id: victim.id });
        this.teleportParty();
        return;
      }

      // 任意一人心扣完：全队失败
      if (victim.hearts <= 0) {
        this.finishEndless();
        Sound.death();
        Music.stop();
        this.state = 'dying';
        this.dyingTimer = 30;
        this.deadFade = 0;
        for (const p of players) {
          p.flash = 14;
          p.vy = -7;
          p.dashTime = 0;
        }
        this.updateBest();
        return;
      }

      if (cause === 'spike') Sound.spike();
      else Sound.hurt();
      // 只有受伤者扣心，其余玩家只被传送
      this.teleportParty();
      this.shake = 9;
    },

    // 受到伤害（actor 为受伤玩家）：护盾优先、变大其次，最后扣心
    hitPlayer(actor, dir, cause) {
      // 兼容旧签名 hitPlayer(方向, 原因)
      if (typeof actor !== 'object') {
        cause = dir; dir = actor; actor = player;
      }
      const target = actor || player;
      if (COWARD.NO_DAMAGE && Storage.coward() && !this.multiplayer) {
        target.invuln = Math.max(target.invuln, 40);
        this.shake = Math.max(this.shake, 3);
        Sound.pause();
        Level.addPopup(target.x + target.w / 2, target.y - 8,
                       '胆小鬼：不扣心', '#7ff0a8');
        return;
      }
      if (target.shield > 0) {
        target.shield--;
        target.invuln = Storage.invulnFrames();
        target.flash = 14;
        this.shake = Math.max(this.shake, 7);
        Sound.shrink();
        Particles.gemBurst(target.x + target.w / 2, target.y + target.h / 2);
        Level.addPopup(target.x + target.w / 2, target.y - 8, '护盾抵消', '#8adcff');
        this.netEvent('shield', target.x + target.w / 2, target.y + target.h / 2,
                      { id: target.id });
        return;
      }
      this.levelNoHit = false;             // 本关无伤记录失效
      if (target.big) {
        target.shrink();
        target.invuln = Storage.invulnFrames();
        target.flash = 14;
        this.shake = Math.max(this.shake, 9);
        Sound.shrink();
        Particles.shrinkBurst(target.x + target.w / 2, target.y + target.h / 2);
        Level.addPopup(target.x + target.w / 2, target.y - 8, '变小了', '#ffd23f');
        this.netEvent('shrink', target.x + target.w / 2, target.y + target.h / 2,
                      { id: target.id });
        return;
      }
      this.loseLife(target, dir, cause);
    },

    // 主动回到上一个检查点（暂停菜单选项，不损失生命）
    returnToCheckpoint() {
      if (!Level.snapshot && !Level.bossFightStarted) { Sound.pause(); return; }
      this.teleportParty();
      this.state = 'playing';
      Sound.pause();
    },

    // 单关通关：记录解锁、单关最高金币与最快通关时间
    completeLevel() {
      if (this.endless) { this.completeEndlessRoom(); return; }
      this.state = 'win';
      this.winFade = 0;
      Music.stop();
      Sound.win();
      this.runTime += this.levelTime;

      const best = Storage.data.levelBests[this.level];
      if (best) {
        best.cleared = true;
        if (this.coins > best.coins) best.coins = this.coins;
        if (best.time === 0 || this.levelTime < best.time) best.time = this.levelTime;
        // 奖章：通关 / 全金币 / 宝石 / 无伤
        const m = Object.assign({ clear: false, coins: false, gem: false, noHit: false },
                                best.medals || {});
        m.clear = true;
        if (this.coins >= Level.coinCfgs.length) m.coins = true;
        if (Storage.data.gems[this.level]) m.gem = true;
        if (this.levelNoHit) m.noHit = true;
        best.medals = m;
        Storage.data.medals = Storage.data.levelBests.map((b) => b.medals);
      }
      if (this.level + 1 < LEVEL_COUNT) {
        Storage.data.unlocked = Math.max(Storage.data.unlocked, this.level + 1);
      }
      // 本关金币转入可支配金币（能力商店消费）
      Storage.earnBank(this.coins);
      this.updateBest();
      Storage.save();
    },

    // 无尽房间通过：记录最远房间，金币在整局结束时统一入账
    completeEndlessRoom() {
      this.state = 'win';
      this.winFade = 0;
      Music.stop();
      Sound.win();
      this.runTime += this.levelTime;
      Storage.data.endlessBest = Math.max(Storage.data.endlessBest, this.endlessRoom);
      this.updateBest();
      Storage.save();
    },

    // 进入下一关 / 下一无尽房间 / 全游戏通关
    nextLevel() {
      if (this.endless) { this.loadEndlessRoom(this.endlessRoom + 1); return; }
      if (this.level + 1 >= LEVEL_COUNT) {
        this.state = 'gameComplete';
        this.winFade = 0;
        Storage.data.cleared = true;
        const last = Storage.data.levelBests[LEVEL_COUNT - 1];
        if (last) last.cleared = true;
        this.updateBest();
        Storage.save();
        Sound.complete();
      } else {
        this.loadLevel(this.level + 1);
      }
    },

    // 玩家与敌人交互：踩头消灭 / 侧碰受伤（actor 为当前玩家）
    handleEnemyCollision(e, actor) {
      if (!e.alive) return false;
      const p = actor || player;
      if (isStomping(p, e)) {
        // 尖刺怪头顶有刺：踩上去反而受伤
        if (e.type === 'spiky') {
          p.vy = -6;
          this.shake = Math.max(this.shake, 6);
          Sound.hurt();
          Level.addPopup(e.x + e.w / 2, e.y - 10, '尖刺!', '#ff8a8a');
          this.hitPlayer(p, p.x < e.x ? -1 : 1, 'hurt');
          return false;
        }
        // 铁甲 / 精英怪：非致命踩踏只削减一层血量
        if ((e.hp || 1) > 1) {
          e.hp--;
          e.hurtTimer = 24;
          p.vy = PHYS.STOMP_BOUNCE * 0.85;
          p.invuln = Math.max(p.invuln, 20);
          this.shake = Math.max(this.shake, 5);
          Particles.enemyChunks(e.x + e.w / 2, e.y + e.h / 2);
          Sound.stomp();
          Level.addPopup(e.x + e.w / 2, e.y - 10,
                         e.elite ? '精英受伤' : '护甲破损',
                         e.elite ? '#ffd23f' : '#c8d0dc');
          this.netEvent('armor', e.x + e.w / 2, e.y + e.h / 2);
          return false;
        }
        e.alive = false;
        e.deadTimer = 30;
        p.vy = PHYS.STOMP_BOUNCE;
        p.invuln = Math.max(p.invuln, 20);
        Particles.enemyChunks(e.x + e.w / 2, e.y + e.h / 2);
        Level.addRing(e.x + e.w / 2, e.y + e.h / 2);
        this.shake = Math.max(this.shake, 4);
        Sound.stomp();
        const reward = e.elite ? 3 : 1;
        Level.addPopup(e.x + e.w / 2, e.y, '+' + reward,
                       e.elite ? '#ffd23f' : '#ffe28a');
        if (e.elite) Particles.coinBurst(e.x + e.w / 2, e.y + e.h / 2);
        this.coins += reward; this.totalCoins += reward;
        this.netEvent('stomp', e.x + e.w / 2, e.y + e.h / 2);
        return true;
      }
      // 侧碰 / 底部碰：受伤并弹开
      const dir = p.x < e.x ? -1 : 1;
      p.vx = dir * 6;
      p.vy = -5;
      this.hitPlayer(p, dir, 'hurt');
      return false;
    },

    handleBossCollision(actor) {
      const b = Level.boss;
      if (!b || !b.alive) return;
      const p = actor || player;
      if (isStomping(p, b)) {
        b.hp--;
        b.hurtTimer = 60;
        p.vy = PHYS.STOMP_BOUNCE * 1.1;
        p.invuln = Math.max(p.invuln, 30);
        Sound.bossHit();
        Level.addPopup(b.x + b.w / 2, b.y, 'HIT!', '#ff6b6b');
        // 半血进入二阶段：提速 + 周期性召唤小怪
        if (b.hp > 0 && b.hp <= Math.floor(b.maxHp / 2) && b.phase === 1) {
          b.phase = 2;
          b.summonCd = 90;
          this.shake = 14;
          Particles.bossBurst(b.x + b.w / 2, b.y + b.h / 2);
          Level.addPopup(b.x + b.w / 2, b.y - 30, '狂暴!', '#ff5b6e');
          Sound.enrage();
        }
        if (b.hp <= 0) {
          b.alive = false;
          Level.spawnFlagAfterBoss();
          Particles.bossBurst(b.x + b.w / 2, b.y + b.h / 2);
          Sound.bossDown();
          this.coins += 10; this.totalCoins += 10;
          Level.addPopup(b.x + b.w / 2, b.y, '+10', '#ffd23f');
        }
      } else {
        const dir = p.x < b.x ? -1 : 1;
        p.vx = dir * 8;
        p.vy = -6;
        this.hitPlayer(p, dir, 'hurt');
      }
    },

    // ---- 菜单/设置动作 ----
    activateMenu(id) {
      Sound.click();
      if (id === 'start') this.startNewGame();
      else if (id === 'endless') this.startEndless();
      else if (id === 'daily') this.startDaily();
      else if (id === 'multiplayer') { this.state = 'multiplayer'; Net.openLobby(); }
      else if (id === 'select') { this.state = 'levelSelect'; this.levelSel = 0; this.levelAct = 0; }
      else if (id === 'shop') { this.state = 'shop'; this.shopSelected = 0; this.shopMsg = ''; }
      else if (id === 'gallery') { this.state = 'gallery'; this.galleryTab = 0; }
      else if (id === 'help') this.state = 'help';
      else if (id === 'settings') { this.state = 'settings'; this.settingsSelected = 0; }
    },

    // 购买 / 升级永久能力（扣除可支配金币）
    buyUpgrade(id) {
      const u = UPGRADES.find((x) => x.id === id);
      if (!u) return;
      const lv = Storage.upgrade(u.id);
      if (lv >= u.max) {
        Sound.pause();
        this.shopMsg = u.name + ' 已满级';
        return;
      }
      const price = Storage.upgradePrice(u);
      if (Storage.data.bankCoins < price) {
        Sound.pause();
        this.shopMsg = '金币不足：需要 ' + price;
        return;
      }
      Storage.data.bankCoins -= price;
      Storage.data.upgrades[u.id] = lv + 1;
      Storage.save();
      Sound.gem();
      this.shopMsg = u.name + ' 升级到 Lv' + (lv + 1);
    },

    // 音量增减：dir = -1 减小 / +1 增大，步进 10%
    // 设置页会持续播放 BGM，改音乐音量可立即听出差别
    adjustVolume(id, dir) {
      const key = id === 'sfxVol' ? 'sfxVol' : 'musicVol';
      const cur = Math.round(Storage.data[key] * 10) / 10;
      const next = Math.max(0, Math.min(1,
        Math.round((cur + dir * 0.1) * 10) / 10));
      Storage.data[key] = next;
      Sound.setVolumes();
      Storage.save();
      if (key === 'sfxVol') Sound.click();   // 用新音量给出即时反馈
    },

    toggleSetting(id) {
      // 音效开关：先切换再播放点击音，开启时能立即听到反馈
      if (id === 'sfx') {
        Storage.data.sfxOn = !Storage.data.sfxOn;
        Storage.save();
        Sound.click();
        return;
      }
      Sound.click();
      if (id === 'music') {
        Storage.data.musicOn = !Storage.data.musicOn;
        Storage.save();
        if (Storage.data.musicOn) {
          if (this.state === 'playing' || this.state === 'settings') Music.start();
        } else Music.stop();
      } else if (id === 'musicVol') {
        this.adjustVolume('musicVol', 1);
      } else if (id === 'sfxVol') {
        this.adjustVolume('sfxVol', 1);
      } else if (id === 'keyJump' || id === 'keyDash') {
        this.capturingKey = id === 'keyJump' ? 'jump' : 'dash';
      } else if (id === 'full') {
        toggleFullscreen();
      } else if (id === 'quality') {
        Storage.data.lowQuality = !Storage.data.lowQuality;
        Particles.clear();
        Storage.save();
      } else if (id === 'difficulty') {
        const cur = DIFFICULTY_ORDER.indexOf(Storage.data.difficulty);
        Storage.data.difficulty = DIFFICULTY_ORDER[(cur + 1) % DIFFICULTY_ORDER.length];
        Storage.save();
      } else if (id === 'coward') {
        Storage.data.coward = !Storage.data.coward;
        this.maxLives = Storage.startLives();
        Storage.save();
      } else if (id === 'magnet') {
        Storage.data.magnetOn = !Storage.data.magnetOn;
        Storage.save();
      } else if (id === 'skin') {
        // 只在已解锁的配色之间循环（宝石越多可选越多）
        const list = Storage.availableSkins();
        if (list.length <= 1) { Sound.pause(); return; }
        const cur = list.indexOf(Storage.data.skin);
        Storage.data.skin = list[(cur + 1) % list.length];
        Storage.save();
      } else if (id === 'back') {
        this.state = 'menu';
      }
    },

    pausedAction(id) {
      if (id === 'resume') this.resumeGame();
      else if (id === 'checkpoint') { this.returnToCheckpoint(); }
      else if (id === 'restart') { Sound.click(); this.retryLevel(); }
      else { this.goMenu(); }
    },

    // 静音切换：音效与音乐一起开关
    toggleMute() {
      const anyOn = Storage.data.sfxOn || Storage.data.musicOn;
      Storage.data.sfxOn = !anyOn;
      Storage.data.musicOn = !anyOn;
      if (anyOn) Music.stop();
      Storage.save();
    },

    // ---- 主循环状态更新 ----
    update() {
      this.tick++;
      Input.pollGamepad();
      if (this.shake > 0) this.shake--;
      if (Input.consumeFullscreen()) toggleFullscreen();
      if (Input.consumeMute()) this.toggleMute();

      // 背景音乐：游戏进行中播放；设置页也持续播放，便于实时试听音量
      if (this.state === 'playing' || this.state === 'settings') Music.start();
      else if (this.state !== 'paused') Music.stop();

      if (this.state === 'menu') {
        const btns = UI.menuButtons();
        const tap = Input.consumeTap();
        if (tap) {
          const hit = btns.find((b) => hitRect(tap.x, tap.y, b));
          if (hit) { this.menuSelected = btns.indexOf(hit); this.activateMenu(hit.id); }
        } else {
          if (Input.up)   { Input.up = false;   this.menuSelected = Math.max(0, this.menuSelected - 1); Sound.click(); }
          if (Input.down) { Input.down = false; this.menuSelected = Math.min(btns.length - 1, this.menuSelected + 1); Sound.click(); }
          if (Input.consumeConfirm()) this.activateMenu(btns[this.menuSelected].id);
        }
      } else if (this.state === 'multiplayer') {
        // 联机大厅：交互全部交给 DOM 覆盖层，画布只负责背景
        if (Input.consumeTap()) { /* 吞掉画布点击 */ }
      } else if (this.state === 'help') {
        if (Input.consumeTap() || Input.consumeConfirm() ||
            Input.consumeRestart() || Input.consumePause()) {
          this.state = 'menu';
          Sound.click();
        }
      } else if (this.state === 'gallery') {
        const tap = Input.consumeTap();
        if (tap) {
          // 点击页签切换，点击其它区域返回菜单
          const tab = UI.galleryTabs().find((t) => hitRect(tap.x, tap.y, t));
          if (tab) { this.galleryTab = tab.tab; Sound.click(); }
          else { this.state = 'menu'; Sound.click(); }
        } else {
          if (Input.left)  { Input.left = false;  this.galleryTab = 0; Sound.click(); }
          if (Input.right) { Input.right = false; this.galleryTab = 1; Sound.click(); }
          if (Input.consumeConfirm() || Input.consumeRestart() || Input.consumePause()) {
            this.state = 'menu';
            Sound.click();
          }
        }
      } else if (this.state === 'shop') {
        const rows = UI.shopRows();
        const tap = Input.consumeTap();
        if (tap) {
          const hit = rows.find((r) => hitRect(tap.x, tap.y, r));
          if (hit) {
            this.shopSelected = rows.indexOf(hit);
            if (hit.id === 'back') { this.state = 'menu'; Sound.click(); }
            else this.buyUpgrade(hit.id);
          }
        } else {
          if (Input.up)   { Input.up = false;   this.shopSelected = Math.max(0, this.shopSelected - 1); }
          if (Input.down) { Input.down = false; this.shopSelected = Math.min(rows.length - 1, this.shopSelected + 1); }
          if (Input.consumeConfirm()) {
            const cur = rows[this.shopSelected];
            if (cur.id === 'back') { this.state = 'menu'; Sound.click(); }
            else this.buyUpgrade(cur.id);
          }
          if (Input.consumePause()) { this.state = 'menu'; Sound.click(); }
        }
      } else if (this.state === 'settings') {
        const rows = UI.settingsRows();
        const tap = Input.consumeTap();
        if (tap) {
          const hit = rows.find((r) => hitRect(tap.x, tap.y, r));
          if (hit) {
            this.settingsSelected = rows.indexOf(hit);
            // 音量行：只有右侧「+」按钮增大，点击其它位置均减小
            if (hit.id === 'musicVol' || hit.id === 'sfxVol') {
              const z = UI.volumeZones(hit);
              this.adjustVolume(hit.id, tap.x >= z.plus.x ? 1 : -1);
            } else {
              this.toggleSetting(hit.id);
            }
          }
        } else {
          if (Input.up)   { Input.up = false;   this.settingsSelected = Math.max(0, this.settingsSelected - 1); }
          if (Input.down) { Input.down = false; this.settingsSelected = Math.min(rows.length - 1, this.settingsSelected + 1); }
          if (Input.left) {
            Input.left = false;
            const row = rows[this.settingsSelected];
            if (row.id === 'musicVol' || row.id === 'sfxVol') this.adjustVolume(row.id, -1);
          }
          if (Input.right) {
            Input.right = false;
            const row = rows[this.settingsSelected];
            if (row.id === 'musicVol' || row.id === 'sfxVol') this.adjustVolume(row.id, 1);
          }
          if (Input.consumeConfirm()) {
            const row = rows[this.settingsSelected];
            if (row.id === 'musicVol' || row.id === 'sfxVol') this.adjustVolume(row.id, 1);
            else this.toggleSetting(row.id);
          }
          if (Input.consumePause()) { this.state = 'menu'; Sound.click(); }
        }
      } else if (this.state === 'levelSelect') {
        const cards = UI.levelCards();
        const cols = UI.levelCols();
        const back = UI.levelBackButton();
        const tabs = UI.actTabs();
        const tap = Input.consumeTap();
        if (tap) {
          if (hitRect(tap.x, tap.y, back)) { this.state = 'menu'; Sound.click(); }
          else {
            const tabHit = tabs.find((t) => hitRect(tap.x, tap.y, t));
            if (tabHit) {
              this.levelAct = tabHit.act;
              this.levelSel = tabHit.act * 16;
              Sound.click();
            } else {
              const hit = cards.find((c) => hitRect(tap.x, tap.y, c));
              if (hit) {
                if (hit.index <= Storage.data.unlocked) { Sound.click(); this.startLevel(hit.index); }
                else Sound.pause();
              }
            }
          }
        } else {
          if (Input.left)  { Input.left = false;  this.levelSel = Math.max(0, this.levelSel - 1); Sound.click(); }
          if (Input.right) { Input.right = false; this.levelSel = Math.min(LEVEL_COUNT - 1, this.levelSel + 1); Sound.click(); }
          // 左右键跨过篇章边界时自动切换页签
          this.levelAct = this.levelSel < 16 ? 0 : 1;
          const actMin = this.levelAct * 16;
          const actMax = Math.min(LEVEL_COUNT - 1, actMin + 15);
          if (Input.up)    { Input.up = false;    this.levelSel = Math.max(actMin, this.levelSel - cols); Sound.click(); }
          if (Input.down)  { Input.down = false;  this.levelSel = Math.min(actMax, this.levelSel + cols); Sound.click(); }
          if (Input.consumeConfirm()) {
            if (this.levelSel <= Storage.data.unlocked) { Sound.click(); this.startLevel(this.levelSel); }
            else Sound.pause();
          }
          if (Input.consumePause()) { this.state = 'menu'; Sound.click(); }
        }
      } else if (this.state === 'itemSelect') {
        const cards = UI.itemCards();
        const skip = UI.itemSkip();
        const tap = Input.consumeTap();
        if (tap) {
          const hit = cards.find((c) => hitRect(tap.x, tap.y, c));
          if (hit) { this.itemSel = hit.index; this.chooseItem(ITEMS[hit.index].id); }
          else if (hitRect(tap.x, tap.y, skip)) this.chooseItem(null);
        } else {
          if (Input.left)  { Input.left = false;  this.itemSel = Math.max(0, this.itemSel - 1); Sound.click(); }
          if (Input.right) { Input.right = false; this.itemSel = Math.min(ITEMS.length - 1, this.itemSel + 1); Sound.click(); }
          if (Input.consumeConfirm()) this.chooseItem(ITEMS[this.itemSel].id);
          if (Input.consumePause() || Input.consumeRestart()) this.chooseItem(null);
        }
      } else if (this.state === 'levelIntro') {
        if (Input.consumeRestart()) { Sound.click(); this.retryLevel(); }
        else {
          this.introTimer--;
          if (this.introTimer <= 0) this.state = 'playing';
        }
      } else if (this.state === 'playing') {
        if (Input.consumePause()) { this.pauseGame(); }
        else if (Input.consumeRestart()) { Sound.click(); this.retryLevel(); }
        else {
          // 点击 HUD 图标：暂停 / 全屏
          const tap = Input.consumeTap();
          if (tap) {
            const icons = UI.hudIcons();
            if (hitRect(tap.x, tap.y, icons.pause)) { this.pauseGame(); }
            else if (hitRect(tap.x, tap.y, icons.fullscreen)) { toggleFullscreen(); Sound.click(); }
          }

          Level.updatePlatforms();      // 先更新移动平台，再更新玩家物理
          for (const p of players) p.update();
          Level.updatePads();          // 弹跳板交互（需在玩家移动后判定）
          Level.updateFallPlats();     // 下坠平台计时
          Level.updateTraps();         // 火球 / 激光 / 捕兽夹
          Level.updateLava();          // 熔岩上涨
          Level.updateGates();         // 机关门升降与开关
          Level.updateEnemies();
          Level.updateBoss();
          Level.checkBossArena();      // 记录进入 Boss 房（决定 Boss 战重生点）
          Level.updatePopups();
          Level.updateRings();
          Level.updateHints();
          Particles.update();
          Camera.update();
          this.levelTime++;            // 本关计时
          // 死亡位置虚影倒计时
          if (this.deathMark) {
            this.deathMark.timer--;
            if (this.deathMark.timer <= 0) this.deathMark = null;
          }

          // 检查点激活：保存金币与敌人快照（死亡后回滚）
          const cp = Level.updateCheckpoints();
          if (cp >= 0) {
            Level.captureSnapshot(this.coins);
            Sound.checkpoint();
            Particles.coinBurst(Level.checkpoints[cp].x, Level.checkpoints[cp].y - 40);
            Level.addPopup(Level.checkpoints[cp].x, Level.checkpoints[cp].y - 84,
                           '检查点已激活', '#8adcff');
            this.netEvent('checkpoint', Level.checkpoints[cp].x,
                          Level.checkpoints[cp].y - 40);
          }

          // 磁铁：把附近金币 / 宝石 / 爱心吸向每名玩家（永久能力或临时道具）
          const magnetR = this.magnetRadius();
          if (magnetR > 0) {
            for (const p of players) {
              const cx = p.x + p.w / 2;
              const cy = p.y + p.h / 2;
              const pull = (o, spd) => {
                if (o.collected) return;
                const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
                const dx = cx - ox, dy = cy - oy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 1 && d < magnetR) {
                  o.x += (dx / d) * spd;
                  o.y += (dy / d) * spd;
                }
              };
              for (const c of Level.coins) pull(c, 2.6);
              for (const g of Level.gems) pull(g, 2.2);
              for (const h of Level.hearts) pull(h, 2.2);
            }
          }

          // 金币收集（任一玩家拾取，队伍共享）
          for (const c of Level.coins) {
            if (c.collected) continue;
            for (const p of players) {
              if (!aabb(p, c)) continue;
              c.collected = true;
              this.coins++; this.totalCoins++;
              Sound.coin();
              Particles.coinBurst(c.x + c.w / 2, c.y + c.h / 2);
              Level.addPopup(c.x + c.w / 2, c.y, '+1', '#ffe28a');
              this.netEvent('coin', c.x + c.w / 2, c.y + c.h / 2);
              break;
            }
          }

          // 宝石收集（每关 1 颗，永久计入存档）
          for (const g of Level.gems) {
            if (g.collected) continue;
            for (const p of players) {
              if (!aabb(p, g)) continue;
              g.collected = true;
              Storage.data.gems[this.level] = true;
              Storage.save();
              Sound.gem();
              Particles.gemBurst(g.x + g.w / 2, g.y + g.h / 2);
              Level.addPopup(g.x + g.w / 2, g.y - 8, '宝石 +1', '#9be2ff');
              this.netEvent('gem', g.x + g.w / 2, g.y + g.h / 2);
              const gemCount = Storage.gemsCount();
              const unlocked = SKINS.filter((s) => s.unlock === gemCount);
              if (unlocked.length) {
                Level.addPopup(g.x + g.w / 2, g.y - 32,
                               '解锁配色：' + unlocked.map((s) => s.name).join('、'),
                               '#7ff0a8');
              }
              break;
            }
          }

          // 爱心拾取：拾取者 +1 心，个人上限按当前生命上限
          for (const h of Level.hearts) {
            if (h.collected) continue;
            for (const p of players) {
              if (p.hearts >= this.heartCap() || !aabb(p, h)) continue;
              h.collected = true;
              p.hearts++;
              this.lives = players[0].hearts;
              Sound.heart();
              Particles.heartBurst(h.x + h.w / 2, h.y + h.h / 2);
              Level.addPopup(h.x + h.w / 2, h.y - 6,
                             'P' + (p.id + 1) + ' 生命 +1', '#ff9aa8');
              this.netEvent('heart', h.x + h.w / 2, h.y + h.h / 2, { id: p.id });
              break;
            }
          }

          // 变大果实：吃下后碰撞盒变大，受伤一次变小
          for (const f of Level.fruits) {
            if (f.collected) continue;
            for (const p of players) {
              if (p.big || !aabb(p, f)) continue;
              f.collected = true;
              p.grow();
              Sound.power();
              Particles.fruitBurst(f.x + f.w / 2, f.y + f.h / 2);
              Level.addPopup(f.x + f.w / 2, f.y - 8, '变大!', '#ffb23f');
              this.netEvent('fruit', f.x + f.w / 2, f.y + f.h / 2, { id: p.id });
              break;
            }
          }

          // 敌人 / Boss / 尖刺 / 陷阱碰撞：逐玩家判定
          // 联机模式固定启用陷阱，不受房主本地胆小鬼设置影响
          const trapsActive = this.multiplayer ? true
            : (!COWARD.TRAPS_OFF || !Storage.coward());
          for (const p of players) {
            if (this.state !== 'playing') break;
            if (p.invuln > 0) continue;

            for (const e of Level.enemies) {
              if (aabb(p, e)) { this.handleEnemyCollision(e, p); break; }
            }
            if (Level.boss && Level.boss.alive && p.invuln <= 0 &&
                aabb(p, Level.boss)) {
              this.handleBossCollision(p);
            }
            if (p.invuln > 0) continue;

            for (const s of Level.spikes) {
              if (!aabb(p, s)) continue;
              const dir = p.x < s.x ? -1 : 1;
              p.vx = dir * 6;
              p.vy = -7;
              if (COWARD.SPIKES_SAFE && Storage.coward() && !this.multiplayer) {
                p.invuln = 24;
                this.shake = Math.max(this.shake, 4);
                Sound.spike();
              } else {
                this.hitPlayer(p, dir, 'spike');
              }
              break;
            }
            if (p.invuln > 0) continue;

            if (trapsActive) {
              for (const pr of Level.projectiles) {
                if (pr.kind === 'beamwarn') continue;   // 预警光柱不造成伤害
                if (aabb(p, pr)) {
                  const dir = (pr.kind === 'beam' || pr.vx === 0)
                    ? (p.x < pr.x ? -1 : 1) : (pr.vx > 0 ? -1 : 1);
                  this.hitPlayer(p, dir, 'hurt');
                  break;
                }
              }
              if (p.invuln > 0) continue;
              for (const t of Level.traps) {
                if (t.kind === 'laser' && t.active && aabb(p, t)) {
                  this.hitPlayer(p, p.x < t.x ? -1 : 1, 'hurt');
                  break;
                }
                if (t.kind === 'bear' && t.cool <= 0 && aabb(p, t)) {
                  Sound.spike();
                  this.hitPlayer(p, p.x < t.x ? -1 : 1, 'hurt');
                  t.snap = TRAP.BEAR_SNAP;
                  t.cool = TRAP.BEAR_COOLDOWN;
                  break;
                }
                if ((t.kind === 'saw' || t.kind === 'pendulum') && aabb(p, t)) {
                  this.hitPlayer(p, p.x < t.x ? -1 : 1, 'hurt');
                  break;
                }
                if ((t.kind === 'crusher' || t.kind === 'popspike') &&
                    t.active && aabb(p, t)) {
                  this.hitPlayer(p, p.x < t.x ? -1 : 1, 'hurt');
                  break;
                }
              }
            }
          }

          // 熔岩 / 坠落：对应玩家扣心，全队回检查点
          for (const p of players) {
            if (this.state !== 'playing') break;
            if (p.invuln > 0) continue;
            if (Level.lava && p.y + p.h > Level.lava.y) {
              this.loseLife(p, 0, 'hurt');
              break;
            }
          }
          for (const p of players) {
            if (this.state !== 'playing') break;
            if (p.y > PHYS.FALL_DEATH_Y) {
              this.loseLife(p, 0, 'hurt');
              break;
            }
          }

          // 终点旗帜：必须所有玩家都在触发区内
          if (this.state === 'playing' && Level.flagTrigger &&
              players.every((p) => aabb(p, Level.flagTrigger))) {
            this.completeLevel();
          }
        }
      } else if (this.state === 'paused') {
        const items = UI.pauseItems();
        const tap = Input.consumeTap();
        if (tap) {
          const hit = items.find((b) => hitRect(tap.x, tap.y, b));
          if (hit) { this.pauseSelected = items.indexOf(hit); this.pausedAction(hit.id); }
        } else {
          if (Input.up)   { Input.up = false;   this.pauseSelected = Math.max(0, this.pauseSelected - 1); }
          if (Input.down) { Input.down = false; this.pauseSelected = Math.min(items.length - 1, this.pauseSelected + 1); }
          if (Input.consumeConfirm()) this.pausedAction(items[this.pauseSelected].id);
          else if (Input.consumePause()) this.resumeGame();
        }
      } else if (this.state === 'dying') {
        // 按 R 可跳过死亡动画，立即重试本关
        if (Input.consumeRestart()) {
          Sound.click();
          this.retryLevel();
        } else {
          // 死亡延迟动画（0.5 秒）后再弹出结算界面
          this.dyingTimer--;
          player.vy = Math.min(player.vy + PHYS.GRAVITY, PHYS.MAX_FALL);
          player.y += player.vy;
          Particles.update();
          if (this.dyingTimer <= 0) {
            this.state = 'dead';
            this.deadFade = 0;
          }
        }
      } else if (this.state === 'dead') {
        if (this.deadFade < 1) this.deadFade = Math.min(1, this.deadFade + 0.08);
        if (this.deadFade >= 0.6) {
          const btns = UI.deadButtons();
          const tap = Input.consumeTap();
          let choice = null;
          if (tap) {
            const hit = btns.find((b) => hitRect(tap.x, tap.y, b));
            if (hit) choice = hit.id;
          }
          if (Input.consumeConfirm() || Input.consumeRestart()) choice = 'retry';
          if (Input.consumePause()) choice = 'menu';
          if (choice === 'retry') {
            Sound.click();
            if (this.endless) {
              if (this.daily) this.startDaily();
              else this.startEndless();   // 无尽重开一整局
            } else this.retryLevel();
          } else if (choice === 'menu') { Sound.click(); this.goMenu(); }
        }
      } else if (this.state === 'win') {
        if (this.winFade < 1) this.winFade = Math.min(1, this.winFade + 0.08);
        const btns = UI.winButtons();
        const tap = Input.consumeTap();
        let choice = null;
        if (tap) {
          const hit = btns.find((b) => hitRect(tap.x, tap.y, b));
          if (hit) choice = hit.id;
        }
        if (Input.consumeConfirm() || Input.consumeRestart()) choice = 'next';
        if (choice === 'next') { Sound.click(); this.nextLevel(); }
        else if (choice === 'menu') { Sound.click(); this.goMenu(); }
      } else if (this.state === 'gameComplete') {
        if (this.winFade < 1) this.winFade = Math.min(1, this.winFade + 0.08);
        this.updateConfetti();
        const btns = UI.completeButtons();
        const tap = Input.consumeTap();
        let choice = null;
        if (tap) {
          const hit = btns.find((b) => hitRect(tap.x, tap.y, b));
          if (hit) choice = hit.id;
        }
        if (Input.consumeConfirm() || Input.consumeRestart()) choice = 'menu';
        if (choice === 'menu') { Sound.click(); this.goMenu(); }
      }

      // 联机房主：定期向客人广播世界快照
      if (this.multiplayer && Net.role === 'host' && Net.inGame) Net.hostTick();
      Input.clearFrame();
    },

    // 通关庆祝彩带（屏幕空间粒子，数量有上限，不累积内存）
    updateConfetti() {
      const colors = ['#ffd23f', '#ff5b6e', '#7ff0a8', '#8adcff', '#a855f7', '#ffe28a'];
      if (this.confetti.length < 140) {
        for (let i = 0; i < 2; i++) {
          this.confetti.push({
            x: Math.random() * VIEW.W,
            y: -12,
            vx: (Math.random() - 0.5) * 1.8,
            vy: 1.2 + Math.random() * 2.2,
            size: 3 + Math.random() * 4,
            color: colors[Math.floor(Math.random() * colors.length)]
          });
        }
      }
      for (const c of this.confetti) {
        c.x += c.vx;
        c.y += c.vy;
        c.vy = Math.min(4.5, c.vy + 0.03);
      }
      this.confetti = this.confetti.filter((c) => c.y < VIEW.H + 16);
    }
  };

  // ============================================================

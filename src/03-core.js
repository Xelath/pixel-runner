  // 3. 通用工具
  // ============================================================
  const canvas = document.getElementById('game');
  const mainCtx = canvas.getContext('2d');
  // ctx 可临时切换到离屏画布，用于精灵缓存
  let ctx = mainCtx;
  ctx.imageSmoothingEnabled = false;

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // 普通/飞行/尖刺怪只有两帧步态与生死状态，预渲染后直接 drawImage
  const ENEMY_SPRITE_CACHE = Object.create(null);
  function enemySprite(type, step, alive, draw) {
    const key = type + '_' + step + '_' + (alive ? 1 : 0);
    let c = ENEMY_SPRITE_CACHE[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = 40;
      c.height = 40;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      const old = ctx;
      ctx = cc;
      try { draw(4, 10); } finally { ctx = old; }
      ENEMY_SPRITE_CACHE[key] = c;
    }
    return c;
  }

  // 轴对齐包围盒（AABB）相交检测
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // 玩家是否“从上方”落到目标上（用于踩头判定）
  // 用移动前的 prevY 判断上一帧脚底位置，避免 vy 被平台碰撞清零后误判；
  // 阈值取目标垂直中心，快速下落穿透时仍可识别为踩头。
  function isStomping(player, target) {
    const prevBottom = player.prevY + player.h;
    return player.vy >= 0 && prevBottom <= target.y + target.h * 0.5;
  }

  function drawText(str, x, y, size, color, align, bold) {
    ctx.font = (bold === false ? '' : 'bold ') + size +
      'px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  // ============================================================
  // 3.5 本地存档 / 音频 / 粒子 / UI 布局（第三阶段新增）
  // ============================================================

  // ---- 本地存档（localStorage）----
  // 每日挑战：以本地日期作为种子，保证同一天所有玩家拿到相同布局
  function dailyKey() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  function dailySeed(key) {
    const s = key || dailyKey();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dailyBestRoom() {
    const d = Storage.data.daily;
    return (d && d.date === dailyKey()) ? (d.bestRoom | 0) : 0;
  }

  const Storage = {
    data: {
      sfxOn: true,      // 音效开关
      musicOn: true,    // 音乐开关
      cleared: false,   // 是否全游戏通关
      bestCoins: 0,     // 历史最高金币收集数
      unlocked: 0,      // 已解锁的最高关卡索引（0 起）
      levelBests: [],   // 每关记录：[{ cleared, coins, time }]
      gems: [],         // 每关宝石是否已收集
      skin: 0,          // 当前角色配色皮肤索引
      difficulty: 'normal', // 难度：casual / normal / hard
      lowQuality: false, // 低画质模式（关闭粒子与视差）
      musicVol: 0.22,   // 背景音乐音量 0~1
      sfxVol: 1,        // 音效音量 0~1
      coward: false,    // 胆小鬼模式（难度大减）
      magnetOn: true,   // 金币磁铁开关（关闭后已购买的磁铁永久能力失效，临时道具不受影响）
      keys: { jump: 'Space', dash: 'ShiftLeft' }, // 可自定义按键
      medals: [],       // 每关奖章（由 levelBests 内记录同步展示）
      bankCoins: 0,     // 可支配金币（通关奖励，能力商店消费）
      upgrades: { magnet: 0, shield: 0, dash: 0, jump: 0 }, // 永久能力等级
      endlessBest: 0,   // 无尽模式历史最远房间
      daily: { date: '', bestRoom: 0, bestCoins: 0 } // 每日挑战记录
    },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) Object.assign(this.data, JSON.parse(raw));
      } catch (e) { /* 隐私模式 / 受限环境下静默降级 */ }

      // 兼容旧存档：统一补齐 32 关记录与宝石进度
      const list = [];
      for (let i = 0; i < LEVEL_COUNT; i++) {
        const src = (this.data.levelBests && this.data.levelBests[i]) || null;
        list.push({
          cleared: !!(src && src.cleared),
          coins: (src && src.coins) || 0,
          time: (src && src.time) || 0,
          medals: Object.assign({ clear: false, coins: false, gem: false, noHit: false },
                                (src && src.medals) || {})
        });
      }
      if (this.data.cleared) {
        for (let i = 0; i < LEVEL_COUNT; i++) list[i].cleared = true;
        this.data.unlocked = LEVEL_COUNT - 1;
      }
      this.data.levelBests = list;
      this.data.medals = list.map((b) => b.medals);

      const gems = [];
      for (let i = 0; i < LEVEL_COUNT; i++) {
        gems.push(!!(this.data.gems && this.data.gems[i]));
      }
      this.data.gems = gems;

      if (!DIFFICULTY[this.data.difficulty]) this.data.difficulty = 'normal';
      this.data.skin = Math.max(0, Math.min(SKINS.length - 1, this.data.skin | 0));
      if (!this.skinUnlocked(this.data.skin)) this.data.skin = 0;
      this.data.lowQuality = !!this.data.lowQuality;
      this.data.coward = !!this.data.coward;
      this.data.magnetOn = this.data.magnetOn === undefined ? true : !!this.data.magnetOn;
      this.data.musicVol = Math.max(0, Math.min(1,
        this.data.musicVol === undefined ? AUDIO.MUSIC_VOLUME : +this.data.musicVol));
      this.data.sfxVol = Math.max(0, Math.min(1,
        this.data.sfxVol === undefined ? 1 : +this.data.sfxVol));
      this.data.keys = Object.assign(
        { jump: 'Space', dash: 'ShiftLeft' },
        this.data.keys || {}
      );
      this.data.medals = list.map((b) => b.medals);

      // 能力商店 / 无尽模式存档兼容（旧存档自动补齐）
      this.data.bankCoins = Math.max(0, this.data.bankCoins | 0);
      const up = Object.assign({ magnet: 0, shield: 0, dash: 0, jump: 0 },
                               this.data.upgrades || {});
      for (const u of UPGRADES) {
        up[u.id] = Math.max(0, Math.min(u.max, up[u.id] | 0));
      }
      this.data.upgrades = up;
      this.data.endlessBest = Math.max(0, this.data.endlessBest | 0);
      // 每日挑战存档兼容
      if (!this.data.daily || typeof this.data.daily !== 'object') {
        this.data.daily = { date: '', bestRoom: 0, bestCoins: 0 };
      }
      this.data.daily.date = String(this.data.daily.date || '');
      this.data.daily.bestRoom = Math.max(0, this.data.daily.bestRoom | 0);
      this.data.daily.bestCoins = Math.max(0, this.data.daily.bestCoins | 0);
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    // 已收集宝石总数
    gemsCount() {
      return this.data.gems.filter(Boolean).length;
    },
    // 指定配色是否已解锁
    skinUnlocked(index) {
      const s = SKINS[index];
      return !!s && this.gemsCount() >= s.unlock;
    },
    // 已解锁的配色索引（按 SKINS 顺序）
    availableSkins() {
      const g = this.gemsCount();
      const list = [];
      for (let i = 0; i < SKINS.length; i++) {
        if (SKINS[i].unlock <= g) list.push(i);
      }
      return list;
    },
    // 当前难度配置
    diff() {
      return DIFFICULTY[this.data.difficulty] || DIFFICULTY.normal;
    },
    // 胆小鬼模式是否开启
    coward() {
      return !!this.data.coward;
    },
    // 出发 / 重试时的生命数（胆小鬼模式固定满 5 颗心；生命强化每级 +1）
    startLives() {
      const base = this.coward() ? COWARD.LIVES : this.diff().lives;
      return base + this.upgrade('vitality');
    },
    // 生命上限（基础 5 + 生命强化等级）
    heartCap() {
      return HEART_CAP + this.upgrade('vitality');
    },
    // 受伤后的无敌帧（胆小鬼模式加倍）
    invulnFrames() {
      return Math.round(PHYS.INVULN_FRAMES *
        (this.coward() ? COWARD.INVULN_MUL : 1));
    },
    // 敌人移速倍率（难度 × 胆小鬼模式）
    enemySpeedMul() {
      return this.diff().enemySpeed *
        (this.coward() ? COWARD.ENEMY_SPEED : 1);
    },
    // 已通关关卡数（用于进度百分比）
    clearedCount() {
      return this.data.levelBests.filter((b) => b && b.cleared).length;
    },
    // 奖章总数（每关 4 枚：通关 / 全金币 / 宝石 / 无伤）
    medalCount() {
      let n = 0;
      for (const b of this.data.levelBests) {
        const m = (b && b.medals) || {};
        for (const k of ['clear', 'coins', 'gem', 'noHit']) if (m[k]) n++;
      }
      return n;
    },
    // 永久能力等级
    upgrade(id) {
      return (this.data.upgrades && this.data.upgrades[id]) || 0;
    },
    // 下一级价格（已满级返回 0）
    upgradePrice(u) {
      const lv = this.upgrade(u.id);
      return lv >= u.max ? 0 : u.prices[lv];
    },
    // 获得可支配金币（通关 / 无尽结算）
    earnBank(n) {
      if (!n || n <= 0) return;
      this.data.bankCoins += n;
      this.save();
    }
  };

  // 关卡短名（去掉“第 N 关 · ”前缀，供紧凑卡片 / 图鉴使用）
  function levelShortName(index) {
    const full = LEVELS[index] ? LEVELS[index].name : '';
    const parts = full.split(' · ');
    return parts.length > 1 ? parts.slice(1).join(' · ') : full;
  }

  // 帧数 → mm:ss（用于结算与记录展示）
  function formatTime(frames) {
    if (!frames || frames <= 0) return '—';
    const total = Math.floor(frames / 60);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // 按键代码 → 便于阅读的名称
  function keyLabel(code) {
    if (!code) return '—';
    if (code === 'Space') return '空格';
    if (code === 'ShiftLeft') return '左Shift';
    if (code === 'ShiftRight') return '右Shift';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Arrow')) return code.slice(5);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  // ---- 8bit 音效（Web Audio API 纯代码生成，无外部音频文件）----
  const Sound = {
    ctx: null, master: null, sfxBus: null, musicBus: null, ready: false,

    // 音量变更后同步到音频总线（设置页实时生效）
    setVolumes() {
      if (!this.ready) return;
      this.sfxBus.gain.value = Storage.data.sfxVol;
      this.musicBus.gain.value = Storage.data.musicVol;
    },

    // 首次用户手势时初始化（浏览器自动播放策略要求）
    unlock() {
      if (this.ready) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = AUDIO.MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = Storage.data.sfxVol;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = Storage.data.musicVol;
      this.musicBus.connect(this.master);
      this.ready = true;
    },

    // 单个方波音：可带频率滑音（freqEnd）
    tone(freq, dur, vol, freqEnd, type) {
      if (!this.ready || !Storage.data.sfxOn) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    },

    // 琶音（连续音符）
    arp(freqs, step, vol, type) {
      if (!this.ready || !Storage.data.sfxOn) return;
      const base = this.ctx.currentTime;
      freqs.forEach((f, i) => {
        const t = base + i * step;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.95 + 0.02);
        o.connect(g); g.connect(this.sfxBus);
        o.start(t); o.stop(t + step + 0.02);
      });
    },

    // 各类音效事件
    jump()       { this.tone(440, 0.09, 0.16, 660); },
    doubleJump() { this.tone(620, 0.10, 0.16, 940); },
    dash()       { this.tone(880, 0.12, 0.14, 320, 'sawtooth'); },
    land()       { this.tone(180, 0.06, 0.10, 110); },
    coin()       { this.arp([988, 1319], 0.045, 0.16); },
    stomp()      { this.tone(500, 0.10, 0.16, 180); },
    hurt()       { this.tone(320, 0.16, 0.18, 120); },
    death()      { this.arp([392, 330, 262, 196], 0.11, 0.18); },
    spike()      { this.tone(240, 0.08, 0.16, 80); },
    win()        { this.arp([523, 659, 784, 1046], 0.09, 0.18); },
    bossHit()    { this.tone(180, 0.12, 0.20, 90); },
    bossDown()   { this.arp([262, 220, 175, 131, 98], 0.10, 0.20); },
    complete()   { this.arp([523, 659, 784, 1046, 1319, 1046, 1319], 0.12, 0.20); },
    click()      { this.tone(660, 0.04, 0.10); },
    pause()      { this.tone(420, 0.05, 0.10); },
    // 第四阶段新增
    checkpoint() { this.arp([659, 880, 1319], 0.06, 0.18); },   // 检查点激活
    bounce()     { this.tone(300, 0.14, 0.16, 780); },          // 弹跳板弹起
    drop()       { this.tone(220, 0.06, 0.10, 140); },          // 单向平台下穿
    enrage()     { this.arp([196, 165, 131, 98], 0.10, 0.20, 'sawtooth'); }, // Boss 狂暴
    gem()        { this.arp([784, 1046, 1319, 1568], 0.07, 0.20); },     // 宝石收集
    heart()      { this.arp([523, 784, 1046], 0.07, 0.16); },            // 爱心拾取
    power()      { this.arp([392, 523, 659, 784], 0.06, 0.18); },        // 变大果实
    shrink()     { this.tone(392, 0.16, 0.16, 180, 'sawtooth'); },       // 受伤变小
    laser()      { this.tone(880, 0.10, 0.10, 1320, 'sawtooth'); },       // 激光发射
    gate()       { this.arp([330, 262, 196], 0.09, 0.16); }              // 机关门开启
  };

  // ---- 8bit 循环背景音乐（轻快旋律 + 低音）----
  const Music = {
    timer: null, step: 0, nextTime: 0, playing: false,
    // 三套主题 BGM：1-11 关轻快 / 12-22 关低沉 / 23-32 关空灵
    TRACKS: [
      {
        melody: [
          523.25, 659.25, 783.99, 659.25, 440.00, 523.25, 659.25, 523.25,
          698.33, 880.00, 1046.50, 880.00, 783.99, 659.25, 523.25, 392.00
        ],
        bass: [130.81, 174.61, 196.00, 130.81]
      },
      {
        melody: [
          392.00, 440.00, 523.25, 440.00, 349.23, 392.00, 523.25, 392.00,
          329.63, 415.20, 466.16, 415.20, 349.23, 293.66, 261.63, 196.00
        ],
        bass: [110.00, 130.81, 98.00, 87.31]
      },
      {
        melody: [
          659.25, 783.99, 880.00, 1046.50, 783.99, 659.25, 523.25, 440.00,
          698.33, 880.00, 1174.66, 880.00, 783.99, 659.25, 523.25, 392.00
        ],
        bass: [146.83, 174.61, 196.00, 130.81]
      }
    ],
    track: 0,

    setLevel(index) {
      this.track = index < 11 ? 0 : (index < 22 ? 1 : 2);
      this.step = 0;
    },

    start() {
      if (!Sound.ready || !Storage.data.musicOn || this.playing) return;
      this.playing = true;
      this.step = 0;
      this.nextTime = Sound.ctx.currentTime + 0.05;
      // 每 100ms 预排 0.25s 的音符，主线程开销极低
      this.timer = setInterval(() => this.schedule(), 100);
      this.schedule();
    },
    stop() {
      this.playing = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },
    schedule() {
      if (!this.playing) return;
      const ctx = Sound.ctx;
      while (this.nextTime < ctx.currentTime + 0.25) {
        this.playStep(this.step, this.nextTime);
        const tr = this.TRACKS[this.track];
        this.step = (this.step + 1) % tr.melody.length;
        this.nextTime += AUDIO.BEAT;
      }
    },
    playStep(i, t) {
      const ctx = Sound.ctx;
      const tr = this.TRACKS[this.track];
      const f = tr.melody[i];
      if (f > 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + AUDIO.BEAT * 0.9);
        o.connect(g); g.connect(Sound.musicBus);
        o.start(t); o.stop(t + AUDIO.BEAT);
      }
      if (i % 4 === 0) {
        const bf = tr.bass[(i / 4) % tr.bass.length];
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(bf, t);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + AUDIO.BEAT * 1.8);
        o.connect(g); g.connect(Sound.musicBus);
        o.start(t); o.stop(t + AUDIO.BEAT * 2);
      }
    }
  };

  // ---- 粒子系统 ----
  const Particles = {
    list: [],
    spawn(x, y, count, opt) {
      if (Storage.data.lowQuality) return;    // 低画质模式：关闭粒子特效
      for (let i = 0; i < count; i++) {
        if (this.list.length >= PARTICLES.CAP) break;
        const ang = (opt && opt.angle !== undefined)
          ? opt.angle + (Math.random() - 0.5) * (opt.spread || 0)
          : Math.random() * Math.PI * 2;
        const spd = ((opt && opt.speed) || 3) * (0.5 + Math.random());
        const life = (opt && opt.life) || 26;
        this.list.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - ((opt && opt.up) || 0),
          life, maxLife: life,
          size: (opt && opt.size) || 3,
          color: (opt && opt.color) || '#ffd23f',
          gravity: (opt && opt.gravity !== undefined) ? opt.gravity : 0.25
        });
      }
    },
    coinBurst(x, y)  { this.spawn(x, y, PARTICLES.COIN, { color: '#ffd23f', speed: 3, gravity: 0.3, life: 24, size: 3 }); },
    enemyChunks(x, y) { this.spawn(x, y, PARTICLES.ENEMY, { color: '#e14b4b', speed: 3.2, gravity: 0.35, life: 28, size: 4 }); },
    dust(x, y)       { this.spawn(x, y, PARTICLES.DUST, { color: '#cbd5e1', speed: 1.6, gravity: 0.2, life: 18, size: 2, up: 0.6 }); },
    bossBurst(x, y)  { this.spawn(x, y, PARTICLES.BOSS, { color: '#a855f7', speed: 4, gravity: 0.3, life: 40, size: 5 }); },
    // 冲刺收尾气流
    dashTrail(x, y, dir) {
      this.spawn(x, y, 6, { color: '#8adcff', speed: 2.2, gravity: 0.05, life: 16, size: 3,
                            angle: dir > 0 ? Math.PI : 0, spread: 0.7 });
    },
    // 弹跳板向上的气流
    bounceDraft(x, y) {
      this.spawn(x, y, 8, { color: '#bfffd8', speed: 1.4, gravity: -0.03, life: 24, size: 2, up: 3.2 });
    },
    // 宝石收集爆散
    gemBurst(x, y) {
      this.spawn(x, y, 12, { color: '#9be2ff', speed: 3.4, gravity: 0.1, life: 30, size: 3 });
    },
    // 爱心拾取爆散
    heartBurst(x, y) {
      this.spawn(x, y, 10, { color: '#ff7aa8', speed: 2.6, gravity: 0.12, life: 26, size: 3 });
    },
    // 变大果实 / 变小爆散
    fruitBurst(x, y) {
      this.spawn(x, y, 12, { color: '#ffb23f', speed: 3.2, gravity: 0.12, life: 28, size: 3 });
    },
    shrinkBurst(x, y) {
      this.spawn(x, y, 10, { color: '#ffffff', speed: 2.8, gravity: 0.15, life: 20, size: 2 });
    },

    update() {
      for (const p of this.list) {
        p.x += p.vx; p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.life--;
      }
      if (this.list.length) this.list = this.list.filter((p) => p.life > 0);
    },
    draw() {
      for (const p of this.list) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        rect(p.x, p.y, p.size, p.size, p.color);
      }
      ctx.globalAlpha = 1;
    },
    clear() { this.list.length = 0; }
  };

  // ---- UI 布局（渲染与点击命中检测共用同一份坐标）----
  const UI = {
    menuButtons() {
      const w = 280, h = 34, x = VIEW.W / 2 - w / 2;
      const daily = dailyBestRoom();
      return [
        { id: 'start',       label: '开始游戏', x, y: 164, w, h },
        { id: 'endless',     label: '无尽模式', x, y: 202, w, h },
        { id: 'daily',       label: '每日挑战' +
            (daily > 0 ? ' · 今日最佳 ' + daily + ' 间' : ''), x, y: 240, w, h },
        { id: 'multiplayer', label: '多人联机', x, y: 278, w, h },
        { id: 'select',      label: '选择关卡', x, y: 316, w, h },
        { id: 'shop',        label: '能力商店', x, y: 354, w, h },
        { id: 'gallery',     label: '收集图鉴', x, y: 392, w, h },
        { id: 'help',        label: '操作说明', x, y: 430, w, h },
        { id: 'settings',    label: '设置',     x, y: 468, w, h }
      ];
    },
    // 能力商店行（7 项永久能力 + 返回，紧凑布局）
    shopRows() {
      const w = 560, h = 40, x = VIEW.W / 2 - w / 2;
      const rows = [];
      for (let i = 0; i < UPGRADES.length; i++) rows.push({ x, y: 152 + i * 44, w, h });
      return UPGRADES.map((u, i) => ({ id: u.id, ...rows[i] })).concat([
        { id: 'back', label: '返回', x: VIEW.W / 2 - 100, y: 462, w: 200, h: 34 }
      ]);
    },
    // 关卡开始前的道具选择卡片（4 选 1）与跳过按钮
    itemCards() {
      const w = 190, h = 132, gap = 20;
      const x0 = (VIEW.W - (ITEMS.length * w + (ITEMS.length - 1) * gap)) / 2;
      return ITEMS.map((it, i) => ({
        index: i, id: it.id,
        x: x0 + i * (w + gap), y: 226, w, h
      }));
    },
    itemSkip() {
      const w = 220, h = 34;
      return { id: 'skip', x: VIEW.W / 2 - w / 2, y: 396, w, h };
    },
    // 音量行的「− / 百分比 / +」区域（渲染与点击命中共用）
    volumeZones(r) {
      const bw = 30, bh = 20, gap = 8, valueW = 50;
      const gx = r.x + r.w - 26 - (bw * 2 + gap * 2 + valueW);
      const y = r.y + (r.h - bh) / 2;
      return {
        minus: { x: gx, y, w: bw, h: bh },
        plus:  { x: gx + bw + gap + valueW + gap, y, w: bw, h: bh },
        valueX: gx + bw + gap + valueW / 2
      };
    },
    settingsRows() {
      const w = 340, h = 26, x = VIEW.W / 2 - w / 2;
      const rows = [];
      for (let i = 0; i < 13; i++) rows.push({ x, y: 140 + i * 27, w, h });
      return [
        { id: 'sfx', ...rows[0] }, { id: 'music', ...rows[1] },
        { id: 'musicVol', ...rows[2] }, { id: 'sfxVol', ...rows[3] },
        { id: 'full', ...rows[4] }, { id: 'quality', ...rows[5] },
        { id: 'difficulty', ...rows[6] }, { id: 'coward', ...rows[7] },
        { id: 'magnet', ...rows[8] }, { id: 'skin', ...rows[9] },
        { id: 'keyJump', ...rows[10] }, { id: 'keyDash', ...rows[11] },
        { id: 'back', ...rows[12] }
      ];
    },
    // 选关列数：分篇章后固定 4 列 × 4 行
    levelCols() {
      return 4;
    },
    // 篇章页签：第一篇章 1-16 / 第二篇章 17-32
    actTabs() {
      const w = 168, h = 30, gap = 16;
      const x0 = (VIEW.W - (w * 2 + gap)) / 2;
      return [
        { id: 'act0', act: 0, label: '第一篇章', sub: '1 - 16', x: x0, y: 146, w, h },
        { id: 'act1', act: 1, label: '第二篇章', sub: '17 - 32', x: x0 + w + gap, y: 146, w, h }
      ];
    },
    // 当前篇章的 16 张关卡卡片（4×4 大卡片）
    levelCards() {
      const act = Game.levelAct || 0;
      const cols = this.levelCols();
      const w = 188, h = 64, gap = 18, rowGap = 8;
      const x0 = (VIEW.W - (cols * w + (cols - 1) * gap)) / 2;
      const y0 = 190;
      const base = act * 16;
      const count = Math.min(16, LEVEL_COUNT - base);
      return Array.from({ length: count }, (_, i) => ({
        id: 'lv' + (base + i), index: base + i,
        x: x0 + (i % cols) * (w + gap),
        y: y0 + Math.floor(i / cols) * (h + rowGap),
        w, h
      }));
    },
    // 选关页返回按钮（独立于图鉴，避免挤占卡片区）
    levelBackButton() {
      const w = 200, h = 32;
      return { id: 'lback', label: '返回', x: VIEW.W / 2 - w / 2, y: 474, w, h };
    },
    backButton() {
      const w = 200, h = LEVEL_COUNT > 6 ? 36 : 42;
      return { id: 'back', label: '返回', x: VIEW.W / 2 - w / 2, y: LEVEL_COUNT > 6 ? 446 : 440, w, h };
    },
    // 收集图鉴 / 怪物图鉴 页签
    galleryTabs() {
      const w = 150, h = 30, gap = 16;
      const x0 = VIEW.W / 2 - w - gap / 2;
      return [
        { id: 'tabMedal', tab: 0, label: '奖章图鉴', x: x0, y: 92, w, h },
        { id: 'tabBeast', tab: 1, label: '怪物图鉴', x: x0 + w + gap, y: 92, w, h }
      ];
    },
    // 怪物图鉴卡片：8 种普通怪 4×2 网格
    bestiaryCards() {
      const cols = 4, w = 218, h = 134, gap = 12, rowGap = 8;
      const x0 = (VIEW.W - (cols * w + (cols - 1) * gap)) / 2;
      const y0 = 130;
      return BESTIARY.map((d, i) => ({
        ...d,
        x: x0 + (i % cols) * (w + gap),
        y: y0 + Math.floor(i / cols) * (h + rowGap),
        w, h
      }));
    },
    // Boss 图鉴卡片：3 张横版卡片
    bossCards() {
      const cols = 3, w = 296, h = 78, gap = 16;
      const x0 = (VIEW.W - (cols * w + (cols - 1) * gap)) / 2;
      const y = 426;
      return BOSS_BESTIARY.map((d, i) => ({
        ...d,
        x: x0 + i * (w + gap), y, w, h
      }));
    },
    // 收集图鉴卡片：32 关 8×4 紧凑网格
    galleryCards() {
      const wide = LEVEL_COUNT > 16;
      const cols = wide ? 8 : 4;
      const w = wide ? 104 : 190;
      const h = wide ? 58 : 70;
      const gap = wide ? 8 : 24;
      const rowGap = 6;
      const x0 = (VIEW.W - (cols * w + (cols - 1) * gap)) / 2;
      return Array.from({ length: LEVEL_COUNT }, (_, i) => ({
        index: i,
        x: x0 + (i % cols) * (w + gap),
        y: 134 + Math.floor(i / cols) * (h + rowGap),
        w, h
      }));
    },
    pauseItems() {
      const w = 280, h = 48, x = VIEW.W / 2 - w / 2;
      return [
        { id: 'resume',     label: '继续游戏',       x, y: 200, w, h },
        { id: 'checkpoint', label: '回到上一个检查点', x, y: 256, w, h },
        { id: 'restart',    label: '重新开始本关',   x, y: 312, w, h },
        { id: 'menu',       label: '返回主菜单',     x, y: 368, w, h }
      ];
    },
    deadButtons() {
      const w = 260, h = 46, x = VIEW.W / 2 - w / 2;
      return [
        { id: 'retry', label: Game.endless ? '重新开始无尽' : '重试本关', x, y: 330, w, h },
        { id: 'menu',  label: '返回主菜单', x, y: 388, w, h }
      ];
    },
    winButtons() {
      const w = 260, h = 46, x = VIEW.W / 2 - w / 2;
      return [
        { id: 'next', label: Game.endless ? '进入下一房间' : '进入下一关', x, y: 356, w, h },
        { id: 'menu', label: Game.endless ? '结束本局' : '返回主菜单', x, y: 404, w, h }
      ];
    },
    completeButtons() {
      const w = 260, h = 46;
      return [{ id: 'menu', label: '返回主菜单', x: VIEW.W / 2 - w / 2, y: 388, w, h }];
    },
    hudIcons() {
      return {
        pause:      { x: VIEW.W - 48, y: 14, w: 32, h: 32 },
        fullscreen: { x: VIEW.W - 48, y: 52, w: 32, h: 32 }
      };
    },
    // 虚拟按键：左下方向键，右下跳跃（低）+ 冲刺（高、偏左），错位防误触
    touchButtons() {
      const B = TOUCH.BTN, S = TOUCH.SMALL, M = TOUCH.MARGIN, G = TOUCH.GAP;
      const bottom = VIEW.H - M - B;
      return [
        { id: 'left',  x: M,           y: bottom, w: B, h: B },
        { id: 'right', x: M + B + G,   y: bottom, w: B, h: B },
        { id: 'jump',  x: VIEW.W - M - B,             y: bottom,       w: B, h: B },
        { id: 'dash',  x: VIEW.W - M - B - G - S,     y: bottom - 62,  w: S, h: S }
      ];
    }
  };

  // 点是否落在矩形内（菜单/按钮/触控命中检测）
  function hitRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // 当前是否处于全屏（兼容各前缀）
  function isFullscreen() {
    const doc = document;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
  }

  // 切换浏览器全屏（兼容 Chrome / Edge / Safari / Electron）
  function toggleFullscreen() {
    const doc = document;
    const el = doc.documentElement;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!fsEl) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) {
        try { req.call(el); } catch (e) {}
      }
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) {
        try { exit.call(doc); } catch (e) {}
      }
    }
  }

  // ============================================================
  // 3.8 像素绘制 / 离屏预渲染（第四阶段性能优化）
  // ============================================================

  // 通用矩形绘制（支持指定目标画布，便于离屏预渲染）
  function pRect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // 每套主题对应的地形材质（顶部色 / 主体色 / 暗边 / 发光细节）
  const TERRAIN_PALETTES = {
    '暖绿': { mat: 'grass',   top: '#7fe08a', top2: '#46a85a', body: '#a87548', light: '#c99a6a', dark: '#7a5132', edge: '#5a3a22', glow: '#ffe28a' },
    '土黄': { mat: 'sand',    top: '#e8c58a', top2: '#c99b5c', body: '#b08954', light: '#d3ad78', dark: '#8a683c', edge: '#6a4a28', glow: '#ffd89a' },
    '灰紫': { mat: 'stone',   top: '#9a86b8', top2: '#6a5a86', body: '#6d5c88', light: '#8a78a8', dark: '#4f4268', edge: '#3a2f4a', glow: '#d8c2ff' },
    '深蓝': { mat: 'metal',   top: '#6a9ac8', top2: '#3a6a98', body: '#2f5478', light: '#4a7aa0', dark: '#1f3852', edge: '#16283a', glow: '#9be2ff' },
    '暗红': { mat: 'ember',   top: '#8a4a52', top2: '#5a2f38', body: '#4a242c', light: '#6a3640', dark: '#30161c', edge: '#220f14', glow: '#ff9a8a' },
    '深黑': { mat: 'stone',   top: '#4a4c5a', top2: '#2a2c3a', body: '#23252f', light: '#3a3d4a', dark: '#161820', edge: '#101218', glow: '#cfd8ff' },
    '熔岩': { mat: 'ember',   top: '#8a3a2a', top2: '#5a2418', body: '#3a1812', light: '#5a2a1e', dark: '#240c08', edge: '#180806', glow: '#ffb066' },
    '天空': { mat: 'grass',   top: '#9ed4ff', top2: '#5ea8e0', body: '#6a9ec4', light: '#8ab8d8', dark: '#4a7a9e', edge: '#2a4a5c', glow: '#e8f8ff' },
    '水晶': { mat: 'crystal', top: '#b8a2f0', top2: '#7a68c0', body: '#5a4a8c', light: '#8a78c0', dark: '#3a3168', edge: '#241d40', glow: '#d8c2ff' },
    '冰川': { mat: 'ice',     top: '#e8f8ff', top2: '#a8dcf0', body: '#7fc0dc', light: '#b8e8f8', dark: '#5a98b8', edge: '#3a6a88', glow: '#ffffff' },
    '废墟': { mat: 'stone',   top: '#9a8a78', top2: '#6a5a4c', body: '#5a4a3e', light: '#7a6656', dark: '#3f342c', edge: '#2a221c', glow: '#ffe0a0' },
    '星海': { mat: 'metal',   top: '#4a5a8a', top2: '#2a3458', body: '#1f2848', light: '#3a4a78', dark: '#121830', edge: '#0a0e1c', glow: '#aaccff' },
    '熔火': { mat: 'ember',   top: '#a84a2a', top2: '#6a2010', body: '#4a1408', light: '#7a2a14', dark: '#2a0a04', edge: '#1a0502', glow: '#ff8a3f' },
    '地宫': { mat: 'stone',   top: '#5a7a4a', top2: '#3a5a2e', body: '#2f3d2a', light: '#4a5e40', dark: '#1e281a', edge: '#141c10', glow: '#b8ff9a' },
    '极光': { mat: 'ice',     top: '#b8f0e8', top2: '#6ac8d8', body: '#3a7a8c', light: '#6aaabc', dark: '#24505c', edge: '#163840', glow: '#d8fffa' },
    '星核': { mat: 'crystal', top: '#c8a2f8', top2: '#7a4ac0', body: '#3a2a5e', light: '#6a4a9e', dark: '#241a40', edge: '#140e24', glow: '#ffd1ff' }
  };
  function terrainStyle() {
    const th = THEMES[(Game.themeIndex || 0) % THEMES.length] || THEMES[0];
    return TERRAIN_PALETTES[th.name] || TERRAIN_PALETTES['暖绿'];
  }

  // 地面平台像素画法（按主题材质绘制，砖块 / 冰层 / 金属 / 熔岩裂纹等）
  function drawGroundShape(g, p) {
    const s = terrainStyle();
    const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
    pRect(g, x, y, w, 5, s.top);
    pRect(g, x, y + 5, w, 3, s.top2);
    for (let by = y + 8; by < y + h - 4; by += 12) {
      const odd = Math.floor((by - y - 8) / 12) % 2 === 1;
      for (let bx = x; bx < x + w; bx += 24) {
        const ox = odd ? bx + 12 : bx;
        const bw = Math.min(22, x + w - ox);
        if (bw <= 0) continue;
        pRect(g, ox, by, bw, 10, s.body);
        pRect(g, ox, by, bw, 2, s.light);
        pRect(g, ox, by + 8, bw, 2, s.dark);
      }
    }
    pRect(g, x, y + h - 4, w, 4, s.edge);
    // 材质细节
    if (s.mat === 'grass') {
      for (let bx = x + 10; bx < x + w - 4; bx += 28) {
        pRect(g, bx, y - 2, 3, 2, s.top);
        pRect(g, bx + 5, y - 3, 2, 3, s.top2);
      }
    } else if (s.mat === 'ice') {
      for (let bx = x + 8; bx < x + w; bx += 44) {
        pRect(g, bx, y + 9, 2, 10, s.light);
        pRect(g, bx + 2, y + 16, 8, 2, s.top);
      }
    } else if (s.mat === 'ember') {
      for (let bx = x + 12; bx < x + w; bx += 56) {
        pRect(g, bx, y + 10, 2, 8, s.glow);
        pRect(g, bx + 2, y + 16, 7, 2, s.glow);
        pRect(g, bx + 9, y + 18, 2, 5, s.glow);
      }
    } else if (s.mat === 'metal') {
      pRect(g, x, y + 9, w, 1, s.dark);
      for (let bx = x + 6; bx < x + w; bx += 24) {
        pRect(g, bx, y + 10, 2, 2, s.top);
        pRect(g, bx + 16, y + 10, 2, 2, s.top);
      }
    } else if (s.mat === 'crystal') {
      for (let bx = x + 16; bx < x + w; bx += 64) {
        pRect(g, bx, y + 9, 2, 16, s.glow);
        pRect(g, bx + 2, y + 9, 8, 2, s.glow);
        pRect(g, bx - 4, y + 21, 10, 2, s.top);
      }
    } else if (s.mat === 'sand') {
      for (let by = y + 14; by < y + h - 6; by += 18) {
        pRect(g, x + 6, by, w - 12, 2, s.dark);
      }
    }
  }

  // 浮台像素画法（材质与地面一致，顶部保留高光）
  function drawLedgeShape(g, p) {
    const s = terrainStyle();
    const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
    pRect(g, x, y, w, h, s.body);
    pRect(g, x, y, w, 4, s.top);
    pRect(g, x, y + 4, w, 2, s.top2);
    pRect(g, x, y + h - 3, w, 3, s.dark);
    for (let bx = x + 6; bx < x + w; bx += 14) {
      pRect(g, bx, y + 5, 2, h - 8, s.dark);
    }
    if (s.mat === 'grass') {
      for (let bx = x + 8; bx < x + w - 4; bx += 24) {
        pRect(g, bx, y - 2, 3, 2, s.top);
      }
    } else if (s.mat === 'ice') {
      pRect(g, x, y, 2, h, s.light);
      pRect(g, x + w - 2, y, 2, h, s.light);
      for (let bx = x + 12; bx < x + w - 6; bx += 30) {
        pRect(g, bx, y + 6, 2, 6, s.glow);
      }
    } else if (s.mat === 'metal') {
      for (let bx = x + 4; bx < x + w; bx += 18) {
        pRect(g, bx, y + 6, 2, 2, s.top);
        pRect(g, bx, y + h - 5, 2, 2, s.top);
      }
    } else if (s.mat === 'ember') {
      for (let bx = x + 10; bx < x + w; bx += 40) {
        pRect(g, bx, y + 6, 2, 5, s.glow);
        pRect(g, bx + 2, y + 10, 5, 2, s.glow);
      }
    } else if (s.mat === 'crystal') {
      for (let bx = x + 14; bx < x + w - 8; bx += 46) {
        pRect(g, bx, y + 6, 2, 7, s.glow);
        pRect(g, bx + 2, y + 6, 5, 2, s.glow);
      }
    }
  }

  function drawPlatformShape(g, p) {
    if (p.kind === 'ground') drawGroundShape(g, p);
    else drawLedgeShape(g, p);
  }

  // 视口裁剪：仅绘制相机视野（含两侧余量）内的对象
  function inView(x, w) {
    const pad = 80;
    return x + (w || 0) > Camera.x - pad && x < Camera.x + VIEW.W + pad;
  }

  // 静态平台离屏预渲染：按 1600px 分块懒加载，减少一次性大画布内存
  const StaticLayer = {
    CHUNK_W: 1600,
    canvas: null,
    chunks: [],
    width: 0,
    failed: false,
    build() {
      this.canvas = null;
      this.chunks = [];
      this.width = Math.max(VIEW.W, Math.ceil(Level.data ? Level.data.width : VIEW.W));
      this.failed = false;
    },
    ensureChunk(i) {
      if (this.chunks[i]) return this.chunks[i];
      if (this.failed) return null;
      const cx = i * this.CHUNK_W;
      const cw = Math.min(this.CHUNK_W, this.width - cx);
      if (cw <= 0) return null;
      try {
        const cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = VIEW.H;
        const g = cv.getContext('2d');
        if (!g) { this.failed = true; return null; }
        g.imageSmoothingEnabled = false;
        g.translate(-cx, 0);
        for (const p of Level.platforms) {
          if (p.move || p.fall || p.oneWay || p.gate) continue;
          if (p.x + p.w < cx || p.x > cx + cw) continue;
          drawPlatformShape(g, p);
        }
        this.chunks[i] = cv;
        return cv;
      } catch (e) {
        this.failed = true;
        return null;
      }
    },
    draw() {
      if (!this.failed) {
        const start = Math.max(0, Math.floor(Camera.x / this.CHUNK_W));
        const last = Math.ceil(this.width / this.CHUNK_W) - 1;
        const end = Math.min(Math.floor((Camera.x + VIEW.W - 1) / this.CHUNK_W), last);
        let ok = true;
        for (let i = start; i <= end; i++) {
          const cv = this.ensureChunk(i);
          if (!cv) { ok = false; break; }
          ctx.drawImage(cv, i * this.CHUNK_W, 0);
        }
        if (ok) return;
      }
      for (const p of Level.platforms) {
        if (p.move || p.fall || p.oneWay || p.gate) continue;
        if (!inView(p.x, p.w)) continue;
        drawPlatformShape(ctx, p);
      }
    }
  };

  // 小尺寸离屏瓦片（背景山脉 / 树）
  function makeTile(w, h, paint) {
    try {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      if (!g) return null;
      g.imageSmoothingEnabled = false;
      paint(g);
      return cv;
    } catch (e) {
      return null;
    }
  }

  const BgTiles = {
    mountain: null,
    tree: null,
    far: null,
    build(theme) {
      const th = theme || THEMES[0];
      // 最远层山影：220 间距循环，低透明度叠在天空上
      this.far = makeTile(220, 100, (g) => {
        g.globalAlpha = 0.34;
        for (let i = 0; i <= 220; i += 10) {
          const peak = Math.sin((i / 220) * Math.PI) * 72;
          pRect(g, i, 100 - peak, 10, peak, th.mountain);
        }
        g.globalAlpha = 1;
      });
      // 远景山丘：120 间距循环（按关卡主题取色）
      this.mountain = makeTile(140, 116, (g) => {
        for (let i = 0; i <= 140; i += 8) {
          const peak = Math.sin((i / 140) * Math.PI) * 110;
          pRect(g, i, 116 - peak, 8, peak, th.mountain);
        }
      });
      // 中景树林：90 间距循环
      this.tree = makeTile(90, 82, (g) => {
        pRect(g, 17, 46, 6, 36, th.trunk);
        for (let y = 0; y < 5; y++) {
          const rw = 36 - y * 6;
          pRect(g, 20 - rw / 2, 36 - y * 8, rw, 10, th.tree);
        }
      });
      this.theme = th;
    }
  };

  // ============================================================

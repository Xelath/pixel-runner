  // 10. 渲染模块
  // ============================================================
  const HEART_MAP = [
    '01100110', '11111111', '11111111',
    '01111110', '00111100', '00011000'
  ];

  // 黑暗视野遮罩（离屏绘制，避免 destination-out 直接擦除世界层）
  const DarkLayer = {
    canvas: null,
    g: null,
    build() {
      if (this.canvas) return;
      try {
        const cv = document.createElement('canvas');
        cv.width = VIEW.W;
        cv.height = VIEW.H;
        const g = cv.getContext('2d');
        if (!g) return;
        this.canvas = cv;
        this.g = g;
      } catch (e) { /* 离屏画布不可用时跳过黑暗遮罩 */ }
    },
    draw() {
      if (!this.g) return;
      const g = this.g;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, VIEW.W, VIEW.H);
      g.fillStyle = 'rgba(0, 0, 0, ' + DARK.ALPHA + ')';
      g.fillRect(0, 0, VIEW.W, VIEW.H);
      const px = player.x - Camera.x + player.w / 2;
      const py = player.y - Camera.y + player.h / 2;
      const flicker = 1 + Math.sin(Game.tick * 0.12) * 0.04;
      g.globalCompositeOperation = 'destination-out';
      const rings = [
        [DARK.LIGHT * flicker, 0.18],
        [DARK.LIGHT * 0.76 * flicker, 0.22],
        [DARK.LIGHT * 0.52 * flicker, 0.30],
        [DARK.LIGHT * 0.30 * flicker, 0.42]
      ];
      for (const r of rings) {
        g.globalAlpha = r[1];
        g.beginPath();
        g.arc(px, py, r[0], 0, Math.PI * 2);
        g.fillStyle = '#000000';
        g.fill();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.canvas, 0, 0);
    }
  };

  const Renderer = {
    draw() {
      this.background();

      // 震屏位移（仅世界层抖动，HUD 保持稳定）
      const sh = Game.shake > 0 ? Game.shake : 0;
      const sx = sh ? (Math.random() * 2 - 1) * sh * 0.6 : 0;
      const sy = sh ? (Math.random() * 2 - 1) * sh * 0.6 : 0;

      ctx.save();
      ctx.translate(-Math.round(Camera.x) + sx, -Math.round(Camera.y) + sy);
      StaticLayer.draw();      // 静态平台（离屏预渲染贴图）
      this.platforms();        // 动态平台（移动 / 下坠 / 单向）
      this.switches();         // 机关门开关
      this.lava();             // 熔岩上涨层
      this.pads();
      this.spikes();
      this.coins();
      this.gems();
      this.hearts();
      this.fruits();
      this.checkpoints();
      if (Level.flag) this.flag();
      this.enemies();
      if (Level.boss) this.boss();
      this.traps();
      this.projectiles();
      this.popups();
      this.rings();
      this.hints();
      Particles.draw();
      this.trail();
      this.deathGhost();
      for (const p of players) this.playerSprite(p);
      ctx.restore();

      this.gust();              // 周期强风的屏幕风线
      this.darkness();          // 黑暗视野遮罩（世界层之上、HUD 之下）

      if (Game.state === 'playing' || Game.state === 'paused' ||
          Game.state === 'levelIntro' || Game.state === 'dying') this.hud();
      this.bossIntroOverlay();  // Boss 入场演出（横条 + 名称）

      // 移动端虚拟按键（仅游戏中显示）
      if (Input.touchMode && Game.state === 'playing') this.touchControls();

      this.overlay();
    },

    // 黑暗视野遮罩（仅地宫 / 星核等关卡）
    darkness() {
      if (!Level.biome || !Level.biome.dark) return;
      const s = Game.state;
      if (!(s === 'playing' || s === 'paused' || s === 'dying' || s === 'levelIntro')) return;
      DarkLayer.build();
      DarkLayer.draw();
    },

    // 周期强风：屏幕空间风线（预警期淡、强风期明显）
    gust() {
      if (!Level.biome || !Level.biome.gust) return;
      const s = Game.state;
      if (!(s === 'playing' || s === 'levelIntro')) return;
      const phase = Level.gustPhase ? Level.gustPhase() : 0;
      if (!phase) return;
      const power = Level.gustPower ? Level.gustPower() : 0;
      const dir = (Level.biome.gust.strength || 1) > 0 ? 1 : -1;
      ctx.globalAlpha = phase === 1 ? 0.16 : Math.min(0.45, 0.2 + Math.abs(power) * 0.7);
      const span = VIEW.W + 160;
      for (let i = 0; i < 12; i++) {
        const y = ((i * 43 + Game.tick * (phase === 2 ? 5 : 2)) % (VIEW.H + 30)) - 15;
        const rawX = i * 97 + Game.tick * (phase === 2 ? 9 : 4) * dir;
        const x = ((rawX % span) + span) % span - 80;
        rect(x, y, 34, 2, '#e8f8ff');
        rect(x + 10, y + 3, 22, 2, '#bfe6ff');
        if (phase === 2 && i % 3 === 0) rect(x + 20, y + 6, 26, 2, '#ffffff');
      }
      ctx.globalAlpha = 1;
    },

    // ---- 三层视差背景（山脉 / 树林使用预渲染瓦片，配色随关卡主题）----
    background() {
      const th = THEMES[Game.themeIndex % THEMES.length] || THEMES[0];
      rect(0, 0, VIEW.W, VIEW.H, th.skyBottom);
      rect(0, 0, VIEW.W, VIEW.H * 0.3, th.skyTop);
      // 天空中间过渡 + 地平线暖光，让纯色天空更有层次
      ctx.globalAlpha = 0.35;
      rect(0, VIEW.H * 0.3, VIEW.W, VIEW.H * 0.2, th.skyTop);
      ctx.globalAlpha = 0.12;
      rect(0, 300, VIEW.W, 60, th.ambient);
      ctx.globalAlpha = 1;

      // 低画质模式：关闭视差背景与氛围粒子，只保留纯色天空
      if (Storage.data.lowQuality) return;

      // 最远层山影（0.08 视差，低对比）
      if (BgTiles.far) {
        const ffx = -Camera.x * 0.08;
        const off = ((ffx % 220) + 220) % 220;
        for (let x = -off - 220; x < VIEW.W + 220; x += 220) {
          ctx.drawImage(BgTiles.far, Math.round(x), 318);
        }
      }
      // 远山与中景之间的雾带
      ctx.globalAlpha = 0.12;
      rect(0, 336, VIEW.W, 18, th.ambient);
      ctx.globalAlpha = 0.08;
      rect(0, 354, VIEW.W, 14, th.skyBottom);
      ctx.globalAlpha = 1;

      // 远景山脉（最慢）
      const fx = -Camera.x * 0.15;
      if (BgTiles.mountain) {
        const off = ((fx % 120) + 120) % 120;
        for (let x = -off - 120; x < VIEW.W + 120; x += 120) {
          ctx.drawImage(BgTiles.mountain, Math.round(x), 354);
        }
      } else {
        for (let x = -fx % 120; x < VIEW.W + 120; x += 120) {
          this.mountain(x, 470, 140, 110, th.mountain);
        }
      }
      // 中景树林
      const mx = -Camera.x * 0.4;
      if (BgTiles.tree) {
        const off = ((mx % 90) + 90) % 90;
        for (let x = -off - 90; x < VIEW.W + 90; x += 90) {
          ctx.drawImage(BgTiles.tree, Math.round(x), 388);
        }
      } else {
        for (let x = -mx % 90; x < VIEW.W + 90; x += 90) {
          this.tree(x + 20, 470, th.tree);
        }
      }
      // 近景云朵（最快；位置压低，避免遮挡顶部 HUD 文字）
      const cx = -Camera.x * 0.7 + Game.tick * 0.3;
      const clouds = [
        { x: 90,  y: 145, u: 6 },
        { x: 360, y: 185, u: 5 },
        { x: 620, y: 125, u: 7 },
        { x: 880, y: 205, u: 5 }
      ];
      for (const c of clouds) {
        const dx = ((c.x + cx) % (VIEW.W + 200) + (VIEW.W + 200)) % (VIEW.W + 200) - 100;
        this.cloud(dx, c.y, c.u);
      }
      // 氛围光点（萤火虫 / 星点）
      this.ambient(th);
    },

    // 缓慢飘动的环境光点（屏幕空间，数量固定，开销极低）
    ambient(th) {
      const t = Game.tick;
      const count = 18;
      for (let i = 0; i < count; i++) {
        const seed = i * 97.3;
        const drift = t * (0.15 + (i % 3) * 0.05);
        const x = (seed + drift + Math.sin(t * 0.012 + i) * 18) % (VIEW.W + 40) - 20;
        const baseY = (i * 53 + 40) % 330;
        const y = baseY + Math.sin(t * 0.01 + i * 1.7) * 14;
        const tw = 0.5 + 0.5 * Math.sin(t * 0.03 + i * 2.1);
        ctx.globalAlpha = th.ambientAlpha * tw;
        rect(x, y, 2, 2, th.ambient);
        if (i % 5 === 0) rect(x + 1, y + 1, 4, 1, th.ambient);
      }
      ctx.globalAlpha = 1;
    },

    mountain(x, baseY, w, h, color) {
      for (let i = 0; i <= w; i += 8) {
        const t = i / w;
        const peak = Math.sin(t * Math.PI) * h;
        rect(x + i, baseY - peak, 8, peak, color);
      }
    },

    tree(x, baseY, color) {
      rect(x - 3, baseY - 36, 6, 36, '#5a3a22');
      for (let y = 0; y < 5; y++) {
        const rw = 36 - y * 6;
        rect(x - rw / 2, baseY - 46 - y * 8, rw, 10, color);
      }
    },

    cloud(x, y, u) {
      rect(x, y, 8 * u, 2 * u, '#ffffff');
      rect(x + 2 * u, y - 2 * u, 5 * u, 2 * u, '#ffffff');
      rect(x + 5 * u, y - 1 * u, 3 * u, 1 * u, '#ffffff');
      rect(x + u, y + u, 6 * u, u, '#e8f4ff');
    },

    // ---- 动态平台（移动 / 下坠 / 单向 / 机关门）；静态平台由离屏层绘制 ----
    platforms() {
      for (const p of Level.platforms) {
        if (!p.move && !p.fall && !p.oneWay && !p.gate) continue;
        if (!inView(p.x, p.w)) continue;

        if (p.gate) { this.gatePlatform(p); continue; }
        if (p.fall) { this.fallPlatform(p); continue; }
        if (p.oneWay) { this.oneWayPlatform(p); continue; }

        // 移动平台：轻微运动模糊拖影 + 木板 + 顶部黄色标记
        if (!Storage.data.lowQuality) {
          ctx.globalAlpha = 0.16;
          rect(p.x - p.dx * 3, p.y + 3, p.w, p.h, '#ffffff');
          ctx.globalAlpha = 1;
        }
        drawPlatformShape(ctx, p);
        rect(p.x + 4, Math.round(p.y) - 3, p.w - 8, 2, '#ffe28a');
      }
    },

    // ---- 机关门：门框 + 可升起的栏栅 ----
    gatePlatform(p) {
      const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
      const fy = Math.round(p.baseY) - 4;
      rect(x - 5, fy - 4, w + 10, 8, '#3a4a66');
      rect(x - 5, fy, 4, h + 8, '#26324a');
      rect(x + w + 1, fy, 4, h + 8, '#26324a');
      // 门体
      rect(x, y, w, h, '#7a8ca8');
      rect(x, y, w, 3, '#a9c6e2');
      for (let by = y + 6; by < y + h - 4; by += 12) {
        rect(x + 2, by, w - 4, 4, '#a9c6e2');
      }
      rect(x - 2, y - 6, w + 4, 6, '#c8d0dc');
      // 状态灯
      rect(x + w / 2 - 3, fy + h + 6, 6, 4, p.opened ? '#7ff0a8' : '#ff5b6e');
    },

    // ---- 机关门开关 ----
    switches() {
      for (const g of Level.gates) {
        const s = g.switch;
        if (!inView(s.x, s.w)) continue;
        const x = Math.round(s.x), y = Math.round(s.y);
        rect(x, y, s.w, s.h, '#2a3450');
        rect(x + 2, y + 2, s.w - 4, s.h - 4, '#3a4a66');
        // 拉杆
        const lean = g.opened ? 6 : 0;
        rect(x + s.w / 2 - 2 + lean, y + 6, 4, 22, g.opened ? '#7ff0a8' : '#ff5b6e');
        rect(x + s.w / 2 - 5 + lean, y + 4, 10, 5, g.opened ? '#bfffd8' : '#ff9aa8');
        if (Math.floor(Game.tick / 10) % 2 === 0 && !g.opened) {
          ctx.globalAlpha = 0.35;
          rect(x - 3, y - 3, s.w + 6, s.h + 6, '#ff5b6e');
          ctx.globalAlpha = 1;
        }
      }
    },

    // ---- 熔岩上涨 ----
    lava() {
      const l = Level.lava;
      if (!l) return;
      const y = Math.round(l.y);
      if (y > VIEW.H + 80) return;
      const x = Math.round(Camera.x) - 40;
      const w = VIEW.W + 80;
      const h = 760 - y;
      rect(x, y, w, h, '#c9321a');
      rect(x, y + 4, w, h - 4, '#e2401a');
      // 表面波纹
      const wave = Math.sin(Game.tick * 0.08) * 2;
      rect(x, y + wave, w, 5, '#ff8a3f');
      rect(x, y + wave + 5, w, 3, '#ffd23f');
      ctx.globalAlpha = 0.35;
      rect(x, y - 6, w, 6, '#ff8a3f');
      ctx.globalAlpha = 1;
      // 气泡
      for (let i = 0; i < 14; i++) {
        const bx = x + ((i * 137 + Math.floor(Game.tick * 0.5)) % w);
        const by = y + 14 + ((i * 61 + Math.floor(Game.tick * 0.8)) % Math.max(20, h - 20));
        rect(bx, by, 4, 3, '#ffb23f');
        rect(bx + 1, by + 1, 2, 1, '#ffe98a');
      }
    },

    // 下坠平台：计时中显示裂纹与倒计时条，消失时淡出
    fallPlatform(p) {
      if (p.state === 'gone' && p.alpha <= 0) return;
      const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
      ctx.globalAlpha = p.state === 'gone' ? p.alpha : 1;

      // 木板（偏暗色调，提示“不稳”）
      const warn = p.state !== 'gone' && p.timer >= MECH.FALL_DELAY - 30 &&
                   Math.floor(Game.tick / 4) % 2 === 0;
      rect(x, y, w, h, warn ? '#b08a5f' : '#8d6a48');
      rect(x, y, w, 3, warn ? '#ff8a5b' : '#b0895f');
      rect(x, y + h - 3, w, 3, '#6b4d33');
      // 裂纹：踩上越久越明显
      const t = Math.min(1, p.timer / MECH.FALL_DELAY);
      if (t > 0.15) {
        const n = t > 0.6 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const cxp = x + 12 + ((w - 24) / n) * i;
          rect(cxp, y + 4, 2, h - 8, '#4b3623');
          rect(cxp + 5, y + 6, 2, 4, '#4b3623');
        }
      }
      ctx.globalAlpha = 1;

      // 倒计时条（剩余站立时间）
      if (p.state !== 'gone' && p.timer > 0) {
        rect(x, y - 6, w, 3, 'rgba(0, 0, 0, 0.45)');
        rect(x, y - 6, w * (1 - t), 3, '#ff8a5b');
      }
    },

    // 单向平台：钢蓝色薄板 + 镂空，提示“只能从下方跳上”
    oneWayPlatform(p) {
      const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
      rect(x, y, w, h, '#6f8fb3');
      rect(x, y, w, 3, '#a9c6e2');
      rect(x, y + h - 2, w, 2, '#4d6a8a');
      for (let bx = x + 4; bx < x + w - 4; bx += 16) {
        rect(bx, y + h - 6, 8, 3, 'rgba(11, 18, 32, 0.55)');
      }
    },

    // ---- 弹跳板（踩上高弹，压缩-弹起动画）----
    pads() {
      for (const pad of Level.pads) {
        if (!inView(pad.x, pad.w)) continue;
        const x = Math.round(pad.x), y = Math.round(pad.y), w = pad.w;
        // 压缩量：触发后先压扁再弹回（正弦曲线）
        const k = pad.squash > 0
          ? Math.sin((1 - pad.squash / MECH.PAD_SQUASH_FRAMES) * Math.PI) : 0;
        const compress = k * 9;
        const topY = y - 18 + compress;

        // 底座
        rect(x + 2, y - 6, w - 4, 6, '#2a3450');
        rect(x + 4, y - 6, w - 8, 2, '#46557a');
        // 弹簧（三段锯齿）
        const springH = (y - 6) - topY;
        for (let i = 0; i < 3; i++) {
          const segY = topY + springH * (i / 3);
          rect(x + 10, segY, w - 20, 2, '#c9921f');
          rect(x + 16, segY + springH / 6, w - 32, 2, '#ffd23f');
        }
        // 顶部踏板（压缩时变黄，复位后为绿色）
        rect(x, topY - 6, w, 6, k > 0 ? '#ffe98a' : '#3fd27a');
        rect(x, topY - 6, w, 2, '#bfffd8');
        rect(x + 4, topY - 4, w - 8, 2, '#2f9e5c');
      }
    },

    // ---- 检查点旗帜（激活后变金色并脉冲发光）----
    checkpoints() {
      for (let i = 0; i < Level.checkpoints.length; i++) {
        const c = Level.checkpoints[i];
        if (!inView(c.x - 32, 64)) continue;
        const on = c.activated;
        const wave = Math.sin(Game.tick * 0.08 + i * 1.4);
        const poleX = Math.round(c.x) - 2;
        const baseY = Math.round(c.y);

        // 激活后的脉冲光晕
        if (on) {
          ctx.globalAlpha = 0.18 + wave * 0.05;
          rect(poleX - 18, baseY - CHECKPOINT.POLE_H - 8,
               36, CHECKPOINT.POLE_H + 10, '#ffe28a');
          ctx.globalAlpha = 1;
        }
        // 底座
        rect(poleX - 9, baseY - 6, 22, 6, on ? '#c9921f' : '#4a5468');
        rect(poleX - 9, baseY - 6, 22, 2, on ? '#ffe28a' : '#6b7689');
        // 旗杆
        rect(poleX, baseY - CHECKPOINT.POLE_H, 4, CHECKPOINT.POLE_H - 6,
             on ? '#f2f2f2' : '#8f99ad');
        // 三角旗（像素波浪）
        const top = baseY - CHECKPOINT.POLE_H + 4;
        for (let r = 0; r < 6; r++) {
          const rowW = 22 - r * 2;
          const off = wave * 2 * (r / 5);
          rect(poleX + 4 + off, top + r * 5, rowW, 5,
               on ? (r % 2 ? '#ffd23f' : '#ffe98a')
                  : (r % 2 ? '#6d7d99' : '#8391ab'));
        }
        // 顶部指示灯（激活后闪烁）
        if (on) {
          rect(poleX - 1, baseY - CHECKPOINT.POLE_H - 5, 6, 6,
               (Math.floor(Game.tick / 8) % 2) ? '#ffffff' : '#ffe28a');
        } else {
          rect(poleX - 1, baseY - CHECKPOINT.POLE_H - 4, 6, 6, '#7f8aa0');
        }
      }
    },

    // ---- 尖刺陷阱 ----
    spikes() {
      for (const s of Level.spikes) {
        if (!inView(s.x, s.w)) continue;
        const n = Math.floor(s.w / 8);
        for (let i = 0; i < n; i++) {
          const sx = s.x + i * 8;
          ctx.fillStyle = '#cfd6e4';
          ctx.beginPath();
          ctx.moveTo(sx, s.y + s.h);
          ctx.lineTo(sx + 4, s.y);
          ctx.lineTo(sx + 8, s.y + s.h);
          ctx.closePath();
          ctx.fill();
        }
        rect(s.x, s.y + s.h - 2, s.w, 2, '#8a93a8');
      }
    },

    // ---- 金币（旋转动画）----
    coins() {
      for (const c of Level.coins) {
        if (c.collected) continue;
        if (!inView(c.x, c.w)) continue;
        const phase = Game.tick * 0.1 + c.phase;
        const sx = Math.abs(Math.cos(phase));       // 宽度缩放模拟旋转
        const w = Math.max(2, 16 * sx);
        const x = c.x + (16 - w) / 2;
        rect(x, c.y, w, 16, '#ffd23f');
        rect(x, c.y, w, 3, '#ffe98a');
        rect(x, c.y + 13, w, 3, '#c9921f');
        if (w > 6) {
          rect(x + w / 2 - 1, c.y + 4, 2, 8, '#c9921f');
        }
      }
    },

    // ---- 隐藏宝石（发光菱形，每关 1 颗）----
    gems() {
      for (const g of Level.gems) {
        if (g.collected || !inView(g.x, g.w)) continue;
        const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
        const pulse = 0.5 + 0.5 * Math.sin(Game.tick * 0.08);
        ctx.globalAlpha = 0.16 + pulse * 0.12;
        rect(cx - 16, cy - 16, 32, 32, '#9be2ff');
        ctx.globalAlpha = 1;
        const rows = [4, 8, 12, 16, 12, 8, 4];
        for (let i = 0; i < rows.length; i++) {
          const rw = rows[i];
          rect(cx - rw / 2, cy - 14 + i * 4, rw, 4,
               i < 2 ? '#d8f6ff' : (i < 4 ? '#9be2ff' : '#4fb8e8'));
        }
        rect(cx - 2, cy - 6, 4, 12, 'rgba(255, 255, 255, 0.75)');
      }
    },

    // ---- 爱心拾取（+1 生命，满 5 颗时不再消耗）----
    hearts() {
      for (const h of Level.hearts) {
        if (h.collected || !inView(h.x, h.w)) continue;
        const pulse = 0.5 + 0.5 * Math.sin(Game.tick * 0.1);
        ctx.globalAlpha = 0.14 + pulse * 0.14;
        rect(h.x - 6, h.y - 6, h.w + 12, h.h + 12, '#ff9aa8');
        ctx.globalAlpha = 1;
        this.heart(Math.round(h.x), Math.round(h.y), 2, true);
      }
    },

    // ---- 变大果实 ----
    fruits() {
      for (const f of Level.fruits) {
        if (f.collected || !inView(f.x, f.w)) continue;
        const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
        const pulse = 0.5 + 0.5 * Math.sin(Game.tick * 0.08);
        ctx.globalAlpha = 0.16 + pulse * 0.12;
        rect(cx - 15, cy - 15, 30, 30, '#ffb23f');
        ctx.globalAlpha = 1;
        // 果实主体
        rect(cx - 7, cy - 4, 14, 12, '#ffb23f');
        rect(cx - 5, cy - 6, 10, 4, '#ffd27a');
        rect(cx - 7, cy + 6, 14, 3, '#c9821f');
        rect(cx - 4, cy - 2, 3, 6, '#ffe6a8');
        // 果柄与叶子
        rect(cx - 1, cy - 10, 2, 5, '#5a3a22');
        rect(cx + 1, cy - 10, 6, 3, '#5cd28a');
        rect(cx + 1, cy - 9, 4, 2, '#a6ffd0');
      }
    },

    // ---- 陷阱：捕兽夹 / 火球发射口 / 激光 / 滚锯 / 摆锤 ----
    traps() {
      for (const t of Level.traps) {
        if (!inView(t.x, t.w)) continue;
        const x = Math.round(t.x), y = Math.round(t.y);
        if (t.kind === 'bear') {
          const snapped = t.snap > 0;
          // 接近警示：红色脉冲
          if (t.armed && !snapped && Math.floor(Game.tick / 8) % 2 === 0) {
            ctx.globalAlpha = 0.22;
            rect(x - 4, y - 4, t.w + 8, t.h + 6, '#ff5b6e');
            ctx.globalAlpha = 1;
          }
          rect(x - 2, y + 10, t.w + 4, 4, '#3a2a20');
          rect(x, y + 8, t.w, 3, snapped ? '#c8d0dc' : '#8a93a8');
          for (let i = 0; i < 4; i++) {
            rect(x + 2 + i * 6, y + 2, 3, snapped ? 6 : 8, '#c8d0dc');
          }
          if (!snapped) {
            for (let i = 0; i < 4; i++) {
              rect(x + 2 + i * 6, y + 8, 3, 4, '#c8d0dc');
            }
          }
          rect(x + t.w / 2 - 2, y + 9, 4, 3, t.cool > 0 ? '#6b7280' : '#ff8a5b');
        } else if (t.kind === 'fire') {
          // 石制喷火口
          if (t.armed) {
            const glow = 0.12 + 0.08 * Math.sin(Game.tick * 0.25);
            ctx.globalAlpha = glow;
            rect(x - 6, y - 8, t.w + 12, t.h + 10, '#ff8a3f');
            ctx.globalAlpha = 1;
          }
          rect(x + 2, y + 6, t.w - 4, t.h - 6, '#4a3f4f');
          rect(x + 4, y + 8, t.w - 8, 4, '#6a5a70');
          const noz = t.dir > 0 ? x + t.w - 4 : x - 4;
          rect(noz, y + 10, 8, 8, '#2a232e');
          const flick = Math.floor(Game.tick / 6) % 2;
          rect(noz + (t.dir > 0 ? 6 : -4) + flick, y + 11, 4, 6, '#ff8a3f');
          rect(noz + (t.dir > 0 ? 6 : -2) + flick, y + 13, 3, 4, '#ffe98a');
        } else if (t.kind === 'laser') {
          // 两端发射器
          rect(x - 6, y - 4, 10, t.h + 8, '#3a4a66');
          rect(x + t.w - 4, y - 4, 10, t.h + 8, '#3a4a66');
          rect(x - 4, y - 2, 6, 4, '#8adcff');
          rect(x + t.w - 2, y - 2, 6, 4, '#8adcff');
          if (t.active) {
            ctx.globalAlpha = 0.35;
            rect(x, y - 3, t.w, t.h + 6, '#ff5b6e');
            ctx.globalAlpha = 1;
            rect(x, y + 1, t.w, t.h - 2, '#ff8a9a');
            rect(x, y + t.h / 2 - 1, t.w, 3, '#ffffff');
          } else if (t.warn) {
            if (Math.floor(Game.tick / 3) % 2 === 0) {
              rect(x, y + t.h / 2 - 2, t.w, 4, 'rgba(255, 138, 154, 0.55)');
            }
          } else {
            rect(x, y + t.h / 2 - 1, t.w, 2, 'rgba(120, 160, 220, 0.25)');
          }
        } else if (t.kind === 'saw') {
          const cx = x + t.w / 2, cy = y + t.h / 2;
          // 地面轨道提示
          ctx.globalAlpha = 0.18;
          rect(t.baseX - t.range, GROUND_Y - 4, t.range * 2, 3, '#ff8a9a');
          ctx.globalAlpha = 1;
          // 旋转锯片
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t.timer * 0.22);
          for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            rect(-3, -18, 6, 7, '#afb8c8');
          }
          ctx.restore();
          rect(cx - 12, cy - 12, 24, 24, '#6b7688');
          rect(cx - 9, cy - 9, 18, 18, '#c8d0dc');
          rect(cx - 4, cy - 4, 8, 8, '#3a2a20');
          rect(cx - 2, cy - 14, 4, 4, '#ffe28a');
        } else if (t.kind === 'pendulum') {
          const cx = x + t.w / 2, cy = y + t.h / 2;
          const px = Math.round(t.pivotX), py = Math.round(t.pivotY);
          // 悬挂座
          rect(px - 8, py - 8, 16, 10, '#3a4a66');
          rect(px - 2, py - 2, 4, 6, '#8adcff');
          // 链条
          for (let i = 1; i <= 10; i++) {
            const k = i / 11;
            const lx = px + (cx - px) * k;
            const ly = py + (cy - py) * k;
            rect(Math.round(lx) - 2, Math.round(ly) - 4, 4, 8, '#7a8394');
          }
          // 球体 + 尖刺
          rect(cx - 17, cy - 17, 34, 34, '#4a5568');
          rect(cx - 14, cy - 14, 28, 28, '#9aa4b8');
          rect(cx - 10, cy - 10, 20, 20, '#6b7688');
          rect(cx - 5, cy - 5, 10, 10, '#ffd23f');
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const sx = cx + Math.cos(a) * 19;
            const sy = cy + Math.sin(a) * 19;
            rect(Math.round(sx) - 3, Math.round(sy) - 3, 6, 6, '#c8d0dc');
          }
        } else if (t.kind === 'crusher') {
          const cx = x + t.w / 2;
          if (t.warn) {
            ctx.globalAlpha = 0.2 + 0.14 * Math.sin(Game.tick * 0.4);
            rect(x - 6, y + t.h, t.w + 12, GROUND_Y - y - t.h + 8, '#ff5b6e');
            ctx.globalAlpha = 1;
          }
          // 链条
          for (let cy = 34; cy < y - 6; cy += 12) {
            rect(cx - 2, cy, 4, 9, '#7a8394');
          }
          // 吊座
          rect(cx - 14, y - 10, 28, 10, '#3a4a66');
          rect(cx - 4, y - 15, 8, 6, '#8adcff');
          // 锤体
          rect(x, y, t.w, t.h, '#4a5568');
          rect(x + 3, y + 3, t.w - 6, t.h - 6, '#8a93a8');
          rect(x + 7, y + 7, t.w - 14, 6, '#c8d0dc');
          rect(x + 7, y + t.h - 14, t.w - 14, 5, '#6b7688');
          for (let i = 0; i < 4; i++) {
            rect(x + 6 + i * 12, y + t.h - 3, 8, 5, '#d8e2f0');
          }
          if (t.active) {
            ctx.globalAlpha = 0.25;
            rect(x - 4, y - 4, t.w + 8, t.h + 8, '#ff8a9a');
            ctx.globalAlpha = 1;
          }
        } else if (t.kind === 'popspike') {
          // 底座
          rect(x - 2, GROUND_Y, t.w + 4, 5, '#3a2a20');
          if (t.warn) {
            ctx.globalAlpha = 0.18 + 0.14 * Math.sin(Game.tick * 0.45);
            rect(x - 4, GROUND_Y - 5, t.w + 8, 8, '#ff5b6e');
            ctx.globalAlpha = 1;
          }
          const raise = Math.max(0, Math.round(GROUND_Y - t.y));
          for (let i = 0; i < 4; i++) {
            const sx = x + 4 + i * 11;
            const sh = Math.min(raise, 16);
            if (sh <= 0) continue;
            rect(sx, GROUND_Y - sh, 6, sh, '#c8d0dc');
            rect(sx + 1, GROUND_Y - sh, 3, Math.max(0, sh - 2), '#ffffff');
          }
        }
      }
    },

    // ---- 火球 / 敌弹 / 震地波 / 星核弹 / 光柱 ----
    projectiles() {
      for (const p of Level.projectiles) {
        if (!inView(p.x, p.w)) continue;
        if (p.kind === 'beamwarn') {
          // 光柱预警：闪烁的红色柱体，不造成伤害
          const blink = Math.floor(Game.tick / 6) % 2 === 0;
          ctx.globalAlpha = blink ? 0.55 : 0.25;
          rect(p.x, p.y, p.w, p.h, '#ff3b3b');
          ctx.globalAlpha = 1;
          for (let yy = p.y + 20; yy < p.y + p.h; yy += 60) {
            rect(p.x + 4, yy, p.w - 8, 10, '#ffb0b0');
          }
          continue;
        }
        if (p.kind === 'beam') {
          // 核心光柱：白色柱心 + 橙色外沿
          ctx.globalAlpha = 0.35;
          rect(p.x - 6, p.y, p.w + 12, p.h, '#ff8a3f');
          ctx.globalAlpha = 1;
          rect(p.x, p.y, p.w, p.h, '#ff6b2b');
          rect(p.x + 6, p.y, p.w - 12, p.h, '#ffd23f');
          rect(p.x + 14, p.y, p.w - 28, p.h, '#ffffff');
          continue;
        }
        if (p.kind === 'wave') {
          // 震地波：贴地的尖刺能量波
          ctx.globalAlpha = 0.3;
          rect(p.x - 4, p.y + 4, p.w + 8, p.h - 4, '#ff9a5a');
          ctx.globalAlpha = 1;
          rect(p.x, p.y + p.h - 8, p.w, 8, '#5a1a9e');
          rect(p.x + 4, p.y + 10, p.w - 8, p.h - 12, '#8a5ce0');
          rect(p.x + 8, p.y, 8, 16, '#d8c2ff');
          rect(p.x + p.w - 16, p.y + 4, 8, 12, '#d8c2ff');
          continue;
        }
        if (p.kind === 'orb') {
          // 星核弹幕：紫色光球
          ctx.globalAlpha = 0.35;
          rect(p.x - 3, p.y - 3, p.w + 6, p.h + 6, '#b48cff');
          ctx.globalAlpha = 1;
          rect(p.x, p.y, p.w, p.h, '#5a1a9e');
          rect(p.x + 2, p.y + 2, p.w - 4, p.h - 4, '#a855f7');
          rect(p.x + 4, p.y + 4, p.w - 8, p.h - 8, '#ffffff');
          continue;
        }
        if (p.kind === 'rock') {
          // 落石：岩角领主从天花板砸下的石块
          ctx.globalAlpha = 0.3;
          rect(p.x - 3, p.y - 3, p.w + 6, p.h + 6, '#ff9a5a');
          ctx.globalAlpha = 1;
          rect(p.x, p.y, p.w, p.h, '#6a4a36');
          rect(p.x + 2, p.y + 2, p.w - 4, 6, '#a07858');
          rect(p.x + 5, p.y + 9, 7, 7, '#8a5f45');
          rect(p.x + 11, p.y + 4, 4, 4, '#5a3a2a');
          continue;
        }
        const foe = p.kind === 'enemy';
        ctx.globalAlpha = 0.3;
        rect(p.x - p.vx * 3, p.y + 2, p.w, p.h, foe ? '#b48cff' : '#ff8a3f');
        ctx.globalAlpha = 1;
        rect(p.x, p.y, p.w, p.h, foe ? '#8a5ce0' : '#ff6b2b');
        rect(p.x + 2, p.y + 2, p.w - 4, p.h - 4, foe ? '#d8c2ff' : '#ffb23f');
        rect(p.x + 4, p.y + 4, p.w - 8, p.h - 8, foe ? '#ffffff' : '#fff3b0');
      }
      ctx.globalAlpha = 1;
    },

    // ---- 二段跳 / 踩头扩散光环 ----
    rings() {
      for (const r of Level.rings) {
        if (!inView(r.x - r.r - 12, r.r * 2 + 24)) continue;
        const a = r.life / r.maxLife;
        ctx.globalAlpha = Math.max(0, a) * 0.7;
        ctx.strokeStyle = '#bff0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    // ---- 首次机制提示（世界坐标，玩家接近时半透明显示）----
    hints() {
      for (const h of Level.hints) {
        if (h.seen) continue;
        if (!players.some((q) => q.x > h.x - 300 && q.x < h.x + 70)) continue;
        if (!inView(h.x - 160, 320)) continue;
        ctx.globalAlpha = 0.55 + 0.18 * Math.sin(Game.tick * 0.05);
        drawText(h.text, h.x, h.y, 15, '#ffffff', 'center');
        ctx.globalAlpha = 1;
      }
    },

    // ---- 死亡位置虚影 ----
    deathGhost() {
      const d = Game.deathMark;
      if (!d || d.level !== Game.level || d.timer <= 0) return;
      if (Storage.data.lowQuality) return;
      const a = Math.min(0.4, (d.timer / FEEL.DEATH_MARK_FRAMES) * 0.4);
      ctx.globalAlpha = a;
      rect(d.x + 2, d.y, player.w - 4, player.h, '#ff8a8a');
      rect(d.x + 2, d.y, player.w - 4, 4, '#ffd0d0');
      rect(d.x + player.w / 2 - 4, d.y - 8, 8, 2, '#ff8a8a');
      rect(d.x + player.w / 2 - 1, d.y - 11, 2, 8, '#ff8a8a');
      ctx.globalAlpha = Math.min(0.85, a + 0.2);
      drawText('上次倒下', d.x + player.w / 2, d.y - 18, 11, '#ffb0b0', 'center', false);
      ctx.globalAlpha = 1;
    },

    // ---- 收集数字弹出 ----
    popups() {
      for (const p of Level.popups) {
        if (!inView(p.x - 60, 120)) continue;
        const alpha = Math.min(1, p.life / 25);
        ctx.globalAlpha = alpha;
        drawText(p.text, p.x, p.y, 14, p.color, 'center');
      }
      ctx.globalAlpha = 1;
    },

    // ---- 冲刺残影（外层冷色 + 内层高光，随生命值渐隐）----
    trail() {
      if (Storage.data.lowQuality) return;
      const skin = SKINS[Storage.data.skin] || SKINS[0];
      for (const t of Level.trail) {
        if (!inView(t.x, player.w)) continue;
        const a = t.life / 10;
        ctx.globalAlpha = a * 0.55;
        rect(t.x, t.y, player.w, player.h, skin.light);
        ctx.globalAlpha = a * 0.35;
        rect(t.x + 4, t.y + 4, player.w - 8, player.h - 8, '#eaf8ff');
      }
      ctx.globalAlpha = 1;
    },

    // ---- 终点旗帜 ----
    flag() {
      const f = Level.flag;
      if (!inView(f.x - 12, 64)) return;
      // 终点旗帜呼吸光晕
      const pulse = 0.5 + 0.5 * Math.sin(Game.tick * 0.05);
      ctx.globalAlpha = 0.10 + pulse * 0.10;
      rect(f.x - 28, f.y - 16, 80, f.h + 24, '#ffe28a');
      ctx.globalAlpha = 1;
      const poleX = f.x;
      rect(poleX, f.y, f.w, f.h, '#e8e8e8');
      rect(poleX + f.w, f.y, 1, f.h, '#9aa0b0');
      rect(poleX - 3, f.y - 6, f.w + 6, 6, '#ffd23f');
      const flagY = f.y + 10;
      for (let i = 0; i < 10; i++) {
        const wave = Math.sin(Game.tick * 0.06 + i * 0.55) * 2;
        const rowW = 38 - i * 2.4;
        rect(poleX + f.w + wave, flagY + i * 6, rowW, 6,
             i % 2 === 0 ? '#ff5b6e' : '#e23b4e');
      }
      rect(poleX - 10, f.y + f.h - 6, 26, 6, '#8a93a8');
    },

    // ---- 敌人（按种类绘制不同外形）----
    enemies() {
      for (const e of Level.enemies) {
        if (!e.alive && e.deadTimer <= 0) continue;
        if (!inView(e.x, e.w)) continue;
        const x = Math.round(e.x), y = Math.round(e.y);
        const step = Math.floor(e.anim * 2) % 2;
        // 精英怪：金色光环 + 宝石皇冠
        if (e.elite && e.alive) {
          ctx.globalAlpha = 0.22 + Math.sin(Game.tick * 0.12) * 0.08;
          rect(x - 5, y - 8, e.w + 10, e.h + 12, '#ffd23f');
          ctx.globalAlpha = 1;
          // 皇冠（三尖 + 红宝石）
          rect(x + 6, y - 10, 14, 6, '#c9921f');
          rect(x + 7, y - 9, 12, 5, '#ffd23f');
          rect(x + 7, y - 12, 3, 3, '#ffd23f');
          rect(x + 11, y - 14, 4, 5, '#ffe28a');
          rect(x + 17, y - 12, 3, 3, '#ffd23f');
          rect(x + 11, y - 8, 4, 3, '#ff5b6e');
        }
        if (e.type === 'flyer') {
          ctx.drawImage(enemySprite('flyer', step, e.alive, (sx, sy) =>
            this.enemyFlyer(sx, sy, step)), x - 4, y - 10);
        } else if (e.type === 'charger') this.enemyCharger(e, x, y, step);
        else if (e.type === 'spiky') {
          ctx.drawImage(enemySprite('spiky', step, e.alive, (sx, sy) =>
            this.enemySpiky(sx, sy, step)), x - 4, y - 10);
        } else if (e.type === 'hopper') this.enemyHopper(e, x, y, step);
        else if (e.type === 'shooter') this.enemyShooter(e, x, y, step);
        else if (e.type === 'armored') this.enemyArmored(e, x, y, step);
        else if (e.type === 'ghost') this.enemyGhost(e, x, y, step);
        else {
          ctx.drawImage(enemySprite('walker', step, e.alive, (sx, sy) =>
            this.enemyWalker(sx, sy, step, e.alive)), x - 4, y - 10);
        }
      }
    },

    // 普通红角怪
    enemyWalker(x, y, step, alive) {
      const flipY = alive ? 0 : 1;
      // 脚（深色鞋）
      rect(x + 2 + step * 3, y + (flipY ? 0 : 23), 8, 3, '#a63030');
      rect(x + 16 - step * 3, y + (flipY ? 0 : 23), 8, 3, '#a63030');
      // 双角（浅色角尖）
      rect(x + 2, y - 1, 3, 5, '#ffd8c8');
      rect(x + 21, y - 1, 3, 5, '#ffd8c8');
      // 身体（三段明暗）
      rect(x, y + 4, 26, 20, '#e14b4b');
      rect(x + 2, y + 4, 22, 3, '#f37a7a');
      rect(x, y + 20, 26, 4, '#a63030');
      // 肚皮
      rect(x + 7, y + 14, 12, 9, '#f7b0a0');
      rect(x + 7, y + 14, 12, 2, '#ffd0c0');
      // 眼睛（以身体中线 x+13 为轴左右对称）
      rect(x + 5, y + 8, 6, 5, '#ffffff');
      rect(x + 15, y + 8, 6, 5, '#ffffff');
      rect(x + 7, y + 10, 2, 3, '#141a2b');
      rect(x + 17, y + 10, 2, 3, '#141a2b');
      // 獠牙
      rect(x + 9, y + 17, 2, 3, '#ffffff');
      rect(x + 15, y + 17, 2, 3, '#ffffff');
    },

    // 飞行怪：紫色蝠翼，上下悬浮
    enemyFlyer(x, y, step) {
      const flap = step ? 4 : 0;
      // 翅膀（翼膜 + 深色翼梢）
      rect(x - 3, y + 6 + flap, 8, 10, '#b48cff');
      rect(x + 21, y + 6 + flap, 8, 10, '#b48cff');
      rect(x - 3, y + 12 + flap, 8, 4, '#8a5ce0');
      rect(x + 21, y + 12 + flap, 8, 4, '#8a5ce0');
      // 蝠耳
      rect(x + 4, y + 2, 3, 4, '#b48cff');
      rect(x + 19, y + 2, 3, 4, '#b48cff');
      // 身体
      rect(x + 2, y + 6, 22, 17, '#8a5ce0');
      rect(x + 4, y + 6, 18, 3, '#b48cff');
      rect(x + 2, y + 19, 22, 4, '#5a3a9e');
      // 眼睛
      rect(x + 6, y + 10, 5, 5, '#ffe98a');
      rect(x + 15, y + 10, 5, 5, '#ffe98a');
      rect(x + 8, y + 12, 2, 3, '#1a0a2e');
      rect(x + 17, y + 12, 2, 3, '#1a0a2e');
      // 獠牙
      rect(x + 9, y + 18, 2, 3, '#ffffff');
      rect(x + 15, y + 18, 2, 3, '#ffffff');
    },

    // 冲锋怪：橙色，靠近玩家时加速
    enemyCharger(e, x, y, step) {
      // 冲刺速度线
      if (e.charging) {
        const sx = e.dir > 0 ? -10 : 26;
        rect(x + sx, y + 8, 10, 2, 'rgba(255, 220, 160, 0.75)');
        rect(x + sx + 4, y + 14, 8, 2, 'rgba(255, 220, 160, 0.55)');
      }
      // 脚
      rect(x + 2 + step * 3, y + 23, 8, 3, '#a85a1f');
      rect(x + 16 - step * 3, y + 23, 8, 3, '#a85a1f');
      // 双角（浅色角尖）
      rect(x + 1, y - 2, 3, 6, '#fff0d8');
      rect(x + 22, y - 2, 3, 6, '#fff0d8');
      // 身体
      rect(x, y + 4, 26, 20, '#e8843a');
      rect(x + 2, y + 4, 22, 3, '#ffb877');
      rect(x, y + 20, 26, 4, '#a85a1f');
      // 头甲
      rect(x + 6, y + 4, 14, 3, '#8a4a1a');
      // 怒眼（眼白 + 红瞳 + 眉线）
      rect(x + 4, y + 8, 7, 4, '#ffffff');
      rect(x + 15, y + 8, 7, 4, '#ffffff');
      rect(x + 7, y + 9, 3, 3, '#a83200');
      rect(x + 17, y + 9, 3, 3, '#a83200');
      rect(x + 5, y + 7, 6, 1, '#7a2a00');
      rect(x + 15, y + 7, 6, 1, '#7a2a00');
      // 鼻孔
      rect(x + 10, y + 17, 2, 2, '#7a2a00');
      rect(x + 15, y + 17, 2, 2, '#7a2a00');
    },

    // 尖刺怪：钢蓝色，顶部带刺，无法踩头
    enemySpiky(x, y, step) {
      // 脚
      rect(x + 2 + step * 3, y + 23, 8, 3, '#4d6a8a');
      rect(x + 16 - step * 3, y + 23, 8, 3, '#4d6a8a');
      // 顶刺（金属 + 高光）
      const sp = [[1, -6, 8], [8, -9, 11], [15, -9, 11], [22, -6, 8]];
      for (const s of sp) {
        rect(x + s[0], y + s[1], 4, s[2], '#d8e2f0');
        rect(x + s[0], y + s[1], 1, s[2], '#ffffff');
      }
      // 身体
      rect(x, y + 4, 26, 20, '#6f8fb3');
      rect(x + 2, y + 4, 22, 3, '#a9c6e2');
      rect(x, y + 20, 26, 4, '#4d6a8a');
      // 铆钉
      rect(x + 2, y + 13, 2, 2, '#a9c6e2');
      rect(x + 22, y + 13, 2, 2, '#a9c6e2');
      // 红眼
      rect(x + 5, y + 9, 5, 4, '#ff6b6b');
      rect(x + 16, y + 9, 5, 4, '#ff6b6b');
      rect(x + 7, y + 10, 2, 2, '#2a0a0a');
      rect(x + 18, y + 10, 2, 2, '#2a0a0a');
    },

    // 跳跃怪：绿色史莱姆，周期弹跳（落地时压扁）
    enemyHopper(e, x, y, step) {
      const grounded = e.hopY === 0;
      const h = grounded
        ? (e.hopCd < 12 ? 16 : 18)
        : 20;
      const oy = grounded ? 24 - h : 4;
      rect(x - 2, y + 24, 30, 2, 'rgba(0, 0, 0, 0.25)');
      // 耳朵
      rect(x + 2, y + oy - 4, 4, 5, '#5cd28a');
      rect(x + 20, y + oy - 4, 4, 5, '#5cd28a');
      // 身体
      rect(x + 1, y + oy, 24, h, '#5cd28a');
      rect(x + 3, y + oy, 20, 3, '#a6ffd0');
      rect(x + 1, y + oy + h - 3, 24, 3, '#2f9e5c');
      // 高光水珠
      rect(x + 4, y + oy + 2, 3, 2, '#d8ffea');
      // 眼睛
      rect(x + 6, y + oy + 5, 4, 4, '#ffffff');
      rect(x + 16, y + oy + 5, 4, 4, '#ffffff');
      rect(x + 7, y + oy + 6, 2, 3, '#13402a');
      rect(x + 17, y + oy + 6, 2, 3, '#13402a');
      // 嘴
      rect(x + 10, y + oy + h - 5, 6, 2, '#2f9e5c');
    },

    // 炮台怪：固定底座 + 可旋转炮口，开火前会亮起
    enemyShooter(e, x, y, step) {
      const ready = e.fireCd !== undefined && e.fireCd < 30;
      // 履带底座
      rect(x + 1, y + 18, 24, 7, '#3a4a66');
      rect(x + 3, y + 20, 3, 3, '#141c2c');
      rect(x + 10, y + 20, 3, 3, '#141c2c');
      rect(x + 17, y + 20, 3, 3, '#141c2c');
      // 机身
      rect(x + 4, y + 6, 18, 15, '#6f8fb3');
      rect(x + 6, y + 8, 14, 3, '#a9c6e2');
      // 铆钉
      rect(x + 5, y + 17, 2, 2, '#a9c6e2');
      rect(x + 19, y + 17, 2, 2, '#a9c6e2');
      // 炮口
      const bx = e.dir > 0 ? x + 21 : x - 5;
      rect(bx, y + 11, 8, 7, '#2a3450');
      rect(bx + (e.dir > 0 ? 6 : 0), y + 12, 3, 5, ready ? '#ff8a9a' : '#8adcff');
      // 发光核心
      rect(x + 10, y + 12, 6, 4, ready ? '#ff5b6e' : '#ffd23f');
      rect(x + 11, y + 12, 2, 1, '#ffffff');
    },

    // 铁甲怪：金属外壳，护甲破损后露出内芯
    enemyArmored(e, x, y, step) {
      const broken = (e.hp || 1) < 2;
      const flash = (e.hurtTimer || 0) > 0;
      const body = flash ? '#ffffff' : (broken ? '#8a6f5a' : '#8a93a8');
      const light = flash ? '#ffffff' : (broken ? '#b58f70' : '#c8d0dc');
      const dark = flash ? '#d8d8d8' : '#4a5568';
      // 脚
      rect(x + 2 + step * 3, y + 23, 8, 3, dark);
      rect(x + 16 - step * 3, y + 23, 8, 3, dark);
      // 身体
      rect(x, y + 5, 26, 19, body);
      rect(x + 2, y + 6, 22, 3, light);
      rect(x, y + 20, 26, 4, dark);
      // 头盔 + 盔缨
      rect(x + 2, y + 1, 22, 5, light);
      rect(x + 11, y - 1, 4, 2, dark);
      if (!broken) {
        // 完整护甲板
        rect(x + 4, y + 9, 18, 9, '#a9b8cc');
        rect(x + 4, y + 9, 18, 2, '#d8e2f0');
        rect(x + 8, y + 11, 2, 5, dark);
        rect(x + 16, y + 11, 2, 5, dark);
      } else {
        // 破损：裂纹 + 露出内芯
        rect(x + 4, y + 9, 9, 7, '#6f5a4a');
        rect(x + 15, y + 11, 6, 5, '#6f5a4a');
        rect(x + 12, y + 9, 1, 4, '#3a2a20');
        rect(x + 13, y + 12, 3, 1, '#3a2a20');
      }
      // 眼睛
      const eye = broken ? '#ffd23f' : '#ff5b6e';
      rect(x + 5, y + 9, 4, 3, eye);
      rect(x + 17, y + 9, 4, 3, eye);
    },

    // 幽灵：半透明漂浮，穿过平台追踪玩家
    enemyGhost(e, x, y, step) {
      const sway = Math.sin(Game.tick * 0.08 + (e.hover || 0)) * 2;
      ctx.globalAlpha = 0.62;
      // 裙摆（先画，位于身体下层）
      for (let i = 0; i < 4; i++) {
        rect(x + 3 + i * 5, y + 20 + sway + (i % 2 ? 2 : 0), 4, 5, '#8a5ce0');
      }
      // 身体
      rect(x + 2, y + 4 + sway, 22, 17, '#b48cff');
      rect(x + 4, y + 6 + sway, 18, 4, '#e0d0ff');
      // 眼睛
      rect(x + 6, y + 10 + sway, 4, 4, '#ffffff');
      rect(x + 16, y + 10 + sway, 4, 4, '#ffffff');
      rect(x + 8, y + 12 + sway, 2, 3, '#2a0a4a');
      rect(x + 18, y + 12 + sway, 2, 3, '#2a0a4a');
      // 腮红
      rect(x + 4, y + 15 + sway, 3, 2, '#d8a0ff');
      rect(x + 19, y + 15 + sway, 3, 2, '#d8a0ff');
      ctx.globalAlpha = 1;
    },

    // ---- Boss ----
    boss() {
      const b = Level.boss;
      if (!b || (!b.alive && b.hurtTimer <= 0)) return;
      if (!inView(b.x, b.w)) return;
      const x = Math.round(b.x), y = Math.round(b.y);
      const step = Math.floor(b.anim) % 2;
      const hurt = b.hurtTimer > 0 && Math.floor(b.hurtTimer / 4) % 2 === 0;
      const rage = b.phase === 2;                       // 二阶段：狂暴配色
      const style = b.style || 'brute';

      // 攻击预警：蓄力时身周红色脉冲
      if (b.act === 1 || b.act === 4) {
        ctx.globalAlpha = 0.18 + Math.sin(Game.tick * 0.35) * 0.12;
        rect(x - 10, y - 10, b.w + 20, b.h + 20, '#ff3b3b');
        ctx.globalAlpha = 1;
      }

      if (style === 'guardian') {
        // 暗星守卫：重甲 + 面甲 + 胸口星核
        const body = hurt ? '#ffffff' : (rage ? '#d9435f' : '#3557b8');
        const dark = hurt ? '#cfe0ff' : (rage ? '#7a1426' : '#16265e');
        const light = hurt ? '#ffffff' : (rage ? '#ff9aa8' : '#79a0ff');
        const seam = rage ? '#ff6b6b' : '#4a6ad0';
        if (rage) {
          ctx.globalAlpha = 0.22 + Math.sin(Game.tick * 0.15) * 0.08;
          rect(x - 8, y - 8, b.w + 16, b.h + 16, '#ff3b3b');
          ctx.globalAlpha = 1;
        }
        // 冲撞残影
        if (b.act === 2) {
          ctx.globalAlpha = 0.35;
          rect(x - b.chargeDir * 22, y + 10, b.w, b.h - 20, light);
          ctx.globalAlpha = 1;
        }
        // 腿甲
        rect(x + 8 + step * 3, y + b.h - 12, 12, 12, dark);
        rect(x + 8 + step * 3, y + b.h - 12, 12, 3, light);
        rect(x + 44 - step * 3, y + b.h - 12, 12, 12, dark);
        rect(x + 44 - step * 3, y + b.h - 12, 12, 3, light);
        // 肩甲（带高光棱线）
        rect(x + 4, y + 6, 16, 11, dark);
        rect(x + 4, y + 6, 16, 3, light);
        rect(x + b.w - 20, y + 6, 16, 11, dark);
        rect(x + b.w - 20, y + 6, 16, 3, light);
        // 身体铠甲
        rect(x, y + 14, b.w, b.h - 26, body);
        rect(x + 4, y + 18, b.w - 8, 5, light);
        // 铠甲发光缝
        rect(x + 10, y + 24, 2, 22, seam);
        rect(x + 52, y + 24, 2, 22, seam);
        // 腰带
        rect(x, y + b.h - 26, b.w, 4, dark);
        rect(x + 28, y + b.h - 27, 8, 6, rage ? '#ff6b6b' : '#8adcff');
        // 头盔 + 双尖角
        rect(x + 16, y, 32, 20, body);
        rect(x + 16, y, 32, 4, light);
        rect(x + 12, y - 8, 6, 12, dark);
        rect(x + 13, y - 7, 2, 5, light);
        rect(x + 46, y - 8, 6, 12, dark);
        rect(x + 47, y - 7, 2, 5, light);
        // 面甲（横缝双目）
        rect(x + 20, y + 6, 24, 9, dark);
        rect(x + 23 + (b.dir > 0 ? 3 : 0), y + 8, 7, 3, rage ? '#ff2b2b' : '#8adcff');
        rect(x + 34 + (b.dir > 0 ? 3 : 0), y + 8, 7, 3, rage ? '#ff2b2b' : '#8adcff');
        // 胸口星核
        rect(x + 26, y + 30, 12, 12, rage ? '#ff6b6b' : '#8adcff');
        rect(x + 29, y + 33, 6, 6, '#ffffff');
        // 蓄力方向箭头
        if (b.act === 1) {
          const ax = b.chargeDir > 0 ? x + b.w + 8 : x - 20;
          rect(ax, y + 26, 12, 12, '#ff6b6b');
        }
      } else if (style === 'core') {
        // 终焉星核：悬浮核心 + 旋转外环
        const body = hurt ? '#ffffff' : (rage ? '#ffe066' : '#ff7a2a');
        const dark = hurt ? '#ffe6b0' : (rage ? '#a88a1a' : '#8a2a10');
        const light = hurt ? '#ffffff' : (rage ? '#fff6b0' : '#ffb066');
        const cx = x + b.w / 2, cy = y + b.h / 2;
        if (rage) {
          ctx.globalAlpha = 0.22 + Math.sin(Game.tick * 0.15) * 0.08;
          rect(x - 8, y - 8, b.w + 16, b.h + 16, '#ff7b2b');
          ctx.globalAlpha = 1;
        }
        // 外环光晕
        ctx.globalAlpha = 0.28;
        rect(cx - 28, cy - 28, 56, 56, light);
        ctx.globalAlpha = 1;
        // 外环：四块碎片随时间旋转（高光面）
        const t = Game.tick * 0.05;
        for (let i = 0; i < 4; i++) {
          const a = t + i * Math.PI / 2;
          const fx = Math.round(cx + Math.cos(a) * 26);
          const fy = Math.round(cy + Math.sin(a) * 26);
          rect(fx - 7, fy - 7, 14, 14, dark);
          rect(fx - 7, fy - 7, 14, 4, light);
          rect(fx - 3, fy - 3, 6, 6, body);
        }
        // 核心菱形
        rect(cx - 22, cy - 10, 44, 20, body);
        rect(cx - 10, cy - 22, 20, 44, body);
        // 能量纹路
        rect(cx - 22, cy - 2, 44, 4, dark);
        rect(cx - 2, cy - 22, 4, 44, dark);
        // 内核
        rect(cx - 8, cy - 8, 16, 16, light);
        rect(cx - 4, cy - 4, 8, 8, '#ffffff');
        // 单眼
        const es = b.dir > 0 ? 3 : -3;
        rect(cx - 7 + es, cy - 3, 12, 5, rage ? '#ff2b2b' : '#1a0a2e');
        rect(cx - 2 + es * 2, cy - 2, 2, 2, '#ffffff');
      } else {
        // 岩角领主：岩石双角 + 熔岩纹路 + 岩掌
        const body = hurt ? '#ffffff' : (rage ? '#e5433f' : '#8a2be2');
        const dark = hurt ? '#c8a0ff' : (rage ? '#8f1a1a' : '#5a1a9e');
        const light = hurt ? '#ffffff' : (rage ? '#ff8a8a' : '#a855f7');
        const magma = rage ? '#ffcf5a' : '#ff8a3f';
        if (rage) {
          ctx.globalAlpha = 0.22 + Math.sin(Game.tick * 0.15) * 0.08;
          rect(x - 8, y - 8, b.w + 16, b.h + 16, '#ff3b3b');
          ctx.globalAlpha = 1;
        }
        // 岩掌（脚）
        rect(x + 5 + step * 4, y + b.h - 11, 15, 11, dark);
        rect(x + 5 + step * 4, y + b.h - 11, 15, 3, light);
        rect(x + 44 - step * 4, y + b.h - 11, 15, 11, dark);
        rect(x + 44 - step * 4, y + b.h - 11, 15, 3, light);
        // 身体
        rect(x, y + 10, b.w, b.h - 21, body);
        rect(x + 4, y + 14, b.w - 8, 6, light);
        rect(x, y + b.h - 21, b.w, 5, dark);
        // 熔岩纹路
        rect(x + 10, y + 34, 3, 12, magma);
        rect(x + 30, y + 30, 3, 14, magma);
        rect(x + 50, y + 34, 3, 12, magma);
        // 肩甲
        rect(x - 3, y + 10, 12, 14, dark);
        rect(x - 3, y + 10, 12, 4, light);
        rect(x + b.w - 9, y + 10, 12, 14, dark);
        rect(x + b.w - 9, y + 10, 12, 4, light);
        // 岩石双角
        rect(x + 5, y - 6, 11, 16, dark);
        rect(x + 6, y - 5, 4, 8, light);
        rect(x + b.w - 16, y - 6, 11, 16, dark);
        rect(x + b.w - 15, y - 5, 4, 8, light);
        // 眼睛（怒眉 + 眼白）
        const shift = b.dir > 0 ? 4 : 0;
        const pupil = rage ? '#ff2b2b' : '#1a0a2e';
        rect(x + 12 + shift, y + 22, 11, 11, '#ffffff');
        rect(x + 41 + shift, y + 22, 11, 11, '#ffffff');
        rect(x + 16 + shift, y + 26, 5, 6, pupil);
        rect(x + 45 + shift, y + 26, 5, 6, pupil);
        rect(x + 10 + shift, y + 18, 15, 3, dark);
        rect(x + 39 + shift, y + 18, 15, 3, dark);
        // 嘴 + 獠牙
        rect(x + 20, y + 44, 24, 6, '#1a0a2e');
        rect(x + 23, y + 43, 4, 5, rage ? '#ff2b2b' : '#ffffff');
        rect(x + 37, y + 43, 4, 5, rage ? '#ff2b2b' : '#ffffff');
        rect(x + 30, y + 48, 4, 2, rage ? '#ff2b2b' : '#ffffff');
      }

      // 血条
      const barW = b.w;
      rect(x, y - 12, barW, 6, '#333');
      rect(x, y - 12, barW * (b.hp / b.maxHp), 6, '#ff5b6e');
    },

    // ---- 玩家（站立/行走/跳跃/冲刺 帧；p 为队伍成员）----
    playerSprite(p) {
      const who = p || player;
      if (who.invuln > 0 && Math.floor(who.invuln / 4) % 2 === 0) return;

      const bx = Math.round(who.x);
      const by = Math.round(who.y);
      // 脚下软阴影，让角色从背景中“站”出来
      if (who.onGround) {
        ctx.globalAlpha = 0.24;
        rect(bx + 2, by + who.h + 1, who.w - 4, 3, '#05070d');
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(bx, by);
      const scale = who.big ? 1.32 : 1;
      // 起跳拉伸 / 下落压缩 / 落地压扁，锚定脚底
      let sy = 1;
      if (who.landStun > 0) sy = 0.9;
      else if (!who.onGround && who.vy < -2) sy = 1.08;
      else if (!who.onGround && who.vy > 4) sy = 0.97;
      const sx = 1 / sy;
      // 锚点用设计尺寸（22×34）而非当前碰撞盒：变大后碰撞盒变为 30×44，
      // 若按 who.h 锚定，缩放后的脚底会停在盒内 34px 处，产生离地空隙
      ctx.translate(who.w / 2, who.h);
      ctx.scale(scale * sx, scale * sy);
      ctx.translate(-PLAYER_SIZE.w / 2, -PLAYER_SIZE.h);
      const x = 0, y = 0;
      const dashing = who.dashTime > 0;
      const airborne = !who.onGround;
      const running = Math.abs(who.vx) > 0.5 && who.onGround;
      const runFrame = Math.floor(Game.tick / 6) % 2;
      const flashWhite = who.flash > 0;
      const tone = (c) => (flashWhite ? '#ffffff' : c);
      const lean = dashing ? who.dashDir : 0;
      const facing = who.facing >= 0 ? 1 : -1;

      // 每名玩家使用不同皮肤配色，便于区分
      const skin = SKINS[(Storage.data.skin + (who.visualId || 0)) % SKINS.length] || SKINS[0];
      const bodyColor = dashing ? '#ffd23f' : skin.body;
      const bodyLight = dashing ? '#fff3b0' : skin.light;
      const bodyDark = dashing ? '#c9921f' : skin.dark;
      // 待机呼吸：身体与头上下 1px 轻浮动
      const bob = (!running && !airborne && !dashing)
        ? (Math.floor(Game.tick / 32) % 2) : 0;

      // 围巾（飘在身后，随移动起伏）
      if (!flashWhite) {
        const wave = Math.floor(Game.tick / 8) % 2;
        const len = (running || airborne || dashing) ? 3 : 2;
        for (let i = len; i >= 1; i--) {
          const wob = ((i + wave) % 2) * (i > 1 ? 1 : 0);
          rect(x + 10 - facing * (i * 4 + 1), y + 10 + bob + wob, 5, 2,
            tone(i === len ? '#a83232' : '#e1544b'));
        }
      }

      // 腿与靴
      if (airborne || dashing) {
        // 空中姿态：一腿收起、一腿伸展
        rect(x + 4, y + 26, 5, 6, tone('#1f3d5e'));
        rect(x + 13, y + 27, 5, 5, tone('#1f3d5e'));
        rect(x + 3, y + 31, 7, 3, tone('#12243a'));
        rect(x + 12, y + 31, 7, 3, tone('#12243a'));
        rect(x + 3, y + 31, 7, 1, tone('#2a4a6e'));
        rect(x + 12, y + 31, 7, 1, tone('#2a4a6e'));
      } else if (running) {
        // 跑步：双腿前后交错
        const f = runFrame ? 1 : -1;
        rect(x + 4 + f, y + 25, 5, 7, tone('#1f3d5e'));
        rect(x + 13 - f, y + 25, 5, 7, tone('#1f3d5e'));
        rect(x + 3 + f * 2, y + 31, 7, 3, tone('#12243a'));
        rect(x + 12 - f * 2, y + 31, 7, 3, tone('#12243a'));
      } else {
        rect(x + 4, y + 25, 5, 7, tone('#1f3d5e'));
        rect(x + 13, y + 25, 5, 7, tone('#1f3d5e'));
        rect(x + 3, y + 31, 7, 3, tone('#12243a'));
        rect(x + 12, y + 31, 7, 3, tone('#12243a'));
        rect(x + 3, y + 31, 7, 1, tone('#2a4a6e'));
        rect(x + 12, y + 31, 7, 1, tone('#2a4a6e'));
      }

      // 手臂（跑步时前后摆动，跳跃时上举）
      if (airborne || dashing) {
        rect(x + 0 + lean, y + 12 + bob, 3, 7, tone(bodyDark));
        rect(x + 19 + lean, y + 12 + bob, 3, 7, tone(bodyDark));
        rect(x + 0 + lean, y + 9 + bob, 3, 4, tone('#f2c49b'));
        rect(x + 19 + lean, y + 9 + bob, 3, 4, tone('#f2c49b'));
      } else {
        const sw = running ? (runFrame ? -1 : 1) : 0;
        rect(x + 0 + lean, y + 12 + bob + sw, 3, 8, tone(bodyDark));
        rect(x + 19 + lean, y + 12 + bob - sw, 3, 8, tone(bodyDark));
        rect(x + 0 + lean, y + 19 + bob + sw, 3, 3, tone('#f2c49b'));
        rect(x + 19 + lean, y + 19 + bob - sw, 3, 3, tone('#f2c49b'));
      }

      // 身体（上衣 + 肩部高光 + 腰带扣）
      rect(x + 2 + lean, y + 10 + bob, 18, 16, tone(bodyColor));
      rect(x + 2 + lean, y + 10 + bob, 18, 3, tone(bodyLight));
      rect(x + 2 + lean, y + 23 + bob, 18, 3, tone(bodyDark));
      rect(x + 2 + lean, y + 20 + bob, 18, 2, tone('#241a30'));
      rect(x + 9 + lean, y + 20 + bob, 4, 3, tone('#ffd23f'));

      // 围巾结（压在上衣领口）
      if (!flashWhite) rect(x + 8 + lean, y + 9 + bob, 6, 3, tone('#e1544b'));

      // 头（脸 + 下颌阴影）
      rect(x + 4 + lean, y + bob, 14, 12, tone('#f2c49b'));
      rect(x + 4 + lean, y + 8 + bob, 14, 4, tone('#e8b088'));
      // 头发（含呆毛与高光发丝）
      rect(x + 4 + lean, y + bob, 14, 4, tone('#2a1e33'));
      rect(x + 3 + lean, y + bob, 2, 8, tone('#2a1e33'));
      rect(x + 17 + lean, y + bob, 2, 5, tone('#2a1e33'));
      rect(x + 5 + lean, y + 1 + bob, 5, 2, tone('#4a3a5a'));
      rect(x + 9 + lean, y - 3 + bob, 3, 3, tone('#2a1e33'));

      if (!flashWhite) {
        // 眼睛：眼白 + 瞳孔随朝向偏移，周期性眨眼
        const blink = !dashing && (Game.tick % 160) < 5;
        if (blink) {
          rect(x + 6 + facing + lean, y + 6 + bob, 3, 1, '#20243a');
          rect(x + 12 + facing + lean, y + 6 + bob, 3, 1, '#20243a');
        } else {
          rect(x + 6 + facing + lean, y + 5 + bob, 3, 3, '#ffffff');
          rect(x + 12 + facing + lean, y + 5 + bob, 3, 3, '#ffffff');
          rect(x + 7 + facing + lean, y + 6 + bob, 2, 2, '#20243a');
          rect(x + 13 + facing + lean, y + 6 + bob, 2, 2, '#20243a');
        }
        // 微笑
        rect(x + 9 + lean, y + 9 + bob, 4, 1, '#b06a54');
      }
      ctx.restore();

      // 队友头顶编号
      if (who.id > 0) {
        drawText('P' + (who.id + 1), bx + who.w / 2, by - 12,
                 10, skin.light, 'center', false);
      }
    },

    // ---- Boss 入场演出：上下黑边滑入 + 名称 + 准备迎战 ----
    bossIntroOverlay() {
      if (!Level.boss || !Level.bossFightStarted || !(Level.bossIntroT > 0)) return;
      if (Game.state !== 'playing' && Game.state !== 'levelIntro') return;
      const k = Math.min(1, (100 - Level.bossIntroT) / 18);
      const fade = Math.min(1, Level.bossIntroT / 18);
      const bar = 54 * k;
      ctx.globalAlpha = 0.78 * fade;
      rect(0, 0, VIEW.W, bar, '#05070d');
      rect(0, VIEW.H - bar, VIEW.W, bar, '#05070d');
      ctx.globalAlpha = fade;
      rect(VIEW.W / 2 - 92, VIEW.H / 2 - 20, 184, 2, '#ff6b6b');
      drawText('BOSS', VIEW.W / 2, VIEW.H / 2 - 36, 13, '#ff6b6b', 'center', true);
      const bname = Level.boss.style === 'guardian' ? '暗星守卫'
        : (Level.boss.style === 'core' ? '终焉星核' : '岩角领主');
      drawText(bname, VIEW.W / 2, VIEW.H / 2, 32, '#ffffff', 'center', true);
      drawText('准备迎战', VIEW.W / 2, VIEW.H / 2 + 32, 16, '#ffd23f', 'center', false);
      ctx.globalAlpha = 1;
    },

    // ---- HUD：生命、金币、关卡、冲刺冷却、暂停/全屏图标 ----
    hud() {
      // 顶部暗角：提升雪地 / 天空背景下 HUD 文字的对比度
      ctx.globalAlpha = 0.2;
      rect(0, 0, VIEW.W, 104, '#05070d');
      ctx.globalAlpha = 0.1;
      rect(0, 104, VIEW.W, 28, '#05070d');
      ctx.globalAlpha = 1;
      // 生命：单人保持原布局；多人按 P1~P4 分列显示各自心数
      const cap = Game.heartCap();
      if (players.length <= 1) {
        for (let i = 0; i < cap; i++) {
          this.heart(20 + i * 26, 18, 3, i < Game.lives);
        }
      } else {
        players.forEach((p, idx) => {
          const x0 = 20 + idx * 150;
          drawText('P' + (idx + 1), x0, 18, 10, '#9fb3d1', 'left', false);
          for (let i = 0; i < cap; i++) {
            this.heart(x0 + 20 + i * 18, 18, 2, i < p.hearts);
          }
          // 除房主外，在各自编号 / 血量下方显示延迟或掉线状态
          if (Game.multiplayer && idx > 0) {
            const member = Net.members[idx];
            if (member && member.online === false) {
              drawText('掉线重连中', x0 + 20, 35, 9, '#ff8a8a', 'left', false);
            } else {
              const ms = Net.lag[idx];
              const jit = Net.jitter[idx];
              let text = '--';
              let color = '#6b7280';
              if (Number.isFinite(ms)) {
                text = ms + 'ms';
                if (Number.isFinite(jit) && jit >= 10) text += ' ±' + jit;
                color = ms <= 80 ? '#7ff0a8'
                  : (ms <= 160 ? '#ffd23f' : '#ff8a8a');
              }
              drawText(text, x0 + 20, 35, 9, color, 'left', false);
            }
          }
        });
      }

      // 金币
      rect(20, 48, 14, 14, '#ffd23f');
      rect(20, 48, 14, 3, '#ffe98a');
      drawText('x ' + Game.coins, 42, 55, 14, '#ffffff', 'left');

      // 宝石（本关是否已收集；无尽模式不参与宝石进度）
      const gotGem = !Game.endless && Storage.data.gems[Game.level];
      rect(112, 48, 10, 10, gotGem ? '#9be2ff' : '#2a3450');
      rect(116, 45, 2, 16, gotGem ? '#d8f6ff' : '#3a455e');
      rect(112, 52, 10, 1, gotGem ? '#4fb8e8' : '#2a3450');
      // 变大状态标记
      if (player.big) {
        rect(150, 48, 12, 12, '#ffb23f');
        rect(152, 46, 8, 3, '#ffd27a');
        drawText('变大', 166, 55, 12, '#ffd23f', 'left', false);
      }

      // 当前关卡（无尽 / 每日挑战显示房间与进度，首领房追加标记）
      const levelTitle = Game.endless
        ? (Game.daily ? '每日挑战 · 第 ' : '无尽 · 第 ') +
          Game.endlessRoom + ' 间' + (Level.boss ? ' · 首领' : '')
        : Level.data.name;
      drawText(levelTitle, 20, 78, 13, '#ffffff', 'left', true);
      // 本关用时
      drawText('用时 ' + formatTime(Game.levelTime), 20, 98, 12,
               '#c9d8ef', 'left', true);
      // 环境机制标记
      const biome = Level.biome || {};
      const gustPhase = Level.gustPhase ? Level.gustPhase() : 0;
      const tags = [];
      if (biome.ice) tags.push('冰面');
      if (biome.wind) tags.push('风区');
      if (biome.gust) tags.push(
        gustPhase === 1 ? '强风预警' : (gustPhase === 2 ? '强风!' : '阵风'));
      if (biome.dark) tags.push('黑暗');
      if (Level.lava) tags.push('熔岩上涨');
      if (Storage.coward() && !Game.multiplayer) tags.push('胆小鬼');
      if (tags.length) {
        let tagColor = Storage.coward() && !Game.multiplayer ? '#7ff0a8'
          : (biome.dark ? '#d8c2ff' : '#8adcff');
        if (gustPhase === 1) tagColor = '#ffd23f';
        else if (gustPhase === 2) tagColor = '#ffb066';
        drawText(tags.join(' · '), 150, 98, 12, tagColor, 'left', true);
      }

      // 本关临时道具 / 护盾状态
      const itemDef = Game.levelItem
        ? ITEMS.find((it) => it.id === Game.levelItem) : null;
      if (itemDef || Game.shield > 0) {
        const parts = [];
        if (itemDef && itemDef.id === 'shield') {
          parts.push('道具 护盾 x' + Game.shield);
        } else {
          if (itemDef) parts.push('道具 ' + itemDef.name);
          if (Game.shield > 0) parts.push('护盾 x' + Game.shield);
        }
        drawText(parts.join(' · '), 20, 118, 12,
                 itemDef ? itemDef.color : '#8adcff', 'left', false);
      }

      // 右上角：冲刺冷却图标（左移，为暂停/全屏按钮留出位置）
      const cdX = VIEW.W - 112, cdY = 22;
      const ready = player.dashCd <= 0;
      const ratio = ready ? 1 : 1 - player.dashCd / player.dashCdFrames();
      rect(cdX, cdY, 20, 20, ready ? '#3fb6ff' : '#2a3450');
      rect(cdX, cdY + 20 * (1 - ratio), 20, 20 * ratio, '#ffd23f');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cdX + 0.5, cdY + 0.5, 19, 19);
      drawText('冲刺', cdX + 10, cdY + 34, 11, ready ? '#8adcff' : '#6b7280', 'center', false);

      // 右上角：暂停 / 全屏图标（与 UI.hudIcons 命中区域一致）
      const icons = UI.hudIcons();
      this.hudIcon(icons.pause, 'pause');
      this.hudIcon(icons.fullscreen, 'full');

      // 操作提示（仅游戏中显示，按设备切换文案）
      if (Game.state === 'playing') {
        const mpHint = '联机 · 房间 ' + (Net.code || '----') + ' · ' +
          (Net.role === 'host' ? '房主 · ESC 暂停'
            : 'P' + ((Net.myId < 0 ? 0 : Net.myId) + 1) + ' · P 请求暂停');
        const hint = Game.multiplayer ? mpHint : (Input.touchMode
          ? '左下方向键 · 右下跳跃 / 冲刺'
          : 'A/D 移动 · 空格 跳跃(二段) · Shift 冲刺 · ESC 暂停 · F 全屏');
        drawText(hint, VIEW.W / 2, Game.multiplayer ? 116 : 30, 12,
                 'rgba(233, 240, 252, 0.7)', 'center', false);
      }

      // 联机重连 / 房主暂离遮罩（带剩余秒数）
      if (Game.multiplayer && Net.inGame &&
          (Net.reconnecting || !Net.hostOnline || Net.hostAway)) {
        rect(0, 0, VIEW.W, VIEW.H, 'rgba(4, 8, 16, 0.65)');
        const now = performance.now();
        let title, sub;
        if (Net.reconnecting) {
          title = '连接中断，正在重连…';
          const sec = Math.max(0,
            Math.ceil((Net.reconnectDeadline - now) / 1000));
          sub = sec > 0 ? '剩余 ' + sec + ' 秒 · 请保持页面打开'
            : '正在重新连接…';
        } else if (!Net.hostOnline) {
          title = '房主掉线，等待重连…';
          const elapsed = Net.hostDownSince
            ? (now - Net.hostDownSince) / 1000 : 0;
          const sec = Math.max(0, Math.ceil(30 - elapsed));
          sub = '剩余 ' + sec + ' 秒 · 房主重连后自动继续';
        } else {
          title = '房主暂时离开，等待返回…';
          sub = '房主切回页面后自动继续';
        }
        drawText(title, VIEW.W / 2, 250, 24, '#ffd23f', 'center', true);
        drawText(sub, VIEW.W / 2, 286, 12, '#b7c6e0', 'center', false);
      }
    },

    // HUD 小图标：半透明底 + 像素图形（暂停 / 全屏）
    hudIcon(r, type) {
      rect(r.x, r.y, r.w, r.h, 'rgba(8, 14, 26, 0.55)');
      ctx.strokeStyle = 'rgba(160, 200, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (type === 'pause') {
        rect(cx - 6, cy - 8, 4, 16, '#e6eefc');
        rect(cx + 2, cy - 8, 4, 16, '#e6eefc');
      } else {
        // 全屏：四角箭头
        rect(cx - 9, cy - 9, 7, 2, '#e6eefc');
        rect(cx - 9, cy - 9, 2, 7, '#e6eefc');
        rect(cx + 2, cy - 9, 7, 2, '#e6eefc');
        rect(cx + 7, cy - 9, 2, 7, '#e6eefc');
        rect(cx - 9, cy + 7, 7, 2, '#e6eefc');
        rect(cx - 9, cy + 2, 2, 7, '#e6eefc');
        rect(cx + 2, cy + 7, 7, 2, '#e6eefc');
        rect(cx + 7, cy + 2, 2, 7, '#e6eefc');
      }
    },

    // ---- 移动端虚拟按键 ----
    touchControls() {
      for (const b of UI.touchButtons()) {
        this.touchButton(b, this.touchPressed(b.id));
      }
    },

    // 按键当前是否处于按下态（键盘与触控共用同一份输入状态）
    touchPressed(id) {
      if (id === 'left')  return Input.left;
      if (id === 'right') return Input.right;
      if (id === 'jump')  return Input.jumpHeld;
      if (id === 'dash')  return player.dashTime > 0;
      return false;
    },

    // 半透明像素风虚拟按键 + 按下反馈
    touchButton(b, pressed) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2 + (pressed ? 1 : 0); // 按下时图形轻微下沉

      rect(b.x, b.y, b.w, b.h,
           pressed ? 'rgba(138, 220, 255, 0.5)' : 'rgba(9, 16, 30, 0.4)');
      ctx.strokeStyle = pressed ? 'rgba(255, 255, 255, 0.95)'
                                : 'rgba(160, 200, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      // 内层高光边，增强像素风层次
      rect(b.x + 6, b.y + 6, b.w - 12, 2,
           pressed ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.16)');

      this.touchGlyph(b.id, cx, cy, pressed);
    },

    // 虚拟按键图形：左/右箭头、跳跃上箭头、冲刺闪电
    touchGlyph(id, cx, cy, pressed) {
      ctx.fillStyle = pressed ? '#ffffff' : '#cfe3ff';
      if (id === 'left' || id === 'right') {
        const s = id === 'left' ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + s * 13, cy);
        ctx.lineTo(cx - s * 8, cy - 12);
        ctx.lineTo(cx - s * 8, cy + 12);
        ctx.closePath();
        ctx.fill();
      } else if (id === 'jump') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 15);
        ctx.lineTo(cx + 13, cy - 1);
        ctx.lineTo(cx + 5, cy - 1);
        ctx.lineTo(cx + 5, cy + 12);
        ctx.lineTo(cx - 5, cy + 12);
        ctx.lineTo(cx - 5, cy - 1);
        ctx.lineTo(cx - 13, cy - 1);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx + 3, cy - 16);
        ctx.lineTo(cx - 10, cy + 2);
        ctx.lineTo(cx - 1, cy + 2);
        ctx.lineTo(cx - 5, cy + 16);
        ctx.lineTo(cx + 11, cy - 4);
        ctx.lineTo(cx + 2, cy - 4);
        ctx.closePath();
        ctx.fill();
      }
    },

    heart(x, y, s, filled) {
      const onColor = filled ? '#ff5b6e' : '#3a3450';
      const shine = filled ? '#ff9aa8' : '#4a4466';
      for (let r = 0; r < HEART_MAP.length; r++) {
        for (let c = 0; c < HEART_MAP[r].length; c++) {
          if (HEART_MAP[r][c] !== '1') continue;
          const color = (r === 1 && c === 2) ? shine : onColor;
          rect(x + c * s, y + r * s, s, s, color);
        }
      }
    },

    // ---- 覆盖层：菜单 / 说明 / 设置 / 选关 / 过渡 / 暂停 / 死亡 / 通关 ----
    overlay() {
      const s = Game.state;
      if (s === 'playing') return;

      // 关卡过渡：半透明黑底 + 关卡名与提示淡入（约 2 秒）
      if (s === 'levelIntro') {
        rect(0, 0, VIEW.W, VIEW.H, 'rgba(4, 7, 14, 0.6)');
        const a = Math.min(1, (120 - Game.introTimer) / 30);
        ctx.globalAlpha = a;
        drawText(Game.endless
                   ? (Game.daily ? '每日挑战 · 第 ' : '无尽模式 · 第 ') +
                     Game.endlessRoom + ' 间'
                   : '关卡 ' + (Game.level + 1) + ' / ' + LEVEL_COUNT,
                 VIEW.W / 2, VIEW.H / 2 - 78, 16, '#8adcff', 'center', false);
        drawText(Level.data.name, VIEW.W / 2, VIEW.H / 2 - 26, 44, '#ffffff');
        drawText(Level.data.tip, VIEW.W / 2, VIEW.H / 2 + 34, 17, '#d7e3f7', 'center', false);
        drawText('准备出发…', VIEW.W / 2, VIEW.H / 2 + 78, 14, '#9fb3d1', 'center', false);
        ctx.globalAlpha = 1;
        return;
      }

      // 死亡瞬间：画面随 0.5 秒延迟渐隐，然后才弹出结算界面
      if (s === 'dying') {
        const t = 1 - Game.dyingTimer / 30;
        rect(0, 0, VIEW.W, VIEW.H,
             'rgba(4, 7, 14, ' + (t * 0.7).toFixed(3) + ')');
        return;
      }

      // 结算类界面按淡入进度整体透明
      let alpha = 1;
      if (s === 'dead') alpha = Game.deadFade;
      else if (s === 'win' || s === 'gameComplete') alpha = Game.winFade;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      rect(0, 0, VIEW.W, VIEW.H, 'rgba(4, 7, 14, 0.85)');

      if (s === 'menu') this.menuOverlay();
      else if (s === 'help') this.helpOverlay();
      else if (s === 'settings') this.settingsOverlay();
      else if (s === 'levelSelect') this.levelSelectOverlay();
      else if (s === 'gallery') this.galleryOverlay();
      else if (s === 'shop') this.shopOverlay();
      else if (s === 'itemSelect') this.itemSelectOverlay();
      else if (s === 'paused') this.pausedOverlay();
      else if (s === 'dead') this.deadOverlay();
      else if (s === 'win') this.winOverlay();
      else if (s === 'gameComplete') this.completeOverlay();

      ctx.globalAlpha = 1;
    },

    // 主菜单
    menuOverlay() {
      drawText('像素跳跃', VIEW.W / 2 + 4, 78, 54, '#05070d');
      drawText('像素跳跃', VIEW.W / 2, 74, 54, '#ffffff');
      drawText('P I X E L   R U N N E R', VIEW.W / 2, 108, 14, '#7fd6ff', 'center', false);

      // 本地存档 / 收集统计（两行，含可支配金币与无尽最远记录）
      const gems = Storage.gemsCount();
      const cleared = Storage.clearedCount();
      const pct = Math.round((cleared / LEVEL_COUNT) * 100);
      drawText('可用金币 ' + Storage.data.bankCoins +
               '　·　宝石 ' + gems + ' / ' + LEVEL_COUNT +
               '　·　通关 ' + cleared + ' / ' + LEVEL_COUNT + '（' + pct + '%）',
               VIEW.W / 2, 128, 13, '#ffd23f', 'center', false);
      drawText('奖章 ' + Storage.medalCount() + ' / ' + (LEVEL_COUNT * 4) +
               '　·　无尽 第 ' + (Storage.data.endlessBest || 0) + ' 间' +
               '　·　每日 第 ' + dailyBestRoom() + ' 间',
               VIEW.W / 2, 148, 13, '#9fb3d1', 'center', false);

      UI.menuButtons().forEach((b, i) => {
        this.panelButton(b, b.label, Game.menuSelected === i);
      });

      drawText('↑/↓ 选择 · 回车/空格 确认 · 也可直接点击按钮',
               VIEW.W / 2, 526, 13, '#9fb3d1', 'center', false);
    },

    // 完整游戏说明
    helpOverlay() {
      drawText('操作说明', VIEW.W / 2, 92, 38, '#ffd23f');
      const lines = [
        'A / D 或 ← / →　左右移动　·　S 下蹲（配合跳跃下穿单向平台）',
        '空格　跳跃（空中再按一次 = 二段跳，长按跳得更高）',
        'Shift　冲刺（短暂无敌，1.5 秒冷却）',
        'ESC　暂停　·　R　重试本关　·　M　静音　·　F　全屏',
        '触屏设备自动显示虚拟按键：左下方向，右下跳跃 / 冲刺',
        '',
        '踩踏敌人头顶可消灭并弹起；侧面碰撞会扣除生命。',
        '发光旗帜是检查点：之后死亡会从最近检查点重生（本关金币保留）。',
        '绿色弹跳板可弹到高处隐藏区；橙色裂纹平台踩上 1 秒后坠落。',
        '蓝色单向平台只能从下方跳上，站在上面按 S + 跳跃 可向下穿落。',
        '每关藏有 1 颗宝石；收集到 3/5/7/9/11/13/15 颗可在设置中解锁新配色（共 8 款）。',
        '爱心拾取可 +1 生命，最多补到生命上限（默认 5 颗，生命强化可提升）',
        '每关开始可选 1 件临时道具；通关金币可在能力商店购买永久能力。',
        '陷阱：捕兽夹 / 滚锯 / 摆锤 / 激光 / 落锤 / 地刺；火球只在硬核模式出现。',
        '第 17~32 关新增炮台怪 / 铁甲怪 / 幽灵；设置可开胆小鬼模式，无尽模式逐间加深。'
      ];
      lines.forEach((l, i) => {
        if (!l) return;
        drawText(l, VIEW.W / 2, 146 + i * 23, 14,
                 i < 5 ? '#d7e3f7' : '#9fb3d1', 'center', i < 5);
      });
      drawText('按 空格 / 回车 / ESC 返回', VIEW.W / 2, 498, 16, '#ffe28a');
    },

    // 设置：音效 / 音乐 / 全屏 / 画质 / 难度 / 皮肤（状态取自本地存档）
    settingsOverlay() {
      drawText('设置', VIEW.W / 2, 92, 34, '#ffd23f');
      drawText('开关与按键会自动保存到本地', VIEW.W / 2, 118, 12, '#9fb3d1', 'center', false);

      const rows = UI.settingsRows();
      const skinList = Storage.availableSkins();
      const skinDef = SKINS[Storage.data.skin] || SKINS[0];
      const skinValue = skinDef.name + '（' + skinList.length + '/' + SKINS.length + '）';
      const rowsData = [
        { label: '音效', value: Storage.data.sfxOn ? '开' : '关', color: Storage.data.sfxOn ? '#7ff0a8' : '#ff8a8a' },
        { label: '背景音乐', value: Storage.data.musicOn ? '开' : '关', color: Storage.data.musicOn ? '#7ff0a8' : '#ff8a8a' },
        { label: '音乐音量', value: Math.round(Storage.data.musicVol * 100) + '%', color: '#8adcff' },
        { label: '音效音量', value: Math.round(Storage.data.sfxVol * 100) + '%', color: '#8adcff' },
        { label: '全屏模式', value: isFullscreen() ? '开' : '关', color: isFullscreen() ? '#7ff0a8' : '#ff8a8a' },
        { label: '低画质模式', value: Storage.data.lowQuality ? '开' : '关', color: Storage.data.lowQuality ? '#ffd23f' : '#9fb3d1' },
        { label: '难度', value: Storage.diff().name, color: '#8adcff' },
        { label: '胆小鬼模式', value: Storage.coward() ? '开' : '关',
          color: Storage.coward() ? '#7ff0a8' : '#9fb3d1' },
        { label: '金币磁铁', value: Storage.data.magnetOn ? '开' : '关',
          color: Storage.data.magnetOn ? '#7ff0a8' : '#ff8a8a' },
        { label: '角色配色', value: skinValue,
          color: skinList.length > 1 ? skinDef.light : '#9fb3d1' },
        { label: '跳跃键', value: keyLabel(Storage.data.keys.jump), color: '#ffd23f' },
        { label: '冲刺键', value: keyLabel(Storage.data.keys.dash), color: '#ffd23f' }
      ];

      rows.forEach((r, i) => {
        const sel = Game.settingsSelected === i;
        if (i === rows.length - 1) this.panelButton(r, '返回', sel);
        else if (r.id === 'musicVol' || r.id === 'sfxVol') {
          this.volumeRow(r, rowsData[i].label, rowsData[i].value, sel);
        } else {
          this.settingRow(r, rowsData[i].label, rowsData[i].value, rowsData[i].color, sel);
        }
      });

      // 胆小鬼模式说明 + 操作提示（压缩为两行，兼容 12 行设置项）
      drawText('胆小鬼模式：敌人减速 · 陷阱停用 · 全程不扣心 · 无限连跳 · 生命 5 颗',
               VIEW.W / 2, 498, 11,
               Storage.coward() ? '#7ff0a8' : '#6b7280', 'center', false);
      const skinRowSelected = rows[Game.settingsSelected] &&
        rows[Game.settingsSelected].id === 'skin';
      let hintLine = '↑/↓ 选择 · 回车切换 · ←/→ 调音量 · 点击音量行的 − / + · ESC 返回';
      if (Game.capturingKey) {
        hintLine = '请按下新的' + (Game.capturingKey === 'jump' ? '跳跃' : '冲刺') + '键（ESC 取消）';
      } else if (skinRowSelected) {
        hintLine = '当前已解锁 ' + skinList.length + '/' + SKINS.length +
          ' 款配色 · 收集宝石到 ' +
          (SKINS[skinList.length] ? SKINS[skinList.length].unlock + ' 颗' : '全部') +
          ' 可解锁下一款 · 回车切换';
      }
      drawText(hintLine, VIEW.W / 2, 518, 12,
        Game.capturingKey ? '#ffd23f' : '#9fb3d1', 'center', false);
    },

    // 设置行：左侧名称 + 右侧当前值
    settingRow(r, label, value, valueColor, selected) {
      rect(r.x, r.y, r.w, r.h, selected ? '#2a4a7a' : '#16223c');
      ctx.strokeStyle = selected ? '#8adcff' : '#3a5a8a';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      if (selected) rect(r.x + 5, r.y + 7, 3, r.h - 14, '#8adcff');

      drawText(label, r.x + 26, r.y + r.h / 2, 16,
               selected ? '#ffffff' : '#c3d2ea', 'left');
      drawText(value, r.x + r.w - 26, r.y + r.h / 2, 16, valueColor, 'right');
    },

    // 音量行：左侧名称，右侧「− 百分比 +」控件
    volumeRow(r, label, value, selected) {
      rect(r.x, r.y, r.w, r.h, selected ? '#2a4a7a' : '#16223c');
      ctx.strokeStyle = selected ? '#8adcff' : '#3a5a8a';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      if (selected) rect(r.x + 5, r.y + 7, 3, r.h - 14, '#8adcff');
      drawText(label, r.x + 26, r.y + r.h / 2, 16,
               selected ? '#ffffff' : '#c3d2ea', 'left');

      const z = UI.volumeZones(r);
      // 减小按钮
      rect(z.minus.x, z.minus.y, z.minus.w, z.minus.h, '#101a2e');
      ctx.strokeStyle = '#3a5a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(z.minus.x + 0.5, z.minus.y + 0.5, z.minus.w - 1, z.minus.h - 1);
      drawText('−', z.minus.x + z.minus.w / 2, z.minus.y + z.minus.h / 2, 15, '#ff9aa8');
      // 百分比
      drawText(value, z.valueX, r.y + r.h / 2, 14, '#8adcff');
      // 增大按钮
      rect(z.plus.x, z.plus.y, z.plus.w, z.plus.h, '#101a2e');
      ctx.strokeStyle = '#3a5a8a';
      ctx.strokeRect(z.plus.x + 0.5, z.plus.y + 0.5, z.plus.w - 1, z.plus.h - 1);
      drawText('+', z.plus.x + z.plus.w / 2, z.plus.y + z.plus.h / 2, 15, '#7ff0a8');
    },

    // 图鉴中心：奖章 / 怪物 双页签
    galleryOverlay() {
      drawText('图鉴中心', VIEW.W / 2, 58, 34, '#ffd23f');
      for (const t of UI.galleryTabs()) {
        const sel = Game.galleryTab === t.tab;
        rect(t.x, t.y, t.w, t.h, sel ? '#24466f' : '#16223c');
        ctx.strokeStyle = sel ? '#8adcff' : '#3a5a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
        drawText(t.label, t.x + t.w / 2, t.y + 20, 14,
          sel ? '#ffffff' : '#9fb3d1', 'center', false);
      }
      if (Game.galleryTab === 1) this.bestiaryOverlay();
      else this.medalGalleryOverlay();
      const hint = Game.galleryTab === 0
        ? '奖章 ' + Storage.medalCount() + ' / ' + (LEVEL_COUNT * 4) +
          ' · 宝石 ' + Storage.gemsCount() + ' / ' + LEVEL_COUNT +
          ' · ← → 切换页签 · ESC 返回'
        : '← → 切换页签 · ESC 返回';
      drawText(hint, VIEW.W / 2, 524, 13, '#9fb3d1', 'center', false);
    },

    // 奖章图鉴（原收集图鉴内容）
    medalGalleryOverlay() {
      const defs = [
        { key: 'clear', label: '通关', color: '#7ff0a8' },
        { key: 'coins', label: '全金币', color: '#ffd23f' },
        { key: 'gem',   label: '宝石', color: '#8adcff' },
        { key: 'noHit', label: '无伤', color: '#ff9aa8' }
      ];
      for (const c of UI.galleryCards()) {
        const best = Storage.data.levelBests[c.index] ||
          { medals: {} };
        const m = best.medals || {};
        const unlocked = c.index <= Storage.data.unlocked;
        rect(c.x, c.y, c.w, c.h, unlocked ? '#16223c' : '#101622');
        ctx.strokeStyle = unlocked ? '#3a5a8a' : '#232c40';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);

        const cx = c.x + c.w / 2;
        const compact = c.w < 150;
        drawText(compact ? levelShortName(c.index) : LEVELS[c.index].name,
                 cx, c.y + (compact ? 14 : 18), compact ? 10 : 11,
                 unlocked ? '#ffffff' : '#5a6480', 'center', false);
        defs.forEach((d, k) => {
          const sx = compact ? cx - 36 + k * 24 : cx - 76 + k * 38;
          const got = unlocked && m[d.key];
          const box = compact ? 9 : 12;
          rect(sx + (compact ? 7 : 10), c.y + (compact ? 26 : 28), box, box,
               got ? d.color : '#2a3450');
          rect(sx + (compact ? 9 : 12), c.y + (compact ? 28 : 30), box - 4, box - 4,
               got ? '#ffffff' : '#3a455e');
          drawText(d.label, sx + (compact ? 11 : 16), c.y + (compact ? 48 : 53),
                   compact ? 8 : 9, got ? d.color : '#5a6480', 'center', false);
        });
      }
    },

    // 怪物图鉴图标缓存（40×40 离屏画布，懒加载）
    _bestiaryIcons: Object.create(null),
    _bossIcons: Object.create(null),
    bestiaryIcon(id) {
      const cached = this._bestiaryIcons[id];
      if (cached) return cached;
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      const old = ctx;
      ctx = cc;
      try {
        if (id === 'walker')
          cc.drawImage(enemySprite('walker', 0, true, (sx, sy) => this.enemyWalker(sx, sy, 0, true)), 0, 0);
        else if (id === 'flyer')
          cc.drawImage(enemySprite('flyer', 0, true, (sx, sy) => this.enemyFlyer(sx, sy, 0)), 0, 0);
        else if (id === 'spiky')
          cc.drawImage(enemySprite('spiky', 0, true, (sx, sy) => this.enemySpiky(sx, sy, 0)), 0, 0);
        else {
          const fake = {
            hopY: 0, hopCd: 20, fireCd: 40, hp: 2, hurtTimer: 0,
            hover: 0, dir: 1, charging: false, anim: 0, alive: true
          };
          if (id === 'charger') this.enemyCharger(fake, 4, 10, 0);
          else if (id === 'hopper') this.enemyHopper(fake, 4, 10, 0);
          else if (id === 'shooter') this.enemyShooter(fake, 4, 10, 0);
          else if (id === 'armored') this.enemyArmored(fake, 4, 10, 0);
          else if (id === 'ghost') this.enemyGhost(fake, 4, 10, 0);
        }
      } finally {
        ctx = old;
      }
      this._bestiaryIcons[id] = c;
      return c;
    },
    // Boss 图标缓存（80×84，裁剪掉血条区域）
    bossIcon(style) {
      const cached = this._bossIcons[style];
      if (cached) return cached;
      const c = document.createElement('canvas');
      c.width = 80; c.height = 84;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      cc.beginPath();
      cc.rect(0, 12, 80, 72);      // 裁掉顶部血条
      cc.clip();
      const old = ctx;
      ctx = cc;
      const savedBoss = Level.boss;
      try {
        Level.boss = {
          alive: true, x: 8, y: 20, w: 64, h: 64, hp: 5, maxHp: 5,
          phase: 1, dir: 1, act: 0, anim: 0, hurtTimer: 0, style, chargeDir: 1
        };
        this.boss();
      } finally {
        Level.boss = savedBoss;
        ctx = old;
      }
      this._bossIcons[style] = c;
      return c;
    },
    // 威胁星级字符串
    threatStars(n) {
      return '★'.repeat(n) + '☆'.repeat(3 - n);
    },

    // 怪物图鉴页：8 种普通怪 + 3 个 Boss
    bestiaryOverlay() {
      for (const c of UI.bestiaryCards()) {
        rect(c.x, c.y, c.w, c.h, '#16223c');
        ctx.strokeStyle = '#3a5a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        // 图标（40×40 放大到 48×48，像素风不插值）
        ctx.drawImage(this.bestiaryIcon(c.id), c.x + (c.w - 48) / 2, c.y + 6, 48, 48);
        drawText(c.name, c.x + c.w / 2, c.y + 64, 14, '#ffffff', 'center', false);
        drawText(this.threatStars(c.threat), c.x + c.w / 2, c.y + 79,
          11, '#ffd23f', 'center', false);
        drawText(c.desc, c.x + c.w / 2, c.y + 99, 9, '#9fb3d1', 'center', false);
        drawText('第 ' + c.first + ' 关登场', c.x + c.w / 2, c.y + 119,
          9, '#7fd6ff', 'center', false);
      }
      for (const c of UI.bossCards()) {
        rect(c.x, c.y, c.w, c.h, '#1d2440');
        ctx.strokeStyle = '#5a4a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        ctx.drawImage(this.bossIcon(c.id), c.x + 8, c.y + 7, 64, 68);
        const tx = c.x + 80;
        drawText(c.name, tx, c.y + 19, 15, '#ffd23f', 'left', false);
        drawText(this.threatStars(c.threat) + '　首领 · 第 ' + c.first + ' 关',
          tx, c.y + 37, 10, '#ffb066', 'left', false);
        drawText(c.desc, tx, c.y + 57, 9, '#c8b8e8', 'left', false);
      }
    },

    // 能力商店：可支配金币购买永久能力
    shopOverlay() {
      drawText('能力商店', VIEW.W / 2, 96, 36, '#ffd23f');
      drawText('可用金币 ' + Storage.data.bankCoins +
               '　·　通关金币自动存入，能力永久生效',
               VIEW.W / 2, 128, 14, '#ffd23f', 'center', false);

      const rows = UI.shopRows();
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i], r = rows[i];
        const sel = Game.shopSelected === i;
        const lv = Storage.upgrade(u.id);
        const maxed = lv >= u.max;
        const price = Storage.upgradePrice(u);
        const afford = Storage.data.bankCoins >= price;

        rect(r.x + 3, r.y + 3, r.w, r.h, 'rgba(0, 0, 0, 0.35)');
        rect(r.x, r.y, r.w, r.h, sel ? '#24466f' : '#16223c');
        ctx.strokeStyle = sel ? '#8adcff' : '#3a5a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        if (sel) rect(r.x + 5, r.y + 6, 3, r.h - 12, '#8adcff');

        drawText(u.name + '　Lv' + lv + ' / ' + u.max, r.x + 26, r.y + 13,
                 14, '#ffffff', 'left', false);
        drawText(u.desc, r.x + 26, r.y + 29, 10, '#9fb3d1', 'left', false);
        drawText(maxed ? '已满级' : price + ' 金币',
                 r.x + r.w - 26, r.y + 15, 13,
                 maxed ? '#7ff0a8' : (afford ? '#ffd23f' : '#ff8a8a'), 'right');
        // 等级点阵
        for (let k = 0; k < u.max; k++) {
          rect(r.x + r.w - 26 - 12 - k * 14, r.y + 26, 9, 6,
               k < lv ? '#7ff0a8' : '#2a3450');
        }
      }

      const back = rows[rows.length - 1];
      this.panelButton(back, '返回', Game.shopSelected === rows.length - 1);

      drawText(Game.shopMsg || '↑/↓ 选择 · 回车购买 · ESC 返回',
               VIEW.W / 2, 512, 11,
               Game.shopMsg ? '#ffd23f' : '#9fb3d1', 'center', false);
    },

    // 道具选择：每关开始 4 选 1（可跳过）
    itemSelectOverlay() {
      const title = Game.endless
        ? (Game.daily ? '每日挑战 · 第 ' : '无尽 · 第 ') +
          Game.endlessRoom + ' 间' + (Level.boss ? ' · 首领' : '')
        : Level.data.name;
      drawText(title, VIEW.W / 2, 100, 30, '#ffffff');
      drawText('选择一件本关道具（死亡重试会保留）', VIEW.W / 2, 142, 14,
               '#9fb3d1', 'center', false);
      drawText('可用金币 ' + Storage.data.bankCoins + '　·　永久强化可在能力商店购买',
               VIEW.W / 2, 166, 12, '#ffd23f', 'center', false);

      UI.itemCards().forEach((c, i) => {
        const it = ITEMS[i];
        const sel = Game.itemSel === i;
        rect(c.x + 3, c.y + 3, c.w, c.h, 'rgba(0, 0, 0, 0.35)');
        rect(c.x, c.y, c.w, c.h, sel ? '#24466f' : '#16223c');
        ctx.strokeStyle = sel ? it.color : '#3a5a8a';
        ctx.lineWidth = sel ? 3 : 2;
        ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);

        // 道具图标（像素方块 + 高光）
        const cx = c.x + c.w / 2, cy = c.y + 54;
        rect(cx - 16, cy - 16, 32, 32, it.color);
        rect(cx - 12, cy - 12, 12, 6, '#ffffff');
        drawText(it.name, cx, c.y + 96, 18, sel ? '#ffffff' : '#d7e3f7',
                 'center', false);
        drawText(it.desc, cx, c.y + 118, 11, '#9fb3d1', 'center', false);
      });

      const skip = UI.itemSkip();
      this.panelButton(skip, '不选道具，直接出发', false);
      drawText('←/→ 选择 · 回车确认 · ESC 跳过', VIEW.W / 2, 500, 13,
               '#9fb3d1', 'center', false);
    },

    // 关卡选择：第一 / 第二篇章两个页签，每页 4×4 大卡片
    levelSelectOverlay() {
      drawText('选择关卡', VIEW.W / 2, 100, 34, '#ffd23f');
      drawText('共 ' + LEVEL_COUNT + ' 关 · 已通关的关卡可自由重玩',
               VIEW.W / 2, 132, 13, '#9fb3d1', 'center', false);

      for (const tab of UI.actTabs()) {
        this.actTab(tab, Game.levelAct === tab.act);
      }

      UI.levelCards().forEach((c) => {
        this.levelCard(c, c.index, Game.levelSel === c.index);
      });

      const back = UI.levelBackButton();
      this.panelButton(back, back.label, false);
      drawText('←/→ 选择 · ↑/↓ 换行 · 回车进入 · 点击页签切换篇章 · ESC 返回',
               VIEW.W / 2, 522, 12, '#9fb3d1', 'center', false);
    },

    // 篇章页签
    actTab(t, active) {
      rect(t.x + 3, t.y + 3, t.w, t.h, 'rgba(0, 0, 0, 0.35)');
      rect(t.x, t.y, t.w, t.h, active ? '#24466f' : '#16223c');
      ctx.strokeStyle = active ? '#8adcff' : '#3a5a8a';
      ctx.lineWidth = active ? 3 : 2;
      ctx.strokeRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
      drawText(t.label, t.x + t.w / 2, t.y + 13, 14,
               active ? '#ffffff' : '#d7e3f7');
      drawText(t.sub, t.x + t.w / 2, t.y + 25, 10,
               active ? '#8adcff' : '#9fb3d1', 'center', false);
    },

    // 单张关卡卡片：未解锁显示锁定，已通关显示标记与最佳记录
    levelCard(c, index, selected) {
      const unlocked = index <= Storage.data.unlocked;
      const best = Storage.data.levelBests[index] ||
        { cleared: false, coins: 0, time: 0 };
      const cleared = best.cleared;
      const cardY = c.y + (selected ? -6 : 0);
      const compact = c.h < 100;
      const dense = c.h < 70;
      const tiny = c.h <= 58;
      const wideCard = c.w >= 160;      // 分篇章后的 4×4 大卡片

      rect(c.x + 4, cardY + 4, c.w, c.h, 'rgba(0, 0, 0, 0.35)');
      rect(c.x, cardY, c.w, c.h, unlocked ? (selected ? '#24466f' : '#16223c') : '#101622');
      ctx.strokeStyle = selected ? '#8adcff' : (unlocked ? '#3a5a8a' : '#232c40');
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(c.x + 1, cardY + 1, c.w - 2, c.h - 2);

      const cx = c.x + c.w / 2;
      // 左上角关卡序号
      if (wideCard) {
        rect(c.x + 12, cardY + 9, 26, 18, unlocked ? '#3fb6ff' : '#2a3450');
        drawText(String(index + 1), c.x + 25, cardY + 22, 12, '#ffffff');
      } else {
        rect(c.x + 10, cardY + 4, compact ? 22 : 24, dense ? 13 : (compact ? 16 : 20),
             unlocked ? '#3fb6ff' : '#2a3450');
        drawText(String(index + 1), c.x + 21, cardY + (dense ? 11 : (compact ? 13 : 18)),
                 dense ? 10 : (compact ? 11 : 13), '#ffffff');
      }

      if (wideCard) {
        drawText(levelShortName(index), cx, cardY + 26, 14,
                 unlocked ? '#ffffff' : '#5a6480');
      } else {
        drawText(dense ? levelShortName(index) : LEVELS[index].name, cx,
                 cardY + (tiny ? 24 : (dense ? 26 : (compact ? 30 : 38))),
                 tiny ? 10 : (dense ? 11 : (compact ? 14 : 16)),
                 unlocked ? '#ffffff' : '#5a6480');
      }

      if (unlocked) {
        const total = LEVELS[index].coins.length * (LEVELS[index].repeatOffset ? 2 : 1);
        if (wideCard) {
          drawText('金币 ' + best.coins + '/' + total, cx, cardY + 43, 10,
                   cleared ? '#ffd23f' : '#9fb3d1', 'center', false);
          drawText(cleared ? '已通关 ★' : '可挑战', cx, cardY + 56, 11,
                   cleared ? '#7ff0a8' : '#b7c6e0', 'center', false);
        } else if (dense) {
          drawText('金币 ' + best.coins + '/' + total + ' · ' + formatTime(best.time),
                   cx, cardY + (tiny ? 36 : 41), tiny ? 9 : 10,
                   cleared ? '#ffd23f' : '#9fb3d1', 'center', false);
          drawText(cleared ? '已通关 ★' : '可挑战', cx, cardY + (tiny ? 50 : 56),
                   tiny ? 10 : 11,
                   cleared ? '#7ff0a8' : '#b7c6e0', 'center', false);
        } else if (compact) {
          drawText('金币 ' + best.coins + '/' + total + ' · 最快 ' + formatTime(best.time),
                   cx, cardY + 50, 11, cleared ? '#ffd23f' : '#9fb3d1', 'center', false);
          drawText(cleared ? '已通关 ★' : '可挑战', cx, cardY + 69, 12,
                   cleared ? '#7ff0a8' : '#b7c6e0', 'center', false);
        } else {
          drawText('金币 ' + best.coins + ' / ' + total,
                   cx, cardY + 60, 13, cleared ? '#ffd23f' : '#9fb3d1', 'center', false);
          drawText('最快 ' + formatTime(best.time), cx, cardY + 77, 12,
                   '#8adcff', 'center', false);
          drawText(cleared ? '已通关 ★' : '可挑战', cx, cardY + 93, 13,
                   cleared ? '#7ff0a8' : '#b7c6e0', 'center', false);
        }
      } else {
        drawText('未解锁', cx,
                 cardY + (wideCard ? 44 : (tiny ? 42 : (dense ? 44 : (compact ? 52 : 64)))),
                 wideCard ? 11 : (tiny ? 10 : (dense ? 11 : 13)), '#6b7280');
      }
    },

    // 暂停
    pausedOverlay() {
      drawText('已暂停', VIEW.W / 2, 138, 46, '#ffffff');
      UI.pauseItems().forEach((b, i) => {
        this.panelButton(b, b.label, Game.pauseSelected === i);
      });
      drawText(Game.multiplayer && Net.role === 'guest'
        ? '等待房主继续游戏…'
        : '↑/↓ 选择 · 回车确认 · ESC 继续',
        VIEW.W / 2, 472, 14, '#9fb3d1', 'center', false);
    },

    // 死亡结算（0.5 秒延迟后淡入）
    deadOverlay() {
      if (Game.endless) {
        drawText(Game.daily ? '每日挑战结束' : '无尽结束',
                 VIEW.W / 2, 168, 48, '#ff6b6b');
        drawText('到达房间：第 ' + Game.endlessRoom + ' 间',
                 VIEW.W / 2, 232, 20, '#d7e3f7');
        drawText('本局金币：' + Game.totalCoins,
                 VIEW.W / 2, 268, 20, '#ffd23f');
        const record = Game.daily
          ? ((Storage.data.daily && Storage.data.daily.bestRoom) || 0)
          : (Storage.data.endlessBest || 0);
        drawText((Game.daily ? '今日最佳：第 ' : '最远记录：第 ') + record + ' 间',
                 VIEW.W / 2, 300, 15, '#8adcff', 'center', false);
        drawText('本局金币已存入能力商店，可用于购买永久能力',
                 VIEW.W / 2, 328, 13, '#9fb3d1', 'center', false);
        UI.deadButtons().forEach((b, i) => this.panelButton(b, b.label, i === 0));
        drawText(Game.multiplayer && Net.role === 'guest'
          ? '等待房主选择…'
          : '空格 / R 重新开始　·　ESC 返回主菜单',
          VIEW.W / 2, 496, 14, '#9fb3d1', 'center', false);
        return;
      }
      drawText('生命耗尽', VIEW.W / 2, 168, 52, '#ff6b6b');
      drawText('本关收集金币：' + Game.coins, VIEW.W / 2, 240, 20, '#ffd23f');
      drawText('历史最高金币：' + Storage.data.bestCoins, VIEW.W / 2, 276, 15, '#9fb3d1');
      UI.deadButtons().forEach((b, i) => this.panelButton(b, b.label, i === 0));
      drawText(Game.multiplayer && Net.role === 'guest'
        ? '等待房主选择…'
        : '空格 / R 重试　·　ESC 返回主菜单',
        VIEW.W / 2, 496, 14, '#9fb3d1', 'center', false);
    },

    // 单关通关：用时 / 金币收集率 / 本关最佳记录
    winOverlay() {
      const total = Level.coinCfgs.length;
      const best = Storage.data.levelBests[Game.level] ||
        { coins: 0, time: 0 };
      const rate = total ? Math.round((Game.coins / total) * 100) : 0;

      if (Game.endless) {
        drawText('房间通过！', VIEW.W / 2, 136, 46, '#ffd23f');
        drawText((Game.daily ? '每日挑战 · 第 ' : '无尽 · 第 ') +
                 Game.endlessRoom + ' 间' + (Level.boss ? ' · 首领' : ''),
                 VIEW.W / 2, 180, 17, '#9fb3d1', 'center', false);
        drawText('本间用时：' + formatTime(Game.levelTime),
                 VIEW.W / 2, 216, 18, '#d7e3f7');
        drawText('本间金币：' + Game.coins + ' / ' + total,
                 VIEW.W / 2, 246, 18, '#ffd23f');
        drawText('本局累计金币：' + Game.totalCoins,
                 VIEW.W / 2, 274, 15, '#9fb3d1', 'center', false);
        drawText('最远记录：第 ' + (Storage.data.endlessBest || 0) + ' 间',
                 VIEW.W / 2, 298, 14, '#8adcff', 'center', false);
        drawText('深入下一间会更强，也可返回主菜单结算金币',
                 VIEW.W / 2, 320, 13, '#8adcff', 'center', false);
        UI.winButtons().forEach((b, i) => this.panelButton(b, b.label, i === 0));
        drawText(Game.multiplayer && Net.role === 'guest'
          ? '等待房主选择…'
          : '空格 / R 进入下一房间',
          VIEW.W / 2, 496, 14, '#9fb3d1', 'center', false);
        return;
      }

      drawText('过关！', VIEW.W / 2, 148, 50, '#ffd23f');
      drawText(Level.data.name, VIEW.W / 2, 194, 16, '#9fb3d1', 'center', false);
      drawText('本关用时：' + formatTime(Game.levelTime),
               VIEW.W / 2, 232, 19, '#d7e3f7');
      drawText('本关金币：' + Game.coins + ' / ' + total + '（收集率 ' + rate + '%）',
               VIEW.W / 2, 262, 19, '#ffd23f');
      drawText('累计金币：' + Game.totalCoins,
               VIEW.W / 2, 290, 15, '#9fb3d1', 'center', false);
      drawText('最佳记录：金币 ' + best.coins + ' · 用时 ' + formatTime(best.time),
               VIEW.W / 2, 314, 14, '#8adcff', 'center', false);
      drawText('剩余生命：' + Game.lives,
               VIEW.W / 2, 338, 14, '#9fb3d1', 'center', false);
      UI.winButtons().forEach((b, i) => this.panelButton(b, b.label, i === 0));
      drawText(Game.multiplayer && Net.role === 'guest'
        ? '等待房主选择…'
        : '空格 / R 进入下一关',
        VIEW.W / 2, 496, 14, '#9fb3d1', 'center', false);
    },

    // 全游戏通关（含彩带庆祝动画）
    completeOverlay() {
      this.confetti();
      drawText('全部通关！', VIEW.W / 2, 146, 50, '#ffd23f');
      drawText('恭喜击败终焉 Boss · 三十二关全通',
               VIEW.W / 2, 192, 17, '#d7e3f7');
      drawText('总收集金币：' + Game.totalCoins,
               VIEW.W / 2, 236, 21, '#ffd23f');
      drawText('总用时：' + formatTime(Game.runTime),
               VIEW.W / 2, 270, 18, '#d7e3f7');
      drawText('剩余生命：' + Game.lives,
               VIEW.W / 2, 300, 15, '#9fb3d1');
      drawText('历史最高金币：' + Storage.data.bestCoins,
               VIEW.W / 2, 326, 15, '#9fb3d1');
      UI.completeButtons().forEach((b) => this.panelButton(b, b.label, true));
      drawText(Game.multiplayer && Net.role === 'guest'
        ? '等待房主返回大厅…'
        : '按 空格 / 回车 返回主菜单',
        VIEW.W / 2, 496, 14, '#9fb3d1', 'center', false);
    },

    // 屏幕空间庆祝彩带（数量有上限，绘制在结算文字之下）
    confetti() {
      for (const c of Game.confetti) {
        rect(c.x, c.y, c.size, c.size * 0.6, c.color);
      }
    },

    // 通用菜单按钮（像素双层边框：外暗框 + 内高光 + 四角像素点）
    panelButton(r, label, selected) {
      const edge = selected ? '#8adcff' : '#3a5a8a';
      rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, '#05070d');
      rect(r.x, r.y, r.w, r.h, selected ? '#223b5e' : '#141f36');
      rect(r.x + 2, r.y + 2, r.w - 4, 2, selected ? '#a8e8ff' : '#2a4268');
      rect(r.x + 2, r.y + r.h - 3, r.w - 4, 2, '#0a1220');
      // 四角像素缺口
      rect(r.x, r.y, 4, 2, edge);
      rect(r.x, r.y, 2, 4, edge);
      rect(r.x + r.w - 4, r.y, 4, 2, edge);
      rect(r.x + r.w - 2, r.y, 2, 4, edge);
      rect(r.x, r.y + r.h - 2, 4, 2, edge);
      rect(r.x, r.y + r.h - 4, 2, 4, edge);
      rect(r.x + r.w - 4, r.y + r.h - 2, 4, 2, edge);
      rect(r.x + r.w - 2, r.y + r.h - 4, 2, 4, edge);
      if (selected) rect(r.x + 5, r.y + 7, 3, r.h - 14, '#8adcff');
      drawText(label, r.x + r.w / 2, r.y + r.h / 2, 20,
               selected ? '#ffffff' : '#b7c6e0');
    }
  };

  // ============================================================

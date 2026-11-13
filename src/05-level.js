  // 5. 关卡模块：平台、移动平台、敌人、金币、尖刺、Boss、旗帜
  // ============================================================
  const Level = {
    index: 0,
    data: null,
    platforms: [],
    fallPlats: [],      // 下坠平台（同时加入 platforms 参与碰撞）
    pads: [],           // 弹跳板
    checkpoints: [],    // 检查点
    activeCheckpoint: -1,
    enemies: [],
    coins: [],
    spikes: [],
    boss: null,
    bossDefeated: false, // Boss 是否已被击败（死亡重生时不重新生成）
    flag: null,
    flagTrigger: null,
    snapshot: null,     // 检查点快照（金币数 / 金币状态 / 敌人状态）
    bossFightStarted: false, // 是否已进入 Boss 战（决定 Boss 房重生点）
    bossIntroT: 0,           // Boss 入场演出剩余帧数（期间 Boss 不攻击）
    animTick: 0,        // 关卡内平台动画计时（仅游戏进行时递增，切关重置）
    popups: [],         // 收集数字弹出
    trail: [],          // 冲刺残影
    rings: [],          // 二段跳扩散光环
    gems: [],           // 本关宝石（隐藏收集物）
    hearts: [],         // 爱心拾取（+1 生命，最多 5 颗）
    fruits: [],         // 变大果实
    traps: [],          // 陷阱（火球 / 激光 / 捕兽夹）
    projectiles: [],    // 火球弹体
    lava: null,         // 熔岩上涨状态
    gates: [],          // 机关门与开关
    hints: [],          // 首次机制提示（经过后消失）

    // index 可为关卡序号；传入数据对象时为运行时关卡（无尽模式）
    load(index) {
      const runtime = index && typeof index === 'object' ? index : null;
      this.index = runtime ? -1 : index;
      const src = runtime || LEVELS[index];
      this.runtime = !!runtime;
      this.data = src;
      this.biome = src.biome || BIOME_BY_LEVEL[this.index] || {};   // 本关环境机制（冰面 / 风）
      const off = src.repeatOffset || 0;   // >0 时把前半段复制到后半段，实现关卡长度翻倍
      const mirror = !!(off && !src.noMirror); // 默认镜像复制，避免后半段与前半段完全重复
      const mapX = (x, w) => mirror ? off * 2 - x - (w || 0) : x + off;
      const baseCount = src.platforms.length;

      // 深拷贝平台并记录 baseX/baseY（移动平台需要）
      this.platforms = src.platforms.map((p) => ({
        ...p,
        baseX: p.x, baseY: p.y,
        dx: 0, dy: 0
      }));
      // 后半段复制（镜像或平移，并做变体：部分浮台改为单向平台、移动平台变速）
      if (off) {
        let ledgeSeq = 0;
        for (const p of src.platforms) {
          const clone = {
            ...p, x: mapX(p.x, p.w), baseX: mapX(p.x, p.w), baseY: p.y, dx: 0, dy: 0
          };
          if (clone.move) {
            // 移动平台变体：振幅与速度略变、相位错开，避免前后段完全同节奏
            clone.move = {
              ...clone.move,
              range: Math.round((p.move.range * 1.15) * 10) / 10,
              speed: p.move.speed * 1.18,
              phase: p.move.phase + 2.4
            };
          } else if (clone.kind === 'ledge' && !clone.oneWay) {
            ledgeSeq++;
            // 每 3 块普通浮台改为单向平台，增加后半段路线差异
            if (ledgeSeq % 3 === 0) clone.oneWay = true;
          }
          this.platforms.push(clone);
        }
      }
      // 下坠平台：附带独立状态机，并加入碰撞集合
      this.fallPlats = (src.fallPlats || []).map((f) => ({
        x: f.x, y: f.y, w: f.w, h: f.h || 16, kind: 'ledge',
        baseX: f.x, baseY: f.y, dx: 0, dy: 0,
        fall: true, state: 'idle',   // idle → gone → idle
        timer: 0, alpha: 1, respawn: 0
      }));
      if (off) {
        for (const f of src.fallPlats || []) {
          this.fallPlats.push({
            x: mapX(f.x, f.w), y: f.y, w: f.w, h: f.h || 16, kind: 'ledge',
            baseX: mapX(f.x, f.w), baseY: f.y, dx: 0, dy: 0,
            fall: true, state: 'idle', timer: 0, alpha: 1, respawn: 0
          });
        }
      }
      for (const f of this.fallPlats) this.platforms.push(f);
      // 弹跳板 / 检查点
      this.pads = (src.pads || []).map((p) => ({
        x: p.x, y: p.y, w: p.w || 52,
        squash: 0, cool: 0
      }));
      if (off) {
        for (const p of src.pads || []) {
          const w = p.w || 52;
          this.pads.push({ x: mapX(p.x, w), y: p.y, w, squash: 0, cool: 0 });
        }
      }
      this.checkpoints = (src.checkpoints || []).map((c) => ({
        x: c.x, y: c.y, activated: false
      }));
      if (off) {
        for (const c of src.checkpoints || []) {
          this.checkpoints.push({ x: mapX(c.x, 0), y: c.y, activated: false });
        }
      }
      this.activeCheckpoint = -1;
      this.bossDefeated = false;
      this.snapshot = null;
      this.bossFightStarted = false;
      this.bossIntroT = 0;
      this.animTick = 0;

      // 移动平台先摆到相位 0 的初始位置，避免开局第一帧从基准点瞬移
      for (const p of this.platforms) {
        if (!p.move) continue;
        const s = Math.sin(p.move.phase);
        const eased = Math.sign(s) * Math.pow(Math.abs(s), MECH.MOVER_EASE_POWER);
        if (p.move.axis === 'x') p.x = p.baseX + eased * p.move.range;
        else p.y = p.baseY + eased * p.move.range;
      }

      // 尖刺 / 金币 / 敌人配置（含后半段副本）
      this.spikes = src.spikes.map((s) => ({ ...s }));
      this.coinCfgs = src.coins.map((c) => ({ ...c }));
      this.enemyCfgs = src.enemies.map((e) => ({ ...e }));
      if (off) {
        for (const s of src.spikes) this.spikes.push({ ...s, x: mapX(s.x, s.w) });
        for (const c of src.coins) this.coinCfgs.push({ ...c, x: mapX(c.x, COIN_SIZE.w) });
        for (const e of src.enemies) {
          this.enemyCfgs.push({
            ...e, x: mapX(e.x, ENEMY_SIZE.w),
            dir: mirror ? -e.dir : e.dir,
            platform: e.platform + baseCount
          });
        }
      }
      // Boss 配置与 Boss 房入口（仅少数关启用，Boss 关不平移镜像）
      this.bossCfg = src.boss ? { ...src.boss } : null;
      this.bossArena = src.bossArena ? { ...src.bossArena } : null;
      if (off && this.bossCfg) {
        this.bossCfg.platform += baseCount;
        this.bossCfg.x = mapX(this.bossCfg.x, BOSS_SIZE.w);
      }
      if (off && this.bossArena) this.bossArena.x = mapX(this.bossArena.x, PLAYER_SIZE.w);
      // 兜底修正：静态尖刺必须落在实体平台上，避免悬空在深坑中央
      this.sanitizeSpikes();

      this.resetEnemies();
      this.resetCoins();
      this.resetBoss();
      this.flag = src.flag ? { ...src.flag } : null;
      this.flagTrigger = src.flagTrigger ? { ...src.flagTrigger } : null;
      this.popups = [];
      this.trail = [];
      this.rings = [];
      // 宝石：已收集过的关卡不再重复显示（藏在第一段隐藏路线）
      // 运行时关卡（无尽）由 src.gems 直接提供
      const spots = [];
      if (src.gems) {
        // 第二篇章等运行时提供的宝石位置：同样遵循“本关已收集则不再出现”
        if (Game.multiplayer || !Storage.data.gems[this.index]) {
          for (const g of src.gems) spots.push({ ...g });
        }
      } else {
        const spot = GEM_SPOTS[this.index];
        // 联机模式统一显示宝石，保证房主与客人场景一致
        if (spot && (Game.multiplayer || !Storage.data.gems[this.index])) {
          spots.push(spot);
        }
      }
      this.gems = spots.map((s) => ({
        x: s.x, y: s.y, w: GEM_SIZE.w, h: GEM_SIZE.h, collected: false
      }));
      // 爱心拾取物：前半段 + 后半段各一份（每次进入关卡重置）
      const heartSpots = src.hearts || HEART_SPOTS[this.index] || [];
      this.hearts = [];
      for (const h of heartSpots) {
        this.hearts.push({ x: h.x, y: h.y, w: 16, h: 16, collected: false });
        if (off) {
          this.hearts.push({ x: mapX(h.x, 16), y: h.y, w: 16, h: 16, collected: false });
        }
      }
      // 变大果实：前半段 + 后半段各一份
      const fruit = src.fruits ? src.fruits[0] : FRUIT_SPOTS[this.index];
      this.fruits = [];
      if (fruit) {
        this.fruits.push({ x: fruit.x, y: fruit.y, w: 18, h: 18, collected: false });
        if (off) this.fruits.push({ x: mapX(fruit.x, 18), y: fruit.y, w: 18, h: 18, collected: false });
      }
      // 陷阱：捕兽夹 / 火球发射口 / 周期激光 / 滚锯 / 摆锤（后半段镜像复制）
      const trapW = (t) => t.kind === 'laser' ? (t.w || 120)
        : t.kind === 'bear' ? TRAP.BEAR_W
        : t.kind === 'saw' ? TRAP.SAW_W
        : t.kind === 'pendulum' ? TRAP.PEND_W
        : t.kind === 'crusher' ? TRAP.CRUSHER_W
        : t.kind === 'popspike' ? TRAP.SPIKE_W : 24;
      const makeTrap = (t, x, dir) => {
        const kind = t.kind;
        const w = kind === 'laser' ? (t.w || 120)
          : kind === 'bear' ? TRAP.BEAR_W
          : kind === 'saw' ? TRAP.SAW_W
          : kind === 'pendulum' ? TRAP.PEND_W
          : kind === 'crusher' ? TRAP.CRUSHER_W
          : kind === 'popspike' ? TRAP.SPIKE_W : 24;
        const h = kind === 'laser' ? 10
          : kind === 'bear' ? TRAP.BEAR_H
          : kind === 'saw' ? TRAP.SAW_W
          : kind === 'pendulum' ? TRAP.PEND_W
          : kind === 'crusher' ? TRAP.CRUSHER_H
          : kind === 'popspike' ? TRAP.SPIKE_H : 24;
        const tr = {
          kind, x, w, h,
          y: kind === 'bear' ? GROUND_Y - TRAP.BEAR_H
            : kind === 'crusher' ? TRAP.CRUSHER_TOP
            : kind === 'popspike' ? GROUND_Y
            : (t.y !== undefined ? t.y : GROUND_Y - 30),
          baseY: kind === 'crusher' ? TRAP.CRUSHER_TOP
            : kind === 'popspike' ? GROUND_Y : undefined,
          dir: dir || t.dir || 1,
          timer: t.phase || 0,
          fireTimer: 0, active: false, warn: false, snap: 0, cool: 0,
          armed: false                         // 玩家接近后才启动
        };
        if (kind === 'saw') {
          // 滚锯：沿地面左右巡逻，x 为巡逻中心
          tr.baseX = x;
          tr.range = t.range || TRAP.SAW_RANGE;
          tr.speed = t.speed || TRAP.SAW_SPEED;
          tr.y = GROUND_Y - TRAP.SAW_W - 2;
          tr.x = x + Math.sin(tr.timer * tr.speed) * tr.range;
        } else if (kind === 'pendulum') {
          // 摆锤：x 为悬挂点，球体位置随摆角计算
          tr.pivotX = x;
          tr.pivotY = t.y !== undefined ? t.y : TRAP.PEND_PIVOT_Y;
          tr.len = t.len || TRAP.PEND_LEN;
          tr.amp = t.amp !== undefined ? t.amp : TRAP.PEND_AMP;
          tr.speed = t.speed || TRAP.PEND_SPEED;
          tr.angle = Math.sin(tr.timer * tr.speed) * tr.amp;
          tr.x = tr.pivotX + Math.sin(tr.angle) * tr.len - w / 2;
          tr.y = tr.pivotY + Math.cos(tr.angle) * tr.len - h / 2;
        }
        return tr;
      };
      this.traps = [];
      for (const t of src.traps || LEVEL_TRAPS[this.index] || []) {
        this.traps.push(makeTrap(t, t.x, t.dir));
        if (off) {
          this.traps.push(makeTrap(t, mapX(t.x, trapW(t)), -t.dir));
        }
      }
      // 普通 / 硬核模式额外布置滚锯与摆锤（休闲模式只有捕兽夹）
      // 联机模式固定“普通”陷阱配置，避免不同玩家的本地难度造成场景不同步
      const allowedKinds = Game.multiplayer
        ? TRAP_MODES.normal
        : (TRAP_MODES[Storage.data.difficulty] || TRAP_MODES.normal);
      if (!this.runtime && this.index >= 2) {
        const grounds = this.platforms.filter(
          (p) => p.kind === 'ground' && p.w >= 260 && p.x > 700
        );
        if (grounds.length) {
          if (allowedKinds.includes('saw')) {
            const gp = grounds[Math.floor(grounds.length * 0.4)];
            const cx = gp.x + gp.w / 2;
            this.traps.push(makeTrap({ kind: 'saw', x: cx }, cx));
          }
          if (allowedKinds.includes('pendulum') && this.index >= 3) {
            const gp = grounds[Math.floor(grounds.length * 0.7)];
            const cx = gp.x + gp.w / 2;
            this.traps.push(makeTrap({ kind: 'pendulum', x: cx }, cx));
          }
        }
      }
      // 后半段关卡（第 9~16 关）追加落锤 / 地刺，让旧关卡难度继续递进
      if (!this.runtime && this.index >= 8 && this.index < 16 && !this.bossCfg) {
        const late = this.platforms.filter(
          (p) => p.kind === 'ground' && p.w >= 260 && p.x > 900
        );
        if (late.length && allowedKinds.includes('crusher')) {
          const gp = late[Math.floor(late.length * 0.35)];
          const cx = gp.x + gp.w * 0.65;
          this.traps.push(makeTrap({ kind: 'crusher', x: Math.round(cx - 28) }, Math.round(cx - 28)));
        }
        if (late.length && this.index >= 11 && allowedKinds.includes('popspike')) {
          const gp = late[Math.floor(late.length * 0.8)];
          const cx = gp.x + gp.w * 0.45;
          this.traps.push(makeTrap({ kind: 'popspike', x: Math.round(cx - 23) }, Math.round(cx - 23)));
        }
      }
      // 按难度过滤陷阱种类（火球仅硬核；休闲仅捕兽夹）
      this.traps = this.traps.filter((t) => allowedKinds.includes(t.kind));
      // 休闲难度：第二篇章的机械陷阱会被过滤，补少量捕兽夹保持节奏
      if (!this.runtime && this.index >= 16 && !Game.multiplayer &&
          Storage.data.difficulty === 'casual') {
        const safeEnd = this.bossArena ? this.bossArena.x - 180 : this.data.width;
        const grounds = this.platforms.filter((p) =>
          p.kind === 'ground' && p.w >= 240 && p.x > 800 && p.x < safeEnd);
        const spots = [
          grounds[Math.floor(grounds.length * 0.3)],
          grounds[Math.floor(grounds.length * 0.65)]
        ];
        for (const g of spots) {
          if (!g) continue;
          const bx = Math.round(g.x + g.w * 0.55);
          if (this.traps.some((t) => Math.abs(t.x - bx) < 140)) continue;
          this.traps.push(makeTrap({ kind: 'bear', x: bx }, bx));
        }
      }
      // 出生点安全区：避免刚加载 / 刚复活就踩到陷阱
      this.traps = this.traps.filter(
        (t) => Math.abs(t.x + t.w / 2 - src.spawn.x) > TRAP.SAFE_RADIUS
      );
      // 兜底修正：地面型陷阱必须落在实体平台上，避免悬空在深坑里
      this.sanitizeTraps();
      this.projectiles = [];
      // 熔岩上涨状态（部分关卡）
      this.lava = this.biome.lava
        ? { y: this.biome.lava.start, cap: this.biome.lava.cap,
            speed: this.biome.lava.speed || LAVA.DEFAULT_SPEED }
        : null;
      // 机关门：门体作为动态平台参与碰撞，触碰开关后升起
      this.gates = [];
      const gateCfg = src.gates !== undefined ? src.gates : GATES_BY_LEVEL[this.index];
      const addGate = (cfg, x, swX) => {
        const sw = { x: swX, y: cfg.switch.y, w: cfg.switch.w, h: cfg.switch.h };
        const gate = {
          x, y: cfg.y, w: cfg.w, h: cfg.h, kind: 'ledge',
          gate: true, opened: false, openT: 0, baseY: cfg.y, switch: sw
        };
        this.gates.push(gate);
        this.platforms.push(gate);
      };
      if (gateCfg) {
        addGate(gateCfg, gateCfg.x, gateCfg.switch.x);
        if (off) {
          addGate(gateCfg, mapX(gateCfg.x, gateCfg.w), mapX(gateCfg.switch.x, gateCfg.switch.w));
        }
      }
      // 首次机制提示（本次关卡流程内显示一次）
      this.hints = (src.hints || LEVEL_HINTS[this.index] || []).map((h) => ({ ...h, seen: false }));

      // 静态平台预渲染到离屏画布（关卡切换时自动替换并释放旧图）
      StaticLayer.build();
    },

    resetEnemies() {
      // 难度倍率；无尽模式随房间数缓慢提速（上限 1.6 倍）
      const endlessMul = Game.endless
        ? Math.min(1.6, 1 + (Game.endlessRoom - 1) * 0.04) : 1;
      // 第二篇章（第 17 关起）敌人基础速度随关卡序号继续增长
      const levelMul = this.index >= 16
        ? 1 + (this.index - 15) * 0.025 : 1;
      // 联机模式使用统一倍率，客机与房主的初始敌人状态保持一致
      const mult = (Game.multiplayer ? 1 : Storage.enemySpeedMul()) *
        endlessMul * levelMul;
      const cycle = this.data.enemyTypes || ENEMY_TYPES_BY_LEVEL[this.index] ||
        ['walker', 'charger', 'hopper', 'flyer', 'spiky'];
      this.enemies = this.enemyCfgs.map((cfg, i) => {
        const plat = this.platforms[cfg.platform] || this.platforms[0];
        const type = cfg.type || cycle[i % cycle.length];
        // 飞行 / 幽灵种默认悬浮在平台上方，其它种站在平台顶面
        const baseY = plat.y - ENEMY_SIZE.h -
          (type === 'flyer' || type === 'ghost' ? 40 : 0);
        // 精英怪：多 1 点生命、移动略快，外观带金色光环
        const elite = !!cfg.elite;
        const mul = mult * (elite ? 1.12 : 1);
        return {
          x: cfg.x, y: baseY, baseY,
          w: ENEMY_SIZE.w, h: ENEMY_SIZE.h,
          dir: cfg.dir, speed: cfg.speed * mul,
          baseSpeed: cfg.speed * mul,
          anim: 0, platform: plat, type, elite,
          alive: true, deadTimer: 0,
          hp: (type === 'armored' ? 2 : 1) + (elite ? 1 : 0),
          hurtTimer: 0,
          fireCd: 40 + Math.floor(Math.random() * 60),
          hover: Math.random() * Math.PI * 2, // 飞行种浮动相位
          hopV: 0, hopY: 0,                    // 跳跃种垂直状态
          hopCd: 40 + Math.floor(Math.random() * 40),
          charging: false                      // 冲锋种是否正在冲刺
        };
      });
    },

    resetCoins() {
      this.coins = this.coinCfgs.map((c) => ({
        x: c.x, y: c.y, w: COIN_SIZE.w, h: COIN_SIZE.h,
        collected: false, phase: Math.random() * Math.PI * 2
      }));
    },

    // 静态尖刺必须落在实体平台上：悬空的移到最近的实体平台，找不到则移除
    sanitizeSpikes() {
      const solids = this.platforms.filter((p) =>
        !p.move && !p.fall && !p.oneWay && !p.gate);
      const keep = [];
      for (const s of this.spikes) {
        const sy = s.y + s.h;
        let on = false;
        for (const p of solids) {
          if (Math.abs(p.y - sy) > 8) continue;
          const ox = Math.min(s.x + s.w, p.x + p.w) - Math.max(s.x, p.x);
          if (ox >= s.w * 0.45) { on = true; break; }
        }
        if (on) { keep.push(s); continue; }
        // 找最近的可承载平台，水平挪到平台内侧（留 20px 安全边距）
        let best = null, bestD = Infinity;
        for (const p of solids) {
          if (Math.abs(p.y - sy) > 8 || p.w < s.w + 8) continue;
          const pad = Math.min(20, Math.max(4, (p.w - s.w) / 2));
          const tx = Math.max(p.x + pad,
            Math.min(p.x + p.w - s.w - pad, s.x));
          const d = Math.abs(tx - s.x);
          if (d < bestD) { bestD = d; best = tx; }
        }
        if (best !== null) {
          s.x = Math.round(best);
          keep.push(s);
        }
      }
      this.spikes = keep;
    },

    // 地面型陷阱必须落在实体平台上：悬空的移到最近平台，找不到则移除
    sanitizeTraps() {
      const solids = this.platforms.filter((p) =>
        !p.move && !p.fall && !p.oneWay && !p.gate);
      const groundKinds = ['bear', 'saw', 'fire', 'popspike'];
      const keep = [];
      for (const t of this.traps) {
        if (!groundKinds.includes(t.kind)) { keep.push(t); continue; }
        const top = t.y, bottom = t.y + t.h;
        let on = false;
        for (const p of solids) {
          const o = Math.min(t.x + t.w, p.x + p.w) - Math.max(t.x, p.x);
          if (o < Math.min(t.w, 40) * 0.4) continue;
          if (Math.abs(p.y - top) <= 12 || Math.abs(p.y - bottom) <= 12) {
            on = true; break;
          }
        }
        if (on) { keep.push(t); continue; }
        // 找最近的可承载平台，水平挪到平台内侧（留 20px 安全边距）
        let best = null, bestD = Infinity;
        const cur = t.kind === 'saw' ? (t.baseX || t.x) : t.x;
        for (const p of solids) {
          if (p.w < t.w + 8) continue;
          const pad = Math.min(20, Math.max(4, (p.w - t.w) / 2));
          const tx = Math.max(p.x + pad,
            Math.min(p.x + p.w - t.w - pad, cur));
          const d = Math.abs(tx - cur);
          if (d < bestD) { bestD = d; best = { p, tx }; }
        }
        if (best) {
          if (t.kind === 'saw') {
            t.baseX = Math.round(best.tx);
            t.range = Math.min(t.range,
              Math.max(20, (best.p.w - t.w) / 2 - 10));
            t.x = t.baseX;
          } else {
            t.x = Math.round(best.tx);
          }
          keep.push(t);
        }
      }
      this.traps = keep;
    },

    resetBoss() {
      if (!this.bossCfg || this.bossDefeated) { this.boss = null; return; }
      const b = this.bossCfg;
      const plat = this.platforms[b.platform];
      // 胆小鬼模式：Boss 血量与移速降低（联机模式统一关闭）
      const coward = Game.multiplayer ? false : Storage.coward();
      const hp = coward ? Math.max(1, Math.round(b.hp * COWARD.BOSS_HP)) : b.hp;
      const spd = b.speed * (coward ? COWARD.BOSS_SPEED : 1);
      this.boss = {
        x: b.x, y: plat.y - BOSS_SIZE.h,
        w: BOSS_SIZE.w, h: BOSS_SIZE.h,
        dir: b.dir, speed: spd,
        baseSpeed: spd,
        hp: hp, maxHp: hp,
        anim: 0, platform: plat,
        alive: true, hurtTimer: 0,
        phase: 1,                  // 1 = 常规，2 = 狂暴（半血触发）
        summonCd: 0,
        // Boss 攻击状态：0 巡逻 / 1 蓄力 / 2 冲撞 / 3 硬直
        style: b.style || 'brute',
        act: 0, actT: 0,
        nextAttack: b.style === 'guardian' ? BOSS_MECH.GUARD_FIRST
          : (b.style === 'core' ? BOSS_MECH.CORE_FIRST : BOSS_MECH.BRUTE_FIRST),
        nextKind: 1,
        chargeDir: 0,
        beamDelay: 0, beamX: 0
      };
    },

    // 更新移动平台位置，并记录位移（animTick 只在实际游戏帧递增）
    updatePlatforms() {
      for (const p of this.platforms) {
        if (!p.move) { p.dx = 0; p.dy = 0; continue; }
        const t = this.animTick * p.move.speed + p.move.phase;
        const s = Math.sin(t);
        // 端点缓动：|sin| 取幂 < 1 后，平台在端点附近停留更久，换向更平缓
        const eased = Math.sign(s) * Math.pow(Math.abs(s), MECH.MOVER_EASE_POWER);
        const off = eased * p.move.range;
        const nx = p.move.axis === 'x' ? p.baseX + off : p.baseX;
        const ny = p.move.axis === 'y' ? p.baseY + off : p.baseY;
        p.dx = nx - p.x;
        p.dy = ny - p.y;
        p.x = nx; p.y = ny;
      }
      this.animTick++;
    },

    // 距离指定位置最近的玩家（敌人冲锋 / 提示等使用）
    nearestPlayer(x, y) {
      let best = player, bd = Infinity;
      for (const p of players) {
        const d = Math.abs(p.x - x) + Math.abs(p.y - y) * 0.5;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },

    updateEnemies() {
      // 时间减速道具：敌人移动速度按倍率降低
      const sf = Game.slowFactor || 1;
      for (const e of this.enemies) {
        if (!e.alive) { e.deadTimer--; continue; }
        if (e.hurtTimer > 0) e.hurtTimer--;
        const minX = e.platform.x;
        const maxX = e.platform.x + e.platform.w - e.w;
        let moveSpeed = e.speed * sf;
        let freeMove = false;             // 幽灵无视平台边界

        if (e.type === 'flyer') {
          // 飞行种：水平慢速巡逻 + 上下悬浮
          e.x += e.dir * e.speed * 0.7 * sf;
          e.y = e.baseY + Math.sin(Game.tick * 0.04 + e.hover) * 22;
        } else if (e.type === 'charger') {
          // 冲锋种：最近玩家进入警戒范围时加速冲向该玩家
          const target = this.nearestPlayer(e.x, e.y);
          e.charging = Math.abs(target.x - e.x) < 300 &&
                       Math.abs(target.y - e.y) < 90 && target.x !== e.x;
          if (e.charging) {
            e.dir = target.x < e.x ? -1 : 1;
            moveSpeed = e.speed * 2.3 * sf;
          }
          e.x += e.dir * moveSpeed;
        } else if (e.type === 'hopper') {
          // 跳跃种：巡逻中周期性弹跳
          e.x += e.dir * e.speed * 0.7 * sf;
          e.hopCd--;
          if (e.hopCd <= 0 && e.hopY === 0) {
            e.hopV = -6.8;
            e.hopCd = 80 + Math.floor(Math.random() * 40);
          }
          if (e.hopV < 0 || e.hopY < 0) {
            e.hopV += 0.4;
            e.hopY += e.hopV;
            if (e.hopY >= 0) { e.hopY = 0; e.hopV = 0; }
          }
          e.y = e.baseY + e.hopY;
        } else if (e.type === 'shooter') {
          // 炮台怪：原地不动，周期性向最近玩家发射弹体
          const target = this.nearestPlayer(e.x, e.y);
          e.dir = target.x < e.x ? -1 : 1;
          e.fireCd -= sf;
          const dx = (target.x + target.w / 2) - (e.x + e.w / 2);
          const dy = (target.y + target.h / 2) - (e.y + e.h / 2);
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          if (e.fireCd <= 0 && Math.abs(dx) < 560 && Math.abs(dy) < 180) {
            const spd = 3.1;
            this.projectiles.push({
              x: e.x + e.w / 2 - 5, y: e.y + e.h / 2 - 5,
              w: 10, h: 10,
              vx: (dx / len) * spd, vy: (dy / len) * spd,
              kind: 'enemy'
            });
            e.fireCd = 100 + Math.floor(Math.random() * 50);
            Sound.spike();
          }
        } else if (e.type === 'ghost') {
          // 幽灵：直线穿过平台缓慢追向最近玩家，上下浮动
          const target = this.nearestPlayer(e.x, e.y);
          const dx = (target.x + target.w / 2) - (e.x + e.w / 2);
          const dy = (target.y + target.h / 2) - (e.y + e.h / 2);
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x += (dx / len) * e.speed * 0.55 * sf;
          e.y += (dy / len) * e.speed * 0.4 * sf +
                 Math.sin(Game.tick * 0.05 + e.hover) * 0.6;
          e.y = Math.max(140, Math.min(GROUND_Y - 40, e.y));
          e.x = Math.max(20, Math.min(this.data.width - 40, e.x));
          e.dir = dx < 0 ? -1 : 1;
          freeMove = true;
        } else if (e.type === 'armored') {
          // 铁甲怪：移动较慢，需要踩两次才会被消灭
          e.x += e.dir * e.speed * 0.8 * sf;
        } else {
          // 普通巡逻种：红角怪 / 尖刺怪
          e.x += e.dir * e.speed * sf;
        }

        if (!freeMove) {
          if (e.x <= minX) { e.x = minX; e.dir = 1; }
          else if (e.x >= maxX) { e.x = maxX; e.dir = -1; }
        }
        e.anim += moveSpeed;
      }
    },

    updateBoss() {
      if (!this.boss || !this.boss.alive) return;
      const b = this.boss;
      if (b.hurtTimer > 0) b.hurtTimer--;
      const sf = Game.slowFactor || 1;
      // 受伤后短暂加速；二阶段整体速度提升
      const phaseMul = b.phase === 2 ? MECH.BOSS_PHASE2_SPEED : 1;
      const spd = b.baseSpeed * phaseMul * (b.hurtTimer > 0 ? 1.8 : 1) * sf;
      b.speed = spd;
      b.anim += spd;

      // 胆小鬼模式：Boss 只巡逻不发动攻击（与陷阱停用保持一致）
      const coward = COWARD.TRAPS_OFF && Storage.coward() && !Game.multiplayer;
      if (this.bossIntroT > 0) this.bossIntroT -= sf;
      const engaged = this.bossFightStarted && !coward && this.bossIntroT <= 0;

      // 核心光柱延迟引爆
      if (b.beamDelay > 0 && engaged) {
        b.beamDelay -= sf;
        if (b.beamDelay <= 0) {
          b.beamDelay = 0;
          this.spawnCoreBeam(b);
        }
      }

      if (b.style === 'guardian') this.updateBossGuardian(b, spd, sf, engaged);
      else if (b.style === 'core') this.updateBossCore(b, spd, sf, engaged);
      else this.updateBossBrute(b, spd, sf, engaged);

      // 二阶段：周期性召唤小型巡逻怪
      if (b.phase === 2) {
        b.summonCd -= sf;
        if (b.summonCd <= 0) {
          this.summonMinion();
          b.summonCd = MECH.SUMMON_INTERVAL;
        }
      }
    },

    // 第一篇章 Boss：巡逻 + 冲撞 / 落石，半血后狂暴召唤
    updateBossBrute(b, spd, sf, engaged) {
      const minX = b.platform.x;
      const maxX = b.platform.x + b.platform.w - b.w;
      switch (b.act) {
        case 1:                         // 蓄力
          b.actT -= sf;
          if (b.actT <= 0) {
            if (b.nextKind === 2) {
              b.act = 2;
              b.actT = BOSS_MECH.BRUTE_CHARGE;
              b.dir = b.chargeDir;
              Sound.bossHit();
            } else {
              this.spawnBruteRocks(b);
              b.act = 3;
              b.actT = BOSS_MECH.BRUTE_RECOVER;
              Sound.land();
            }
          }
          break;
        case 2:                         // 冲撞
          b.actT -= sf;
          b.x += b.chargeDir * BOSS_MECH.BRUTE_CHARGE_SPEED * sf;
          if (b.x <= minX) {
            b.x = minX; b.act = 3;
            b.actT = BOSS_MECH.BRUTE_RECOVER;
          } else if (b.x >= maxX) {
            b.x = maxX; b.act = 3;
            b.actT = BOSS_MECH.BRUTE_RECOVER;
          } else if (b.actT <= 0) {
            b.act = 3;
            b.actT = BOSS_MECH.BRUTE_RECOVER;
          }
          break;
        case 3:                         // 硬直
          b.actT -= sf;
          if (b.actT <= 0) {
            b.act = 0;
            b.nextAttack = b.phase === 2
              ? BOSS_MECH.BRUTE_INTERVAL_P2 : BOSS_MECH.BRUTE_INTERVAL;
          }
          break;
        default: {                      // 巡逻
          b.x += b.dir * spd;
          if (b.x <= minX) { b.x = minX; b.dir = 1; }
          else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }
          if (!engaged) break;
          b.nextAttack -= sf;
          if (b.nextAttack <= 0) {
            const t = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
            let dir = t.x < b.x + b.w / 2 ? -1 : 1;
            if (dir < 0 && b.x <= minX + 40) dir = 1;
            else if (dir > 0 && b.x >= maxX - 40) dir = -1;
            b.dir = dir;
            b.chargeDir = dir;
            b.nextKind = b.nextKind === 1 ? 2 : 1;
            b.act = 1;
            b.actT = BOSS_MECH.BRUTE_WINDUP;
            Sound.laser();
          }
        }
      }
    },

    // 落石：在最近玩家位置上方生成 2~3 块下落的岩石
    spawnBruteRocks(b) {
      const t = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
      const targetX = t.x + t.w / 2;
      const n = b.phase === 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const offset = (i - (n - 1) / 2) * 110;
        const rx = Math.round(Math.max(
          b.platform.x + 20,
          Math.min(b.platform.x + b.platform.w - 40, targetX + offset - 9)));
        this.projectiles.push({
          x: rx, y: 80, w: 18, h: 18, vx: 0, vy: BOSS_MECH.BRUTE_ROCK_SPEED,
          kind: 'rock', life: BOSS_MECH.BRUTE_ROCK_LIFE
        });
      }
      this.addPopup(b.x + b.w / 2, b.y - 20, '落石!', '#ffb066');
    },

    // 暗星守卫：蓄力冲撞 + 震地波，攻击前有明显预警
    updateBossGuardian(b, spd, sf, engaged) {
      const minX = b.platform.x;
      const maxX = b.platform.x + b.platform.w - b.w;
      switch (b.act) {
        case 1:                         // 蓄力
          b.actT -= sf;
          if (b.actT <= 0) {
            if (b.nextKind === 2) {
              this.spawnGuardianWaves(b);
              b.act = 3;
              b.actT = BOSS_MECH.GUARD_RECOVER;
              Sound.land();
            } else {
              b.act = 2;
              b.actT = BOSS_MECH.GUARD_DASH;
              b.dir = b.chargeDir;
              Sound.bossHit();
            }
          }
          break;
        case 2:                         // 冲撞
          b.actT -= sf;
          b.x += b.chargeDir * BOSS_MECH.GUARD_DASH_SPEED * sf;
          if (b.x <= minX) {
            b.x = minX; b.act = 3;
            b.actT = BOSS_MECH.GUARD_RECOVER;
          } else if (b.x >= maxX) {
            b.x = maxX; b.act = 3;
            b.actT = BOSS_MECH.GUARD_RECOVER;
          } else if (b.actT <= 0) {
            b.act = 3;
            b.actT = BOSS_MECH.GUARD_RECOVER;
          }
          break;
        case 3:                         // 硬直
          b.actT -= sf;
          if (b.actT <= 0) {
            b.act = 0;
            b.nextAttack = b.phase === 2
              ? BOSS_MECH.GUARD_INTERVAL_P2 : BOSS_MECH.GUARD_INTERVAL;
          }
          break;
        default: {                      // 巡逻
          b.x += b.dir * spd;
          if (b.x <= minX) { b.x = minX; b.dir = 1; }
          else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }
          if (!engaged) break;
          b.nextAttack -= sf;
          if (b.nextAttack <= 0) {
            const t = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
            let dir = t.x < b.x + b.w / 2 ? -1 : 1;
            // 贴墙时换向，避免冲撞直接撞在墙上原地结束
            if (dir < 0 && b.x <= minX + 40) dir = 1;
            else if (dir > 0 && b.x >= maxX - 40) dir = -1;
            b.dir = dir;
            b.chargeDir = dir;
            b.nextKind = b.nextKind === 1 ? 2 : 1;
            b.act = 1;
            b.actT = BOSS_MECH.GUARD_WINDUP;
            Sound.laser();
          }
        }
      }
    },

    // 终焉星核：星核弹幕 + 核心光柱
    updateBossCore(b, spd, sf, engaged) {
      const minX = b.platform.x;
      const maxX = b.platform.x + b.platform.w - b.w;
      switch (b.act) {
        case 1:                         // 弹幕蓄力
          b.actT -= sf;
          if (b.actT <= 0) {
            this.spawnCoreOrbs(b);
            b.act = 3;
            b.actT = BOSS_MECH.CORE_VOLLEY_RECOVER;
          }
          break;
        case 4: {                       // 光柱蓄力
          b.actT -= sf;
          if (b.actT <= 0) {
            const t = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
            b.beamX = Math.round(Math.max(
              b.platform.x + 24,
              Math.min(b.platform.x + b.platform.w - 24, t.x + t.w / 2)));
            const warn = b.phase === 2 ? 32 : BOSS_MECH.CORE_BEAM_WINDUP;
            this.projectiles.push({
              x: b.beamX - BOSS_MECH.CORE_BEAM_W / 2, y: 120,
              w: BOSS_MECH.CORE_BEAM_W, h: GROUND_Y - 120,
              vx: 0, vy: 0, kind: 'beamwarn', life: warn
            });
            b.beamDelay = warn;
            b.act = 3;
            b.actT = BOSS_MECH.CORE_BEAM_RECOVER;
            Sound.laser();
          }
          break;
        }
        case 3:                         // 硬直
          b.actT -= sf;
          if (b.actT <= 0) {
            b.act = 0;
            b.nextAttack = b.phase === 2
              ? BOSS_MECH.CORE_INTERVAL_P2 : BOSS_MECH.CORE_INTERVAL;
          }
          break;
        default: {                      // 缓慢巡逻
          b.x += b.dir * spd * 0.7;
          if (b.x <= minX) { b.x = minX; b.dir = 1; }
          else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }
          if (!engaged) break;
          b.nextAttack -= sf;
          if (b.nextAttack <= 0) {
            b.nextKind = b.nextKind === 1 ? 2 : 1;
            b.act = b.nextKind === 1 ? 1 : 4;
            b.actT = b.nextKind === 1
              ? BOSS_MECH.CORE_VOLLEY_WINDUP : BOSS_MECH.CORE_BEAM_WINDUP;
          }
        }
      }
    },

    // 震地波：向左右两侧各发出一个贴地能量波
    spawnGuardianWaves(b) {
      const y = GROUND_Y - 26;
      for (const dir of [-1, 1]) {
        this.projectiles.push({
          x: dir < 0 ? b.x - 18 : b.x + b.w - 16,
          y, w: 34, h: 26,
          vx: dir * BOSS_MECH.GUARD_WAVE_SPEED * (b.phase === 2 ? 1.2 : 1),
          vy: 0, kind: 'wave', life: BOSS_MECH.GUARD_WAVE_LIFE
        });
      }
      Particles.dust(b.x + b.w / 2, GROUND_Y);
      this.addPopup(b.x + b.w / 2, b.y - 20, '震地!', '#ffb066');
    },

    // 星核弹幕：以最近玩家为方向发射扇形弹体
    spawnCoreOrbs(b) {
      const t = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const base = Math.atan2(t.y + t.h / 2 - cy, t.x + t.w / 2 - cx);
      const n = b.phase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * 0.2;
        this.projectiles.push({
          x: cx - 6, y: cy - 6, w: 12, h: 12,
          vx: Math.cos(ang) * BOSS_MECH.CORE_ORB_SPEED,
          vy: Math.sin(ang) * BOSS_MECH.CORE_ORB_SPEED,
          kind: 'orb', life: 260
        });
      }
      Sound.spike();
    },

    // 预警结束后落下的核心光柱
    spawnCoreBeam(b) {
      this.projectiles.push({
        x: b.beamX - BOSS_MECH.CORE_BEAM_W / 2, y: 120,
        w: BOSS_MECH.CORE_BEAM_W, h: GROUND_Y - 120,
        vx: 0, vy: 0, kind: 'beam', life: BOSS_MECH.CORE_BEAM_ON
      });
      Particles.dust(b.beamX, GROUND_Y);
      Sound.laser();
    },


    // 二阶段召唤：在 Boss 附近生成一只小型巡逻怪
    summonMinion() {
      const b = this.boss;
      if (!b || !b.alive) return;
      if (this.enemies.filter((e) => e.alive && e.sum).length >= MECH.SUMMON_CAP) return;
      const plat = b.platform;
      let x = b.x + (b.dir > 0 ? -40 : b.w + 14);
      x = Math.max(plat.x + 4, Math.min(plat.x + plat.w - ENEMY_SIZE.w, x));
      this.enemies.push({
        x, y: plat.y - ENEMY_SIZE.h,
        w: ENEMY_SIZE.w, h: ENEMY_SIZE.h,
        dir: -b.dir, speed: 1.35 * Storage.enemySpeedMul(),
        baseSpeed: 1.35 * Storage.enemySpeedMul(),
        anim: 0, platform: plat,
        alive: true, deadTimer: 0, sum: true
      });
      Particles.enemyChunks(x + ENEMY_SIZE.w / 2, plat.y - 10);
      this.addPopup(x + ENEMY_SIZE.w / 2, plat.y - 40, '增援!', '#ff9aa8');
      Sound.bossHit();
    },

    // 检查点重生位置：Boss 战从 Boss 房入口，否则回最近检查点（无检查点回起点）
    spawnPoint() {
      if (this.bossFightStarted && this.bossArena) return this.bossArena;
      if (this.activeCheckpoint >= 0) {
        const c = this.checkpoints[this.activeCheckpoint];
        return { x: c.x - PLAYER_SIZE.w / 2, y: c.y - PLAYER_SIZE.h };
      }
      return this.data.spawn;
    },

    // 进入 Boss 房时记录，死亡后统一从 Boss 房入口重生
    checkBossArena() {
      if (this.bossFightStarted || !this.bossArena) return;
      if (players.some((p) => p.x >= this.bossArena.x)) {
        this.bossFightStarted = true;
        this.bossIntroT = 100;      // 入场演出期间 Boss 保持克制
        Game.shake = Math.max(Game.shake, 5);
      }
    },

    // 检查点快照：记录金币数与金币状态、敌人位置 / 朝向 / 存活
    captureSnapshot(coins) {
      const snap = { coins: 0, coinStates: [], enemies: [] };
      if (CHECKPOINT.SNAPSHOT_COINS) {
        snap.coins = coins;
        snap.coinStates = this.coins.map((c) => c.collected);
      }
      if (CHECKPOINT.SNAPSHOT_ENEMIES) {
        const cpX = this.activeCheckpoint >= 0
          ? this.checkpoints[this.activeCheckpoint].x : 0;
        snap.enemies = this.enemies.map((e) => ({
          x: e.x, y: e.y, dir: e.dir, anim: e.anim,
          alive: e.alive, before: e.x < cpX
        }));
      }
      this.snapshot = snap;
    },

    // 死亡重生回滚：金币与金币状态、敌人状态（检查点之前的敌人复活）
    restoreSnapshot() {
      // 先移除 Boss 二阶段召唤物，保证敌人索引与快照一致
      this.enemies = this.enemies.filter((e) => !e.sum);
      const snap = this.snapshot;
      if (!snap) {
        this.resetEnemies();
        this.resetCoins();
        return;
      }
      if (CHECKPOINT.SNAPSHOT_COINS) {
        for (let i = 0; i < this.coins.length; i++) {
          this.coins[i].collected = !!(snap.coinStates && snap.coinStates[i]);
        }
      }
      if (CHECKPOINT.SNAPSHOT_ENEMIES) {
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          const s = snap.enemies[i];
          if (!s) continue;
          e.x = s.x; e.y = s.y; e.dir = s.dir; e.anim = s.anim;
          // 检查点之前的敌人重置为存活；之后的保持死亡时的存活 / 消灭状态
          if (s.before) { e.alive = true; e.deadTimer = 0; }
        }
      }
    },

    // 重置下坠平台 / 弹跳板状态（死亡重生或重开本关时调用）
    resetFallPlats() {
      for (const f of this.fallPlats) {
        f.state = 'idle';
        f.timer = 0;
        f.alpha = 1;
        f.respawn = 0;
      }
      for (const p of this.pads) {
        p.squash = 0;
        p.cool = 0;
      }
    },

    // 下坠平台：被踩 1 秒后消失，离开立即重置计时，消失后延时复原
    updateFallPlats() {
      for (const f of this.fallPlats) {
        if (f.state === 'gone') {
          const elapsed = MECH.FALL_RESPAWN - f.respawn;
          f.alpha = elapsed < MECH.FALL_FADE
            ? Math.max(0, 1 - elapsed / MECH.FALL_FADE)
            : 0;
          f.respawn--;
          if (f.respawn <= 0) {
            f.state = 'idle';
            f.timer = 0;
            f.alpha = 1;
          }
          continue;
        }
        // 任一玩家踩在平台上时开始计时
        if (players.some((p) => p.groundObj === f)) {
          f.timer++;
          if (f.timer >= MECH.FALL_DELAY) {
            f.state = 'gone';
            f.respawn = MECH.FALL_RESPAWN;
            f.alpha = 1;
            Particles.dust(f.x + f.w / 2, f.y + 4);
            Sound.land();
          }
        } else {
          f.timer = Math.max(0, f.timer - 2);   // 离开后快速重置
        }
      }
    },

    // 陷阱更新：火球发射、激光周期、捕兽夹状态、滚锯巡逻、摆锤摆动与弹体移动
    updateTraps() {
      // 胆小鬼模式：所有陷阱停用（不发射、不夹合、激光常闭）
      if (COWARD.TRAPS_OFF && Storage.coward() && !Game.multiplayer) {
        this.projectiles = [];
        for (const t of this.traps) {
          t.active = false; t.warn = false;
          t.fireTimer = 0; t.snap = 0; t.cool = 0;
        }
        return;
      }
      const sf = Game.slowFactor || 1;   // 时间减速道具：陷阱节奏同步变慢
      for (const t of this.traps) {
        // 接近启用：任一玩家进入范围后陷阱才开始工作
        const near = players.some((p) =>
          p.x > t.x - TRAP.ARM_RANGE && p.x < t.x + t.w + TRAP.ARM_RANGE);
        if (!t.armed) {
          if (!near) { t.active = false; t.warn = false; continue; }
          t.armed = true;
          if (t.kind === 'laser') t.timer = TRAP.LASER_PERIOD - TRAP.LASER_WARN;
          if (t.kind === 'fire') t.fireTimer = TRAP.FIRE_INTERVAL - 50;
        }
        if (t.kind === 'fire') {
          t.fireTimer += sf;
          if (t.fireTimer >= TRAP.FIRE_INTERVAL) {
            t.fireTimer = 0;
            const fs = TRAP.FIRE_SIZE;
            this.projectiles.push({
              x: t.dir > 0 ? t.x + t.w : t.x - fs,
              y: t.y + 6, w: fs, h: fs,
              vx: t.dir * TRAP.FIRE_SPEED * sf
            });
          }
        } else if (t.kind === 'laser') {
          const wasActive = t.active;
          t.timer = (t.timer + sf) % TRAP.LASER_PERIOD;
          t.active = t.timer < TRAP.LASER_ON;
          t.warn = !t.active && t.timer >= TRAP.LASER_PERIOD - TRAP.LASER_WARN;
          if (t.active && !wasActive) Sound.laser();
        } else if (t.kind === 'bear') {
          if (t.snap > 0) t.snap = Math.max(0, t.snap - sf);
          if (t.cool > 0) t.cool = Math.max(0, t.cool - sf);
        } else if (t.kind === 'saw') {
          // 滚锯：沿地面来回巡逻
          t.timer += sf;
          t.x = t.baseX + Math.sin(t.timer * t.speed) * t.range;
        } else if (t.kind === 'pendulum') {
          // 摆锤：按正弦角度摆动，球体位置实时计算
          t.timer += sf;
          t.angle = Math.sin(t.timer * t.speed) * t.amp;
          t.x = t.pivotX + Math.sin(t.angle) * t.len - t.w / 2;
          t.y = t.pivotY + Math.cos(t.angle) * t.len - t.h / 2;
        } else if (t.kind === 'crusher') {
          // 落锤：悬停 → 警示 → 砸下 → 停留 → 收回
          const wasActive = t.active;
          t.timer = (t.timer + sf) % TRAP.CRUSHER_PERIOD;
          const ph = t.timer;
          const drop = GROUND_Y - TRAP.CRUSHER_H - t.baseY;
          if (ph < 60) {
            t.y = t.baseY;
            t.active = false;
            t.warn = ph >= 60 - TRAP.CRUSHER_WARN;
          } else if (ph < 82) {
            t.y = t.baseY + drop * ((ph - 60) / 22);
            t.active = true;
            t.warn = false;
          } else if (ph < 118) {
            t.y = t.baseY + drop;
            t.active = true;
            t.warn = false;
          } else {
            t.y = t.baseY + drop * (1 - (ph - 118) / (TRAP.CRUSHER_PERIOD - 118));
            t.active = false;
            t.warn = false;
          }
          if (t.active && !wasActive) Sound.land();
        } else if (t.kind === 'popspike') {
          // 地刺：隐藏 → 警示 → 弹出 → 停留 → 缩回
          const wasActive = t.active;
          t.timer = (t.timer + sf) % TRAP.SPIKE_PERIOD;
          const ph = t.timer;
          if (ph < 60) {
            t.y = t.baseY;
            t.active = false;
            t.warn = ph >= 60 - TRAP.SPIKE_WARN;
          } else if (ph < 78) {
            t.y = t.baseY - TRAP.SPIKE_H * ((ph - 60) / 18);
            t.active = true;
            t.warn = false;
          } else if (ph < 118) {
            t.y = t.baseY - TRAP.SPIKE_H;
            t.active = true;
            t.warn = false;
          } else {
            t.y = t.baseY - TRAP.SPIKE_H * (1 - (ph - 118) / (TRAP.SPIKE_PERIOD - 118));
            t.active = false;
            t.warn = false;
          }
          if (t.active && !wasActive) Sound.spike();
        }
      }
      for (const p of this.projectiles) {
        p.x += p.vx;
        p.y += (p.vy || 0);
        if (p.kind === 'rock' && p.y > GROUND_Y + 8) p.life = 0;
        if (p.life !== undefined) p.life--;
      }
      this.projectiles = this.projectiles.filter(
        (p) => p.x > -60 && p.x < this.data.width + 60 &&
               p.y > -60 && p.y < 760 &&
               (p.life === undefined || p.life > 0)
      );
    },

    // 重生时清理弹体与陷阱状态
    resetTraps() {
      this.projectiles = [];
      for (const t of this.traps) {
        t.fireTimer = 0;
        t.timer = 0;
        t.active = false;
        t.warn = false;
        t.snap = 0;
        t.cool = 0;
        t.armed = false;
        if (t.kind === 'saw') t.x = t.baseX;
        if (t.kind === 'pendulum') {
          t.angle = 0;
          t.x = t.pivotX - t.w / 2;
          t.y = t.pivotY + t.len - t.h / 2;
        }
        if (t.kind === 'crusher' || t.kind === 'popspike') {
          t.timer = 0;
          t.y = t.baseY;
          t.active = false;
          t.warn = false;
        }
      }
    },

    // 熔岩上涨：从起点缓慢上升到上限
    updateLava() {
      if (!this.lava) return;
      const spd = this.lava.speed *
        (Storage.coward() && !Game.multiplayer ? COWARD.LAVA_SPEED : 1);
      if (this.lava.y > this.lava.cap) {
        this.lava.y = Math.max(this.lava.cap, this.lava.y - spd);
      }
    },
    resetLava() {
      if (this.lava) this.lava.y = this.biome.lava.start;
    },

    // 周期强风计时：返回当前阶段与参数（0 平静 / 1 预警 / 2 强风）
    gustCycle() {
      const g = this.biome && this.biome.gust;
      if (!g) return null;
      const period = Math.max(80, g.period || 300);
      const on = Math.min(period, g.on || 120);
      const warn = Math.min(60, period - on);
      return {
        g, period, on, warn,
        ph: Game.tick % period,
        strength: g.strength || 0.3
      };
    },
    gustPhase() {
      const c = this.gustCycle();
      if (!c) return 0;
      if (c.ph < c.period - c.on - c.warn) return 0;
      if (c.ph < c.period - c.on) return 1;
      return 2;
    },
    gustPower() {
      const c = this.gustCycle();
      if (!c) return 0;
      const t = c.ph - (c.period - c.on);
      if (t < 0) return 0;
      if (t < 26) return c.strength * (t / 26);
      if (t > c.on - 26) return c.strength * Math.max(0, (c.on - t) / 26);
      return c.strength;
    },

    // 机关门：触碰开关后门体升起并取消碰撞
    updateGates() {
      for (const g of this.gates) {
        if (!g.opened && players.some((p) => aabb(p, g.switch))) {
          g.opened = true;
          Sound.gate();
          Particles.dust(g.switch.x + g.switch.w / 2, g.switch.y);
          this.addPopup(g.x + g.w / 2, g.baseY - 16, '机关门开启', '#7ff0a8');
        }
        if (g.opened && g.openT < 1) {
          g.openT = Math.min(1, g.openT + 0.06);
          g.y = g.baseY - g.openT * (g.h + 8);
        }
      }
    },

    // 弹跳板：踩上后自动高弹，带压缩动画
    updatePads() {
      for (const pad of this.pads) {
        if (pad.squash > 0) pad.squash--;
        if (pad.cool > 0) pad.cool--;
        for (const p of players) {
          const feet = p.y + p.h;
          const over = p.x + p.w > pad.x && p.x < pad.x + pad.w;
          if (over && p.vy >= 0 && pad.cool <= 0 &&
              feet >= pad.y - 8 && feet <= pad.y + 16) {
            p.vy = MECH.BOUNCE_VELOCITY;
            p.onGround = false;
            p.jumpsLeft = p.maxJumps();
            // 起跳瞬间短暂无敌，避免弹起途中被敌人 / 陷阱贴脸判定
            p.invuln = Math.max(p.invuln, FEEL.PAD_GRACE);
            pad.squash = MECH.PAD_SQUASH_FRAMES;
            pad.cool = MECH.PAD_COOLDOWN;
            Sound.bounce();
            Particles.dust(pad.x + pad.w / 2, pad.y - 4);
            Particles.bounceDraft(pad.x + pad.w / 2, pad.y - 18);
            break;
          }
        }
      }
    },

    // 检查点：触达后激活并记录，返回本次新激活的下标（无则 -1）
    updateCheckpoints() {
      const t = { x: 0, y: 0, w: CHECKPOINT.TRIGGER_W, h: CHECKPOINT.TRIGGER_H };
      // 硬核难度：检查点数量减半（只保留偶数序号）
      const step = Storage.diff().checkpointStep;
      for (let i = 0; i < this.checkpoints.length; i++) {
        if (step > 1 && i % step !== 0) continue;
        const c = this.checkpoints[i];
        if (c.activated) continue;
        t.x = c.x - CHECKPOINT.TRIGGER_W / 2;
        t.y = c.y - CHECKPOINT.TRIGGER_H;
        if (players.some((p) => aabb(p, t))) {
          c.activated = true;
          this.activeCheckpoint = i;
          return i;
        }
      }
      return -1;
    },

    // 二段跳光环 / 效果更新
    addRing(x, y) {
      this.rings.push({ x, y, r: 6, life: 20, maxLife: 20 });
    },
    updateRings() {
      for (const r of this.rings) {
        r.r += 2.4;
        r.life--;
      }
      this.rings = this.rings.filter((r) => r.life > 0);
    },

    // 首次机制提示：玩家经过后标记已读
    updateHints() {
      for (const h of this.hints) {
        if (!h.seen && players.some((p) => p.x > h.x + 90)) h.seen = true;
      }
    },

    // Boss 被击败：在其原位置生成终点旗帜，并清除残留攻击
    spawnFlagAfterBoss() {
      this.bossDefeated = true;
      this.projectiles = this.projectiles.filter((p) =>
        p.kind !== 'wave' && p.kind !== 'orb' &&
        p.kind !== 'beam' && p.kind !== 'beamwarn');
      const b = this.boss;
      this.flag = { x: b.x + b.w / 2 - 2, y: 374, w: 5, h: 96 };
      this.flagTrigger = { x: b.x + b.w / 2 - 30, y: 356, w: 70, h: 114 };
    },

    addPopup(x, y, text, color) {
      this.popups.push({ x, y, vy: -1.2, life: 50, text, color: color || '#ffe28a' });
    },

    updatePopups() {
      for (const p of this.popups) {
        p.y += p.vy;
        p.life--;
      }
      this.popups = this.popups.filter((p) => p.life > 0);
    }
  };

  // ============================================================
  // 5.5 无尽模式：按房间号程序化生成关卡数据
  //     - 复用现有 ground / ledge / oneWay / mover / coin 工厂
  //     - 难度随房间数递增：敌人种类、敌人速度、陷阱密度
  // ============================================================
  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const Endless = {
    // runSeed 让每一次无尽开局的房间布局不同；同一局内按房间号可复现
    // 复用第二篇章的手工章节库（ACT_SECTIONS），随机拼接成短房间
    build(room, runSeed) {
      const rnd = seededRandom(0x9e3779b9 ^ (room * 7919) ^
        (((runSeed || 0) * 2654435761) >>> 0));
      const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
      const target = Math.min(ENDLESS.MAX_WIDTH,
        ENDLESS.BASE_WIDTH + (room - 1) * ENDLESS.WIDTH_STEP);

      // 章节状态：与第二篇章关卡生成器共用
      const S = {
        plats: [], coins: [], spikes: [], traps: [],
        fallPlats: [], pads: [], grounds: [], highs: [],
        x: 0, gem: null, arena: null, boss: null, flagX: null, bossDef: null
      };
      ACT_SECTIONS.start(S);

      // 每 5 间一个首领房：暗星守卫与终焉星核交替镇守，血量/速度随房间增长
      const bossRoom = room % 5 === 0;
      if (bossRoom) {
        S.bossDef = {
          hp: Math.min(24, 8 + Math.floor(room / 5) * 2),
          speed: Math.min(2.4, 1.5 + room * 0.03),
          style: (Math.floor(room / 5) % 2 === 1) ? 'guardian' : 'core'
        };
      }

      // 随房间解锁章节与陷阱预算
      const basePool = ['flat', 'pit', 'stairs', 'fall', 'bridge', 'pad', 'tower'];
      const trapPool = [];
      if (room >= 2) basePool.push('mover', 'spike');
      if (room >= 3) trapPool.push('saw');
      if (room >= 4) trapPool.push('crusher');
      if (room >= 5) trapPool.push('laser', 'pendulum');
      if (room >= 6) trapPool.push('popspike');
      let trapBudget = Math.min(ENDLESS.TRAP_CAP, 1 + Math.floor(room / 2));
      let last = '';

      const reserve = bossRoom ? 1080 : 460;
      while (S.x < target - reserve) {
        const pool = trapBudget > 0 ? basePool.concat(trapPool) : basePool;
        let type = pool[Math.floor(rnd() * pool.length)];
        if (type === last && pool.length > 1) {
          type = pool[(pool.indexOf(type) + 1) % pool.length];
        }
        last = type;
        const gap = ri(120, 180);
        if (type === 'flat') {
          ACT_SECTIONS.flat(S, gap, ri(260, 360),
            room >= 2 && rnd() < 0.45 ? 1 : 0);
          // 保留少量捕兽夹，让休闲难度也有可用的地面陷阱
          if (room >= 3 && trapBudget > 0 && rnd() < 0.35) {
            S.traps.push({ kind: 'bear', x: Math.round(S.x - 160) });
            trapBudget--;
          }
        } else if (type === 'pit') {
          ACT_SECTIONS.pit(S, ri(150, 200), ri(260, 340));
        } else if (type === 'stairs') {
          ACT_SECTIONS.stairs(S, ri(130, 180), ri(2, 3), ri(260, 320));
        } else if (type === 'mover') {
          // 纵移平台在第 4 间起出现，并限制振幅，避免随机组合出过高的落差
          const axis = room < 4 ? 'x' : (rnd() < 0.55 ? 'x' : 'y');
          const range = axis === 'y' ? ri(48, 62) : ri(55, 90);
          ACT_SECTIONS.mover(S, ri(200, 240), axis, range, ri(260, 340));
        } else if (type === 'fall') {
          ACT_SECTIONS.fall(S, ri(230, 290), ri(260, 320));
        } else if (type === 'bridge') {
          ACT_SECTIONS.bridge(S, ri(130, 180), ri(2, 4), ri(260, 340));
        } else if (type === 'pad') {
          ACT_SECTIONS.pad(S, ri(120, 180), ri(280, 380));
        } else if (type === 'tower') {
          ACT_SECTIONS.tower(S, ri(130, 180), ri(260, 340), ri(2, 4));
        } else if (type === 'spike') {
          ACT_SECTIONS.spike(S, ri(130, 180), ri(300, 380),
            ri(1, room >= 6 ? 3 : 2));
        } else if (type === 'saw') {
          ACT_SECTIONS.saw(S, ri(130, 180), ri(300, 360));
          trapBudget--;
        } else if (type === 'crusher') {
          const n = 1 + (room >= 8 && trapBudget > 1 ? 1 : 0);
          ACT_SECTIONS.crusher(S, ri(130, 180), ri(300, 360), n);
          trapBudget -= n;
        } else if (type === 'popspike') {
          ACT_SECTIONS.popspike(S, ri(130, 180), ri(300, 360), 1);
          trapBudget--;
        } else if (type === 'laser') {
          ACT_SECTIONS.laser(S, ri(130, 180), ri(300, 360));
          trapBudget--;
        } else if (type === 'pendulum') {
          ACT_SECTIONS.pendulum(S, ri(130, 180), ri(300, 360));
          trapBudget--;
        }
      }
      // 终点段：首领房以 Boss 房收尾，普通房按目标宽度补齐终点地面
      if (bossRoom) {
        ACT_SECTIONS.arena(S, ri(140, 190));
      } else {
        const fgap = ri(120, 170);
        const fx = S.x + fgap;
        const flen = Math.max(380, target - fx);
        a2Ground(S, fx, flen);
        a2Coins(S, fx + 40, GROUND_Y - 50,
          Math.min(5, Math.max(3, Math.round(flen / 90))), 40);
        S.x = fx + flen;
        S.flagX = S.x - 40;
      }
      const width = Math.max(2000, S.x);

      // 敌人种类随房间逐步解锁
      const types = ['walker'];
      if (room >= 2) types.push('hopper');
      if (room >= 3) types.push('charger');
      if (room >= 4) types.push('flyer');
      if (room >= 5) types.push('spiky');
      if (room >= 8) types.push('armored');
      if (room >= 10) types.push('shooter');
      if (room >= 12) types.push('ghost');

      const enemies = [];
      const cap = Math.min(ENDLESS.ENEMY_CAP, 3 + Math.floor(room * 0.7));
      const stopX = S.arena ? S.arena.x - 140 : width - 320;
      let total = 0;
      for (const g of S.grounds) {
        if (total >= cap) break;
        if (g.x < 500 || g.x > stopX) continue;
        const per = 1 + (room >= 4 ? 1 : 0) + (room >= 9 ? 1 : 0);
        for (let k = 0; k < per && total < cap; k++) {
          const span = Math.max(40, g.w - 130);
          enemies.push({
            platform: g.index,
            x: g.x + 60 + ((total * 53 + k * 131) % span),
            dir: total % 2 === 0 ? 1 : -1,
            speed: 0.85 + rnd() * 0.35,
            type: types[total % types.length],
            elite: room >= 6 && total % 4 === 1
          });
          total++;
        }
      }

      // 检查点：房间中段附近的实地（首领房排除 Boss 房入口之后的地面）
      const cpEnd = S.arena ? S.arena.x - 80 : width;
      const cpCands = S.grounds.filter((g) => g.x + g.w < cpEnd);
      const mid = Math.round(width / 2);
      let cpGround = cpCands.find((g) =>
        g.x < mid && g.x + g.w > mid + 30);
      if (!cpGround) cpGround = cpCands[Math.floor(cpCands.length * 0.5)] || cpCands[0] || S.grounds[0];
      const cpX = Math.round(cpGround.x +
        Math.min(cpGround.w - 40, Math.max(30, cpGround.w * 0.5)));
      const checkpoints = [{ x: cpX, y: GROUND_Y }];

      // 每 3 间一个爱心，每 4 间一个变大果实（位置夹在检查点地面内）
      const hearts = [];
      const fruits = [];
      if (room % 3 === 0) {
        hearts.push({
          x: Math.min(cpGround.x + cpGround.w - 30, cpX + 60),
          y: GROUND_Y - 40
        });
      }
      if (room % 4 === 0) {
        fruits.push({
          x: Math.min(cpGround.x + cpGround.w - 40, cpX + 150),
          y: GROUND_Y - 90
        });
      }

      return {
        name: bossRoom
          ? '无尽 · 第 ' + room + ' 间 · 首领'
          : '无尽 · 第 ' + room + ' 房间',
        tip: bossRoom
          ? '击败首领后才会出现终点旗帜'
          : '难度随房间递增，抵达终点旗进入下一间',
        width,
        spawn: { x: 60, y: GROUND_Y - PH },
        enemyTypes: types,
        platforms: S.plats,
        coins: S.coins,
        spikes: S.spikes,
        enemies,
        traps: S.traps.slice(0, ENDLESS.TRAP_CAP),
        hearts,
        fruits,
        pads: S.pads,
        checkpoints,
        fallPlats: S.fallPlats,
        hints: [],
        flag: bossRoom ? null : { x: S.flagX, y: 374, w: 5, h: 96 },
        flagTrigger: bossRoom ? null : { x: S.flagX - 24, y: 356, w: 70, h: 114 },
        boss: S.boss,
        bossArena: S.arena,
        biome: {}
      };
    }
  };

  // ============================================================

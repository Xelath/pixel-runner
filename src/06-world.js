  // 6. 物理 / 碰撞模块：轴分离解算（保持原实现）
  // ============================================================
  const Physics = {
    resolveHorizontal(actor, solids) {
      for (const s of solids) {
        if (s.oneWay) continue;          // 单向平台不阻挡水平移动
        if (s.gate && s.opened) continue; // 机关门开启后不再阻挡
        if (!aabb(actor, s)) continue;
        if (actor.vx > 0) actor.x = s.x - actor.w;
        else if (actor.vx < 0) actor.x = s.x + s.w;
        if (actor.vx !== 0) actor.vx = 0;
      }
    },

    resolveVertical(actor, solids) {
      const prevGround = actor.groundObj;   // 上一帧站立对象（吸附判定用）
      actor.onGround = false;
      actor.groundObj = null;            // 记录当前站立对象（下坠平台 / 单向平台判定用）
      for (const s of solids) {
        if (s.gate && s.opened) continue; // 机关门开启后不再参与碰撞
        // 单向平台：只在下落且脚底原本在平台面之上时接住
        if (s.oneWay) {
          if (actor.vy <= 0) continue;
          if (actor.dropTimer && actor.dropTimer > 0) continue;
          if (!aabb(actor, s)) continue;
          const prevBottom = (actor.prevY === undefined ? actor.y - actor.vy : actor.prevY) + actor.h;
          if (prevBottom > s.y + 6) continue;
          actor.y = s.y - actor.h;
          actor.vy = 0;
          actor.onGround = true;
          actor.groundObj = s;
          continue;
        }
        // 下坠平台消失后不再参与碰撞
        if (s.fall && s.state === 'gone') continue;
        if (!aabb(actor, s)) {
          // 吸附容差：脚底仍在该平台水平范围内（含 2px 边缘宽容）时贴回顶部，
          // 超出宽容范围则正常掉落，避免“走在空中”
          const nearX = actor.x + actor.w + FEEL.EDGE_GRACE > s.x &&
                        actor.x - FEEL.EDGE_GRACE < s.x + s.w;
          if (prevGround === s && nearX && actor.vy >= 0) {
            const gap = actor.y + actor.h - s.y;
            if (gap >= 0 && gap <= MECH.PLATFORM_SNAP) {
              actor.y = s.y - actor.h;
              actor.vy = 0;
              actor.onGround = true;
              actor.groundObj = s;
            }
          }
          continue;
        }
        if (actor.vy > 0) {
          actor.y = s.y - actor.h;
          actor.vy = 0;
          actor.onGround = true;
          actor.groundObj = s;
        } else if (actor.vy < 0) {
          actor.y = s.y + s.h;
          actor.vy = 0.4;
          // 撞到平台底部后短暂无敌，避免同帧被下方敌人 / 陷阱 / 尖刺连带扣血
          if (actor.invuln !== undefined) {
            actor.invuln = Math.max(actor.invuln, FEEL.CEILING_GRACE);
          }
        }
      }
    }
  };

  // ============================================================
  // 7. 玩家模块：移动、跳跃、二段跳、冲刺、生命
  // ============================================================
  const player = {
    id: 0,            // 队伍中的玩家编号
    hearts: PHYS.START_LIVES, // 个人生命（多人模式每人独立）
    shield: 0,        // 个人护盾层数
    input: null,      // 远程 / 额外玩家的输入；null = 使用本地键盘 Input
    visualId: 0,      // 用于配色区分
    x: 0, y: 0,
    prevY: 0,         // 上一帧的 y（用于踩头判定，避免 vy 被碰撞清零后误判）
    w: PLAYER_SIZE.w, h: PLAYER_SIZE.h,
    vx: 0, vy: 0,
    onGround: false,
    groundObj: null,       // 当前站立的平台（下坠 / 单向平台交互用）
    dropTimer: 0,          // 单向平台下穿剩余帧数
    big: false,            // 是否处于变大状态（受伤一次后变小）
    facing: 1,
    jumpsLeft: PHYS.MAX_JUMPS,
    coyote: 0, jumpBuffer: 0,
    invuln: 0,
    dashTime: 0,      // 冲刺剩余帧数
    dashDir: 1,
    dashCd: 0,        // 冲刺冷却
    dashInertia: 0,   // 冲刺结束后的惯性剩余帧数
    landStun: 0,      // 落地硬直剩余帧数
    runDustCd: 0,     // 跑步扬尘计时
    flash: 0,         // 受击闪白剩余帧数

    // 能力加成：最大跳跃次数 / 冲刺冷却 / 超级跳倍率
    // 联机客人本地预测时使用房主下发的权威数值（netMaxJumps 等）
    maxJumps() {
      if (Game.multiplayer && this.netMaxJumps !== undefined) return this.netMaxJumps;
      return PHYS.MAX_JUMPS + (Storage.data.upgrades.jump ? 1 : 0);
    },
    dashCdFrames() {
      if (Game.multiplayer && this.netDashCd !== undefined) return this.netDashCd;
      return Math.round(DASH.COOLDOWN *
        (1 - (Storage.data.upgrades.dash || 0) * 0.15));
    },
    jumpBoost() {
      return Game.levelItem === 'super' ? 1.2 : 1;
    },

    reset(spawn) {
      const s = spawn || Level.data.spawn;
      this.x = s.x; this.y = s.y;
      this.prevY = s.y;
      this.vx = 0; this.vy = 0;
      this.onGround = true;
      this.groundObj = null;
      this.dropTimer = 0;
      this.big = false;
      this.w = PLAYER_SIZE.w;
      this.h = PLAYER_SIZE.h;
      this.facing = 1;
      this.jumpsLeft = this.maxJumps();
      this.coyote = PHYS.COYOTE_FRAMES;
      this.jumpBuffer = 0;
      this.invuln = 0;
      this.dashTime = 0;
      this.dashCd = 0;
      this.dashInertia = 0;
      this.landStun = 0;
      this.runDustCd = 0;
      this.flash = 0;
    },

    startDash() {
      if (this.dashTime > 0 || this.dashCd > 0) return;
      this.dashTime = DASH.DURATION;
      this.dashDir = this.facing;
      this.dashCd = this.dashCdFrames();
      this.invuln = Math.max(this.invuln, DASH.INVULN);
      this.vy = Math.min(this.vy, 0); // 冲刺瞬间不让重力立刻把人拽下
      this.landStun = 0;             // 冲刺可取消落地硬直 / 跳跃后摇
      Sound.dash();
    },

    // 吃下变大果实：碰撞盒变大，脚底位置保持不变
    grow() {
      if (this.big) return;
      this.big = true;
      this.x -= (BIG_SIZE.w - this.w) / 2;
      this.y -= (BIG_SIZE.h - this.h);
      this.w = BIG_SIZE.w;
      this.h = BIG_SIZE.h;
    },

    // 受伤变小：恢复常规碰撞盒，返回是否发生变小
    shrink() {
      if (!this.big) return false;
      this.x += (this.w - PLAYER_SIZE.w) / 2;
      this.y += (this.h - PLAYER_SIZE.h);
      this.w = PLAYER_SIZE.w;
      this.h = PLAYER_SIZE.h;
      this.big = false;
      return true;
    },

    update() {
      // 每名玩家可绑定独立输入（远程玩家由网络输入驱动）
      const inp = this.input || Input;
      // 记录本帧移动前的 y，供踩头判定使用
      this.prevY = this.y;
      const wasOnGround = this.onGround; // 用于判定「空中落地」

      // ---- 随动：站在移动平台顶部时继承平台本帧位移（水平 + 垂直）----
      // 平台位置已在 Game.update 中先行更新，这里直接叠加差值，避免相对滑动
      if (this.onGround && this.groundObj && this.groundObj.move) {
        this.x += this.groundObj.dx;
        this.y += this.groundObj.dy;
        this.prevY += this.groundObj.dy;
      }

      // ---- 冲刺冷却 ----
      if (this.dashCd > 0) this.dashCd--;

      // ---- 冲刺输入 ----
      if (inp.consumeDash()) this.startDash();

      // ---- 冲刺中的水平速度（带末尾减速）----
      if (this.dashTime > 0) {
        const ease = this.dashTime > DASH.EASE_OUT_FRAMES ? 1 : this.dashTime / DASH.EASE_OUT_FRAMES;
        this.vx = this.dashDir * DASH.SPEED * (0.5 + 0.5 * ease);
        this.dashTime--;
        if (this.dashTime === 0) {
          // 冲刺收尾：保留部分速度形成惯性，并喷出气流拖尾
          this.vx = this.dashDir * DASH.SPEED * DASH.INERTIA_KEEP;
          this.dashInertia = DASH.INERTIA_FRAMES;
          Particles.dashTrail(this.x + this.w / 2, this.y + this.h / 2, this.dashDir);
        }
      } else {
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        const stunned = this.landStun > 0;
        const biome = Level.biome || {};
        const ice = this.onGround && biome.ice;
        // 疾风之靴：移动速度与加速度提升（联机客人使用房主下发的倍率）
        const runMul = (Game.multiplayer && this.netRunMul)
          ? this.netRunMul
          : 1 + 0.06 * Storage.upgrade('swift');
        if (dir !== 0 && !stunned) {
          // 空中控制：上升 100%，下落 70%，避免下落阶段过度漂移
          let ctrl = 1;
          if (!this.onGround) {
            ctrl = this.vy < 0 ? FEEL.AIR_CONTROL_RISE : FEEL.AIR_CONTROL_FALL;
          }
          const groundAccel = PHYS.RUN_ACCEL * (ice ? 0.55 : 1) * runMul;
          this.vx += dir * (this.onGround ? groundAccel : PHYS.AIR_ACCEL * runMul) * ctrl;
          const maxSpeed = this.dashInertia > 0
            ? PHYS.MAX_RUN * DASH.INERTIA_MAX_RATIO * runMul
            : PHYS.MAX_RUN * runMul;
          this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
          this.facing = dir;
        } else {
          // 落地硬直：短暂忽略方向输入并快速减速
          const groundFric = PHYS.GROUND_FRICTION * (ice ? 0.22 : 1);
          const baseFric = stunned
            ? groundFric
            : (this.onGround ? groundFric : PHYS.AIR_FRICTION);
          let decel = baseFric;
          if (!this.onGround && this.vy >= 0) decel *= FEEL.AIR_FRICTION_FALL;
          if (this.dashInertia > 0) decel += DASH.INERTIA_FRICTION;
          if (this.vx > 0) this.vx = Math.max(0, this.vx - decel);
          else if (this.vx < 0) this.vx = Math.min(0, this.vx + decel);
        }
        if (this.dashInertia > 0) this.dashInertia--;
        // 风区：空中受到持续风力；周期强风会额外提供阵风推力
        if (!this.onGround && (biome.wind || biome.gust)) {
          const wmax = PHYS.MAX_RUN * 1.3 * runMul;
          const gust = Level.gustPower ? Level.gustPower() : 0;
          this.vx = Math.max(-wmax, Math.min(wmax,
            this.vx + (biome.wind || 0) + gust));
        }
      }
      if (this.landStun > 0) this.landStun--;

      // ---- 跳跃（缓冲 + 土狼时间）----
      if (inp.consumeJump()) this.jumpBuffer = PHYS.JUMP_BUFFER_FRAMES;

      if (this.jumpBuffer > 0 && this.onGround && inp.down &&
          this.groundObj && this.groundObj.oneWay) {
        // 单向平台：按住 S（下）+ 跳跃 → 向下穿落
        this.dropTimer = MECH.DROP_THROUGH_FRAMES;
        this.jumpBuffer = 0;
        this.onGround = false;
        this.vy = MECH.DROP_THROUGH_VY;
        Sound.drop();
      } else if (this.jumpBuffer > 0) {
        if ((this.onGround || this.coyote > 0) && this.jumpsLeft > 0) {
          this.vy = PHYS.JUMP_VELOCITY * this.jumpBoost();
          this.jumpsLeft--;
          this.onGround = false;
          this.coyote = 0;
          this.jumpBuffer = 0;
          Sound.jump();
        } else if (!this.onGround &&
                   (this.jumpsLeft > 0 || (Storage.coward() && !Game.multiplayer))) {
          // 胆小鬼模式：空中跳跃次数不消耗，可实现无限连跳（联机时统一关闭）
          this.vy = PHYS.AIR_JUMP_VELOCITY * this.jumpBoost();
          if (Storage.coward() && !Game.multiplayer) this.jumpsLeft = this.maxJumps();
          else this.jumpsLeft--;
          this.jumpBuffer = 0;
          Level.addRing(this.x + this.w / 2, this.y + this.h / 2);  // 二段跳扩散光环
          Sound.doubleJump();
        }
      }
      if (this.jumpBuffer > 0) this.jumpBuffer--;
      if (this.dropTimer > 0) this.dropTimer--;

      // ---- 可变跳跃高度：提前松开跳跃键则截断上升速度（短按跳得低）----
      if (inp.consumeJumpRelease() && this.vy < FEEL.JUMP_CUT_VELOCITY) {
        this.vy = FEEL.JUMP_CUT_VELOCITY;
      }

      // ---- 重力 ----
      this.vy = Math.min(this.vy + PHYS.GRAVITY, PHYS.MAX_FALL);

      // ---- 碰撞：先水平后垂直 ----
      this.x += this.vx;
      Physics.resolveHorizontal(this, Level.platforms);

      const fallSpeed = this.vy;      // 记录落地瞬间的下落速度（解算后会被清零）
      this.y += this.vy;
      Physics.resolveVertical(this, Level.platforms);

      // 落地反馈：硬直 + 减速 + 尘土音效；高处落地按速度触发震屏
      if (!wasOnGround && this.onGround) {
        this.landStun = FEEL.LAND_STUN_FRAMES;
        this.vx *= (1 - FEEL.LAND_STUN_DECEL);
        if (fallSpeed > FEEL.LAND_DUST_FALL) {
          Sound.land();
          Particles.dust(this.x + this.w / 2, this.y + this.h);
        }
        if (fallSpeed >= FEEL.LAND_SHAKE_MIN_FALL) {
          const strength = Math.min(FEEL.LAND_SHAKE_MAX,
            Math.round(fallSpeed - FEEL.LAND_SHAKE_MIN_FALL) + 4);
          Game.shake = Math.max(Game.shake, strength);
        }
      }

      // 跑步扬尘：速度越快，生成间隔越短
      if (this.onGround && Math.abs(this.vx) >= FEEL.RUN_DUST_SPEED) {
        if (this.runDustCd > 0) this.runDustCd--;
        else {
          Particles.dust(this.x + this.w / 2, this.y + this.h);
          this.runDustCd = Math.max(4, Math.round(14 - Math.abs(this.vx) * 1.6));
        }
      } else {
        this.runDustCd = 0;
      }

      // 左右边界
      if (this.x < 0) { this.x = 0; this.vx = 0; }
      if (this.x + this.w > Level.data.width) {
        this.x = Level.data.width - this.w; this.vx = 0;
      }

      // 落地重置跳跃；离开平台消耗土狼时间
      if (this.onGround) {
        this.jumpsLeft = this.maxJumps();
        this.coyote = PHYS.COYOTE_FRAMES;
      } else {
        this.coyote = Math.max(0, this.coyote - 1);
      }

      if (this.invuln > 0) this.invuln--;
      if (this.flash > 0) this.flash--;

      // 记录冲刺残影
      if (this.dashTime > 0) {
        Level.trail.push({ x: this.x, y: this.y, life: 10 });
      }
      for (const t of Level.trail) t.life--;
      Level.trail = Level.trail.filter((t) => t.life > 0);
    }
  };

  // 队伍：players[0] 为本机玩家（沿用原有单例），其余玩家通过原型继承复用同一套物理逻辑
  const players = [player];

  // 独立输入状态（远程玩家 / 本地第二套键位使用；本地玩家直接用全局 Input）
  function makeInputState() {
    return {
      left: false, right: false, up: false, down: false,
      jumpHeld: false, jumpPressed: false, jumpReleased: false,
      dashPressed: false, restartPressed: false, pausePressed: false,
      consumeJump() { const v = this.jumpPressed; this.jumpPressed = false; return v; },
      consumeJumpRelease() { const v = this.jumpReleased; this.jumpReleased = false; return v; },
      consumeDash() { const v = this.dashPressed; this.dashPressed = false; return v; },
      consumePause() { const v = this.pausePressed; this.pausePressed = false; return v; },
      consumeRestart() { const v = this.restartPressed; this.restartPressed = false; return v; }
    };
  }

  // 创建队伍成员（id 从 0 开始；input 为网络/本地第二套输入）
  function createPartyPlayer(id, input) {
    const p = Object.create(player);
    p.id = id;
    p.visualId = id;
    p.input = input || null;
    p.hearts = Storage.startLives();
    p.shield = 0;
    p.extra = id > 0;
    return p;
  }

  // 队伍传送站位：在检查点附近左右错开，避免多人叠在一起
  function partySpawn(index, base) {
    const offs = [0, 26, -26, 52, -52, 78];
    const b = base || Level.spawnPoint();
    return { x: b.x + (offs[index % offs.length] || 0), y: b.y };
  }

  // ============================================================
  // 8. 摄像机
  // ============================================================
  const Camera = {
    x: 0, y: 0,
    update() {
      // 队伍相机：跟随所有玩家的水平包围盒中心
      let minX = Infinity, maxX = -Infinity;
      for (const p of players) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + p.w);
      }
      if (!isFinite(minX)) { minX = maxX = player.x; }
      const targetX = (minX + maxX) / 2 - VIEW.W * 0.5;
      this.x += (targetX - this.x) * 0.12;
      this.x = Math.max(0, Math.min(this.x, Level.data.width - VIEW.W));
      this.y = 0;
    },
    reset() { this.x = 0; this.y = 0; }
  };

  // ============================================================

  // 4. 输入模块
  // ============================================================
  const Input = {
    left: false, right: false, up: false, down: false,
    jumpHeld: false,                 // 跳跃键按住状态（用于可变跳跃高度）
    jumpPressed: false,              // 跳跃按下（边缘触发）
    jumpReleased: false,             // 跳跃松开（边缘触发，用于短按截断）
    dashPressed: false,
    restartPressed: false,
    pausePressed: false,
    pauseReqPressed: false,          // P：联机客人请求暂停
    confirmPressed: false,
    fullscreenPressed: false,
    mutePressed: false,              // M 静音切换（边缘触发）
    mouseX: 0, mouseY: 0,
    tapped: false, tapX: 0, tapY: 0, // 指针点击坐标（菜单/图标命中检测）
    touchMode: false,                // 是否显示虚拟按键
    pointerButtons: {},              // pointerId -> 虚拟按键 id（多点触控）
    gpLeft: false, gpRight: false, gpUp: false, gpDown: false,
    gpJump: false, gpDash: false, gpPause: false,

    init() {
      // 自动识别触屏设备：PC 默认隐藏虚拟按键
      this.touchMode = window.matchMedia('(pointer: coarse)').matches ||
        (navigator.maxTouchPoints > 0 &&
         /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

      // 任意用户手势解锁音频（浏览器自动播放策略）
      const unlockAudio = () => Sound.unlock();

      window.addEventListener('keydown', (e) => {
        if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) {
          e.preventDefault();
        }
        unlockAudio();
        if (e.repeat) return;

        // 设置页按键重映射：捕获下一次按键
        if (Game.capturingKey && Game.state === 'settings') {
          e.preventDefault();
          if (e.code === 'Escape') {
            Game.capturingKey = null;
            Sound.pause();
            return;
          }
          Storage.data.keys[Game.capturingKey] = e.code;
          Storage.save();
          Game.capturingKey = null;
          Sound.click();
          return;
        }

        const keys = Storage.data.keys;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft')  this.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.right = true;
        if (e.code === 'KeyW' || e.code === 'ArrowUp')    this.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown')  this.down = true;
        if (e.code === keys.jump)       { this.jumpPressed = true; this.jumpHeld = true; this.confirmPressed = true; }
        if (e.code === 'Enter')         this.confirmPressed = true;
        if (e.code === keys.dash)       this.dashPressed = true;
        if (e.code === 'KeyR')          this.restartPressed = true;
        if (e.code === 'Escape')        this.pausePressed = true;
        if (e.code === 'KeyP')          this.pauseReqPressed = true;
        if (e.code === 'KeyF')          this.fullscreenPressed = true;
        if (e.code === 'KeyM')          this.mutePressed = true;
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft')  this.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.right = false;
        if (e.code === 'KeyW' || e.code === 'ArrowUp')    this.up = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown')  this.down = false;
        if (e.code === Storage.data.keys.jump) {
          this.jumpHeld = false; this.jumpReleased = true;
        }
      });

      // 指针坐标换算到 960×540 逻辑坐标
      const toGame = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) * (VIEW.W / r.width),
          y: (e.clientY - r.top) * (VIEW.H / r.height)
        };
      };

      canvas.addEventListener('pointermove', (e) => {
        const p = toGame(e);
        this.mouseX = p.x; this.mouseY = p.y;
      });

      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        unlockAudio();
        const p = toGame(e);
        this.mouseX = p.x; this.mouseY = p.y;
        this.tapped = true; this.tapX = p.x; this.tapY = p.y;

        // 游戏中按下虚拟按键
        if (Game.state === 'playing') {
          const btn = UI.touchButtons().find((b) => hitRect(p.x, p.y, b));
          if (btn) {
            this.pointerButtons[e.pointerId] = btn.id;
            this.pressTouch(btn.id, true);
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
          }
        }
      });

      const release = (e) => {
        const id = this.pointerButtons[e.pointerId];
        if (id) { this.pressTouch(id, false); delete this.pointerButtons[e.pointerId]; }
      };
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);

      // 阻止移动端双击缩放 / 长按菜单
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('gesturestart', (e) => e.preventDefault());

      window.addEventListener('blur', () => {
        this.left = this.right = this.up = this.down = false;
        this.jumpHeld = false;
        for (const k in this.pointerButtons) this.pressTouch(this.pointerButtons[k], false);
        this.pointerButtons = {};
      });
    },

    // 手柄轮询：左摇杆/十字键移动，A 跳跃，X/RB 冲刺，Start 暂停
    pollGamepad() {
      if (!navigator.getGamepads) return;
      let gp = null;
      try {
        for (const p of navigator.getGamepads()) {
          if (p && p.connected) { gp = p; break; }
        }
      } catch (e) { return; }
      if (!gp) {
        this.gpLeft = this.gpRight = this.gpUp = this.gpDown = false;
        this.gpJump = this.gpDash = this.gpPause = false;
        return;
      }
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const gl = ax < -0.35 || btn(12);
      const gr = ax > 0.35 || btn(13);
      const gu = ay < -0.45 || btn(15);
      const gd = ay > 0.45 || btn(14);
      if (gl) this.left = true;
      else if (this.gpLeft) this.left = false;
      if (gr) this.right = true;
      else if (this.gpRight) this.right = false;
      if (gu) this.up = true;
      else if (this.gpUp) this.up = false;
      if (gd) this.down = true;
      else if (this.gpDown) this.down = false;
      this.gpLeft = gl; this.gpRight = gr; this.gpUp = gu; this.gpDown = gd;

      const j = btn(0) || btn(1);
      if (j && !this.gpJump) {
        this.jumpPressed = true;
        this.jumpHeld = true;
        this.confirmPressed = true;
      }
      if (!j && this.gpJump) {
        this.jumpHeld = false;
        this.jumpReleased = true;
      }
      this.gpJump = j;

      const d = btn(2) || btn(5);
      if (d && !this.gpDash) this.dashPressed = true;
      this.gpDash = d;

      const s = btn(9);
      if (s && !this.gpPause) this.pausePressed = true;
      this.gpPause = s;
    },

    // 处理虚拟按键按下/松开
    pressTouch(id, down) {
      if (id === 'left')  this.left = down;
      if (id === 'right') this.right = down;
      if (id === 'jump') {
        if (down) { this.jumpPressed = true; this.jumpHeld = true; }
        else { this.jumpHeld = false; this.jumpReleased = true; }
      }
      if (id === 'dash' && down) this.dashPressed = true;
    },

    consumeJump()        { const v = this.jumpPressed;    this.jumpPressed = false;    return v; },
    consumeJumpRelease() { const v = this.jumpReleased;   this.jumpReleased = false;   return v; },
    consumeDash()        { const v = this.dashPressed;    this.dashPressed = false;    return v; },
    consumeRestart()     { const v = this.restartPressed; this.restartPressed = false; return v; },
    consumePause()       { const v = this.pausePressed;   this.pausePressed = false;   return v; },
    consumePauseRequest(){ const v = this.pauseReqPressed; this.pauseReqPressed = false; return v; },
    consumeConfirm()     { const v = this.confirmPressed; this.confirmPressed = false; return v; },
    consumeFullscreen()  { const v = this.fullscreenPressed; this.fullscreenPressed = false; return v; },
    consumeMute()        { const v = this.mutePressed;    this.mutePressed = false;    return v; },
    consumeTap() {
      if (!this.tapped) return null;
      this.tapped = false;
      return { x: this.tapX, y: this.tapY };
    },

    clearFrame() {
      this.jumpPressed = false;
      this.jumpReleased = false;
      this.dashPressed = false;
      this.restartPressed = false;
      this.pausePressed = false;
      this.pauseReqPressed = false;
      this.confirmPressed = false;
      this.fullscreenPressed = false;
      this.mutePressed = false;
      this.tapped = false;
    }
  };

  // ============================================================

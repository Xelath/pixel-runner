  // 9.5 多人联机：大厅 UI + WebSocket 中继 + 房主权威同步
  //     房主运行完整模拟并广播快照；客人只应用快照并渲染
  // ============================================================
  // 快照里的敌人类型编码（客人端按同一顺序解码）
  const NET_ENEMY_TYPES = [
    'walker', 'flyer', 'charger', 'spiky',
    'hopper', 'shooter', 'armored', 'ghost'
  ];
  // 快照里的弹体类型编码（客人端按同一顺序解码）
  const NET_PROJ_KINDS = ['fire', 'enemy', 'wave', 'orb', 'beam', 'beamwarn', 'rock'];

  const Net = {
    ws: null,
    connecting: false,
    role: null,              // 'host' 房主 | 'guest' 客人
    code: '',
    token: '',               // 断线重连凭证
    pendingRejoin: false,
    reconnecting: false,
    rejoinAttempts: 0,
    reconnectTimer: null,
    reconnectDeadline: 0,    // 重连截止时间（用于倒计时）
    hostDownSince: 0,        // 房主掉线起始时间（用于倒计时）
    hostOnline: true,        // 大厅/对局中房主是否在线
    hostAway: false,         // 房主切到后台，快照暂停
    myId: -1,
    hostId: 0,
    members: [],
    started: false,
    inGame: false,
    roomView: false,
    msg: '',
    msgErr: false,
    remoteInputs: {},        // 房主：客人 id -> 输入状态
    inTick: 0,
    sendTick: 0,
    lastSnapAt: 0,
    lag: {},                // 服务端测得的各成员延迟：id -> ms
    jitter: {},             // 各成员抖动：id -> ms
    // 客人端预测 / 插值
    snapPrev: null,         // 上一份玩家快照
    snapCurr: null,         // 最新玩家快照
    snapAt: 0,              // 最新快照到达时间
    lastSnapTime: 0,
    snapSpan: 33,           // 估算的快照间隔（毫秒）
    predReady: false,       // 是否已拿到可用于本地预测的快照
    bits: {},               // 客人：收集物位图（增量快照沿用）
    hostBits: null,         // 房主：上一份位图，用于只发送变化项
    events: [],             // 房主：待同步给客人的视听事件
    ui: null,

    init() {
      const $ = (id) => document.getElementById(id);
      this.ui = {
        lobby: $('mpLobby'), status: $('mpStatus'),
        setup: $('mpSetup'), room: $('mpRoom'),
        name: $('mpName'), code: $('mpCode'),
        create: $('mpCreate'), join: $('mpJoin'),
        codeShow: $('mpCodeShow'), list: $('mpList'), copy: $('mpCopy'),
        ready: $('mpReady'), start: $('mpStart'), leave: $('mpLeave'),
        hint: $('mpHint'), close: $('mpClose')
      };
      const u = this.ui;
      try {
        u.name.value = localStorage.getItem('pixelRunnerName') ||
          ('玩家' + Math.floor(Math.random() * 900 + 100));
      } catch (e) { u.name.value = '玩家'; }

      u.create.onclick = () => this.createRoom();
      u.join.onclick = () => this.joinRoom();
      u.ready.onclick = () => this.toggleReady();
      u.start.onclick = () => this.startGame();
      u.leave.onclick = () => this.leaveRoom();
      u.copy.onclick = () => this.copyCode();
      u.close.onclick = () => this.handleEscape();
      u.code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.joinRoom(); }
      });
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape' || !this.lobbyOpen()) return;
        this.handleEscape();
      });
      // 房主切后台时浏览器会暂停 rAF：通知客人暂停等待，避免误判掉线
      document.addEventListener('visibilitychange', () => {
        this.hostAwayChanged(!!document.hidden);
      });
      this.render();
    },

    lobbyOpen() {
      return !!(this.ui && this.ui.lobby.classList.contains('open'));
    },

    setStatus(text, err) {
      this.msg = text || '';
      this.msgErr = !!err;
      if (!this.ui) return;
      this.ui.status.textContent = text || '';
      this.ui.status.className = 'mp-status' + (err ? ' err' : '');
    },

    wsUrl() {
      if (location.protocol === 'file:') return null;
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') +
        location.host + '/ws';
    },

    // ---- 打开 / 关闭大厅 ----
    openLobby() {
      if (!this.ui) return;
      this.ui.lobby.classList.add('open');
      // 页面刷新 / 重新打开大厅：尝试用上次的 token 恢复房间
      if (!this.code && !this.ws) {
        const sess = this.loadSession();
        if (sess) {
          this.code = sess.code;
          this.token = sess.token;
          this.pendingRejoin = true;
        }
      }
      this.roomView = !!this.code && !this.pendingRejoin;
      Game.state = 'multiplayer';
      if (!this.ws || this.ws.readyState > 1) this.connect(this.pendingRejoin);
      this.render();
    },

    closeLobby() {
      if (!this.ui) return;
      this.ui.lobby.classList.remove('open');
      this.roomView = false;
      if (Game.state === 'multiplayer') Game.state = 'menu';
      this.render();
    },

    handleEscape() {
      if (this.roomView || this.code) this.leaveRoom();
      else this.closeLobby();
    },

    // ---- 连接 ----
    connect(rejoin) {
      if (this.connecting) return;
      const url = this.wsUrl();
      if (!url) {
        this.setStatus('请先运行 node server.js，再用浏览器访问服务器地址', true);
        this.render();
        return;
      }
      if (rejoin) this.pendingRejoin = true;
      this.connecting = true;
      this.setStatus(rejoin ? '正在重连服务器…' : '正在连接服务器…');
      let ws;
      try { ws = new WebSocket(url); } catch (e) {
        this.connecting = false;
        if (this.reconnecting) this.scheduleReconnect();
        else this.setStatus('连接失败：请确认服务器已启动', true);
        return;
      }
      const sock = ws;
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== sock) return;
        this.connecting = false;
        if (this.pendingRejoin && this.token && this.code) {
          this.pendingRejoin = false;
          this.send({ t: 'rejoin', code: this.code, token: this.token });
          this.setStatus('正在恢复房间…');
          // 服务器无响应时关闭连接，交给重试流程
          setTimeout(() => {
            if (this.reconnecting && this.ws === sock) {
              try { sock.close(); } catch (e) {}
            }
          }, 5000);
        } else {
          this.setStatus('已连接，可创建或加入房间');
        }
        this.render();
      };
      ws.onmessage = (ev) => this.onMessage(ev.data);
      ws.onerror = () => {
        if (this.ws !== sock) return;
        this.connecting = false;
        if (!this.reconnecting) this.setStatus('连接失败：请确认服务器已启动（node server.js）', true);
      };
      ws.onclose = () => {
        if (this.ws !== sock) return;
        this.connecting = false;
        this.ws = null;
        if (this.reconnecting) {
          this.scheduleReconnect();
          return;
        }
        if (this.inGame || (this.code && this.token)) {
          this.beginReconnect();
          return;
        }
        this.setStatus('服务器连接已断开', true);
        this.render();
      };
    },

    // ---- 断线重连流程 ----
    beginReconnect() {
      if (this.reconnecting) return;
      if (!this.token || !this.code) {
        if (this.inGame) this.dropToLobby('与服务器断开连接');
        else {
          this.setStatus('服务器连接已断开', true);
          this.render();
        }
        return;
      }
      this.reconnecting = true;
      this.rejoinAttempts = 0;
      this.reconnectDeadline = performance.now() + 30000;
      this.setStatus('连接中断，正在尝试重连…', true);
      this.render();
      this.scheduleReconnect();
    },
    scheduleReconnect() {
      if (!this.reconnecting) return;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.rejoinAttempts >= 15) {
        this.abortReconnect();
        return;
      }
      const delay = this.rejoinAttempts === 0 ? 0 : 2000;
      this.rejoinAttempts++;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.reconnecting) this.connect(true);
      }, delay);
    },
    stopReconnect() {
      this.reconnecting = false;
      this.pendingRejoin = false;
      this.rejoinAttempts = 0;
      this.reconnectDeadline = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    },

    // 房主页面切后台 / 回到前台
    hostAwayChanged(hidden) {
      if (this.role !== 'host' || !this.inGame) return;
      if (hidden === this.hostAway) return;
      this.hostAway = hidden;
      this.send({ t: 'hostAway', away: hidden });
      if (hidden) {
        this.releaseInputs();
        this.sendSnapshotNow();
      } else {
        this.hostBits = null;
        this.sendSnapshotNow();
        this.lastSnapAt = performance.now();
      }
    },

    // 清除本地按键，避免切后台后按键卡住
    releaseInputs() {
      Input.left = Input.right = Input.up = Input.down = false;
      Input.jumpHeld = false;
      Input.jumpPressed = false;
      Input.jumpReleased = false;
      Input.dashPressed = false;
      for (const id of Object.keys(this.remoteInputs)) {
        const st = this.remoteInputs[id];
        if (!st) continue;
        st.left = st.right = st.up = st.down = false;
        st.jumpHeld = false;
        st.jumpPressed = false;
        st.jumpReleased = false;
        st.dashPressed = false;
      }
    },
    abortReconnect() {
      this.stopReconnect();
      this.clearSession();
      this.token = '';
      if (this.inGame) {
        this.dropToLobby('重连失败，已退出房间');
      } else {
        this.resetRoom();
        this.roomView = false;
        this.setStatus('重连失败，请重新加入房间', true);
        this.render();
      }
    },

    send(obj) {
      if (this.ws && this.ws.readyState === 1) {
        try { this.ws.send(JSON.stringify(obj)); return true; } catch (e) {}
      }
      return false;
    },

    playerName() {
      const n = (this.ui.name.value || '').trim().slice(0, 8);
      const val = n || '玩家';
      try { localStorage.setItem('pixelRunnerName', val); } catch (e) {}
      return val;
    },

    // ---- 断线重连凭证（会话级，刷新页面也能恢复）----
    saveSession() {
      if (!this.code || !this.token) return;
      const m = this.members[this.myId];
      const name = m ? m.name : (this.ui ? this.playerName() : '玩家');
      try {
        sessionStorage.setItem('pixelRunnerRoom', JSON.stringify({
          code: this.code, token: this.token, name
        }));
      } catch (e) {}
    },
    loadSession() {
      try {
        const raw = sessionStorage.getItem('pixelRunnerRoom');
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || !/^\d{4}$/.test(s.code || '') || !s.token) return null;
        return s;
      } catch (e) { return null; }
    },
    clearSession() {
      try { sessionStorage.removeItem('pixelRunnerRoom'); } catch (e) {}
    },

    // ---- 房间操作 ----
    createRoom() {
      if (!this.ws || this.ws.readyState !== 1) {
        this.connect();
        this.setStatus('正在连接，请稍后再点一次');
        return;
      }
      this.role = 'host';
      this.send({ t: 'create', name: this.playerName() });
    },

    joinRoom() {
      if (!this.ws || this.ws.readyState !== 1) {
        this.connect();
        this.setStatus('正在连接，请稍后再点一次');
        return;
      }
      const code = (this.ui.code.value || '').replace(/\D/g, '').slice(0, 4);
      if (code.length !== 4) { this.setStatus('请输入 4 位房间码', true); return; }
      this.role = 'guest';
      this.send({ t: 'join', code, name: this.playerName() });
    },

    kickMember(id) {
      if (this.role !== 'host' || this.started) return;
      this.send({ t: 'kick', id });
    },

    toggleReady() {
      if (!this.code || this.role !== 'guest') return;
      const me = this.members[this.myId];
      this.send({ t: 'ready', ready: !(me && me.ready) });
    },

    startGame() {
      if (!this.code || this.role !== 'host') return;
      const waiting = this.members.some((m, i) => i !== this.hostId && !m.ready);
      if (this.members.length < 2) { this.setStatus('至少需要 2 人才能开始', true); return; }
      if (waiting) { this.setStatus('还有队友未准备', true); return; }
      this.send({ t: 'start', level: 0, partySize: this.members.length });
    },

    copyCode() {
      const text = this.code;
      const done = () => this.setStatus('房间码已复制：' + text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => this.setStatus('房间码：' + text));
      } else this.setStatus('房间码：' + text);
    },

    resetRoom() {
      this.role = null;
      this.code = '';
      this.token = '';
      this.pendingRejoin = false;
      this.hostOnline = true;
      this.hostAway = false;
      this.hostDownSince = 0;
      this.reconnectDeadline = 0;
      this.myId = -1;
      this.hostId = 0;
      this.members = [];
      this.started = false;
      this.remoteInputs = {};
      this.inTick = 0;
      this.sendTick = 0;
      this.lastSnapAt = 0;
      this.lag = {};
      this.jitter = {};
      this.snapPrev = null;
      this.snapCurr = null;
      this.snapAt = 0;
      this.lastSnapTime = 0;
      this.snapSpan = 33;
      this.predReady = false;
      this.bits = {};
      this.hostBits = null;
      this.events = [];
    },

    leaveRoom() {
      const wasInGame = this.inGame;
      if (this.code) this.send({ t: 'leave' });
      this.stopReconnect();
      this.clearSession();
      this.resetRoom();
      this.inGame = false;
      this.roomView = false;
      Game.multiplayer = false;
      Game.levelItem = null;
      if (wasInGame) {
        Game.state = 'multiplayer';
        Music.stop();
      }
      Game.state = 'multiplayer';
      if (this.ui) this.ui.lobby.classList.add('open');
      this.setStatus('');
      this.render();
    },

    // 房主结束对局：广播中止，成员保留在房间，回到大厅
    endToLobby() {
      if (this.role === 'host' && this.inGame) {
        this.send({ t: 'abort', reason: '房主结束了本局' });
        this.send({ t: 'reset' });
      }
      this.inGame = false;
      this.started = false;
      Game.multiplayer = false;
      Game.levelItem = null;
      Game.state = 'menu';
      Game.goMenu();          // 此时 multiplayer 已置 false，走正常返回逻辑
      this.openLobby();
    },

    dropToLobby(text) {
      this.inGame = false;
      this.stopReconnect();
      this.clearSession();
      this.resetRoom();
      Game.multiplayer = false;
      Game.state = 'multiplayer';
      this.roomView = false;
      if (this.ui) this.ui.lobby.classList.add('open');
      this.setStatus(text, true);
      this.render();
    },

    // ---- 服务端消息 ----
    onMessage(raw) {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || !m.t) return;
      if (m.t === 'room') this.onRoom(m);
      else if (m.t === 'start') this.onStart(m);
      else if (m.t === 'resumed') this.onResumed(m);
      else if (m.t === 'resyncReq') {
        if (this.role === 'host' && this.inGame) {
          this.hostBits = null;
          this.sendSnapshotNow();
        }
      }
      else if (m.t === 'hostAway') {
        this.hostAway = !!m.away;
        if (!m.away) this.lastSnapAt = performance.now();
        this.render();
      }
      else if (m.t === 'pauseReq') {
        if (this.role === 'host' && this.inGame && Game.state === 'playing') {
          const who = players[m.from | 0];
          Game.pauseGame();
          if (who) {
            Level.addPopup(who.x + who.w / 2, who.y - 24,
              'P' + ((m.from | 0) + 1) + ' 请求暂停', '#8adcff');
          }
        }
      }
      else if (m.t === 'lagPing') this.send({ t: 'lagPong', ts: m.ts });
      else if (m.t === 'lag') this.onLag(m);
      else if (m.t === 'in') this.onRemoteInput(m);
      else if (m.t === 'snap') { if (this.role === 'guest' && this.inGame) this.applySnapshot(m.snap); }
      else if (m.t === 'abort') this.onAbort(m.reason);
      else if (m.t === 'closed') this.onClosed(m.reason);
      else if (m.t === 'error') {
        if (m.rejoin) {
          // 重连凭证失效 / 房间已关闭：结束重连并回到大厅
          this.stopReconnect();
          this.clearSession();
          this.token = '';
          if (this.inGame) this.dropToLobby(m.msg || '重连失败');
          else {
            this.resetRoom();
            this.roomView = false;
            this.setStatus(m.msg || '重连失败', true);
            this.render();
          }
        } else {
          this.setStatus(m.msg || '操作失败', true);
        }
      }
    },

    // 服务端确认重连：恢复房主/客人身份并等待全量快照
    onResumed(m) {
      const wasInGame = this.inGame;
      this.stopReconnect();
      this.code = m.code || this.code;
      this.myId = typeof m.you === 'number' ? m.you : this.myId;
      this.role = m.role || this.role;
      this.hostId = 0;
      this.started = !!m.started;
      this.hostAway = false;
      this.hostDownSince = 0;
      this.lastSnapAt = performance.now();
      this.lastSnapTime = 0;
      this.snapSpan = 33;

      if (m.started) {
        this.inGame = true;
        Game.multiplayer = true;
        if (this.role === 'host') {
          const inSim = ['playing', 'levelIntro', 'paused', 'dying',
            'dead', 'win', 'gameComplete'].includes(Game.state);
          if (!inSim) {
            // 房主页面被刷新后无法恢复权威模拟：关闭房间，避免客人卡死
            this.send({ t: 'close', reason: '房主页面已刷新，房间已关闭' });
            this.clearSession();
            this.onClosed('房主页面已刷新，房间已关闭，请重新创建房间');
            return;
          }
          this.hostBits = null;
          this.sendSnapshotNow();
        } else {
          const level = Number.isFinite(m.level) ? m.level : 0;
          const fresh = !wasInGame || Game.state === 'menu' ||
            Game.state === 'multiplayer';
          if (fresh || Game.level !== level) {
            Game.prepareGuestLevel(level, Math.max(1, Math.min(4, m.partySize | 0)));
            const me = players[this.myId];
            if (me) me.input = null;
            this.bits = {};
            this.snapPrev = null;
            this.snapCurr = null;
            this.predReady = false;
            if (!['levelIntro', 'playing'].includes(Game.state)) {
              Game.state = 'levelIntro';
              Game.introTimer = 0;
            }
          }
        }
        if (this.ui) this.ui.lobby.classList.remove('open');
      } else {
        this.inGame = false;
        this.roomView = true;
        this.started = false;
        Game.multiplayer = false;
        Game.state = 'multiplayer';
      }
      this.hostOnline = true;
      this.setStatus(m.started ? '已重新连接，等待同步…' : '已恢复房间');
      this.render();
    },

    onRoom(m) {
      this.code = m.code || '';
      if (m.token) this.token = m.token;
      this.myId = typeof m.you === 'number' ? m.you : -1;
      this.hostId = typeof m.hostId === 'number' ? m.hostId : 0;
      this.members = Array.isArray(m.members) ? m.members : [];
      this.started = !!m.started;
      const wasHostOnline = this.hostOnline;
      this.hostOnline = this.members.length
        ? (this.members[0].online !== false) : true;
      this.hostAway = !!m.hostAway;
      if (!this.hostOnline && wasHostOnline) {
        this.hostDownSince = performance.now();
      } else if (this.hostOnline) {
        this.hostDownSince = 0;
      }
      // 房间成员变动时同步存储重连凭证
      this.saveSession();
      // 房间消息里也带延迟，成员变动 / 准备切换时能立即刷新
      this.lag = {};
      this.jitter = {};
      for (const mem of this.members) {
        if (Number.isFinite(mem.ms)) this.lag[mem.id] = mem.ms;
        if (Number.isFinite(mem.j)) this.jitter[mem.id] = mem.j;
      }
      if (!this.role) this.role = this.myId === this.hostId ? 'host' : 'guest';
      // 房主为每个客人准备独立输入状态
      for (let i = 1; i < this.members.length; i++) {
        if (!this.remoteInputs[i]) this.remoteInputs[i] = makeInputState();
      }
      this.roomView = true;
      if (!this.msg || this.msgErr) this.setStatus('');
      this.render();
    },

    onStart(m) {
      if (this.inGame) return;
      this.inGame = true;
      this.started = true;
      this.roomView = true;
      if (this.ui) this.ui.lobby.classList.remove('open');
      const level = Number.isFinite(m.level) ? m.level : 0;
      const party = Math.max(1, Math.min(4, m.partySize | 0));
      if (this.role === 'host') {
        Game.startMultiplayer(party);
        if (level !== Game.level) Game.loadLevel(level);
        for (let i = 1; i < players.length; i++) {
          players[i].input = this.remoteInputs[i] ||
            (this.remoteInputs[i] = makeInputState());
        }
        Game.state = 'levelIntro';
        Game.introTimer = 120;
      } else {
        Game.prepareGuestLevel(level, party);
        // 客人自己的角色走本地预测，必须使用键盘输入而不是网络输入槽
        const me = players[this.myId];
        if (me) me.input = null;
      }
      this.inTick = 0;
      this.sendTick = 0;
      this.lastSnapAt = performance.now();
      this.lastSnapTime = 0;
      this.snapSpan = 33;
      this.snapPrev = null;
      this.snapCurr = null;
      this.predReady = false;
      this.bits = {};
      this.hostBits = null;
      this.events = [];
      Input.pauseReqPressed = false;
      this.saveSession();
      Sound.click();
    },

    onAbort(reason) {
      if (!this.inGame) return;
      this.stopReconnect();
      this.inGame = false;
      this.started = false;
      Game.multiplayer = false;
      Game.levelItem = null;
      Game.state = 'menu';
      Game.goMenu();
      this.openLobby();
      this.setStatus(reason || '对局已结束', true);
    },

    onClosed(reason) {
      this.inGame = false;
      this.stopReconnect();
      this.clearSession();
      this.resetRoom();
      Game.multiplayer = false;
      Game.state = 'multiplayer';
      this.roomView = false;
      if (this.ui) this.ui.lobby.classList.add('open');
      this.setStatus(reason || '房间已关闭', true);
      this.render();
    },

    // 服务端广播的各成员延迟
    onLag(m) {
      const list = Array.isArray(m.list) ? m.list : [];
      this.lag = {};
      this.jitter = {};
      for (const item of list) {
        if (Number.isFinite(item.ms)) this.lag[item.id] = item.ms;
        if (Number.isFinite(item.j)) this.jitter[item.id] = item.j;
      }
      if (this.lobbyOpen()) this.render();
    },

    // 房主接收客人输入（边沿事件累加，避免丢跳跃/冲刺）
    onRemoteInput(m) {
      if (this.role !== 'host' || !this.inGame) return;
      const id = m.from | 0;
      if (id < 1 || id > 3) return;
      const st = this.remoteInputs[id] || (this.remoteInputs[id] = makeInputState());
      const inp = m.input || {};
      st.left = !!inp.left;
      st.right = !!inp.right;
      st.up = !!inp.up;
      st.down = !!inp.down;
      st.jumpHeld = !!inp.jumpHeld;
      if (inp.jumpPressed) st.jumpPressed = true;
      if (inp.jumpReleased) st.jumpReleased = true;
      if (inp.dashPressed) st.dashPressed = true;
      if (players[id]) players[id].input = st;
    },

    // ---- 客人：每帧输入上报 + 应用快照 ----
    guestTick() {
      Input.pollGamepad();
      this.inTick++;
      // 房主切后台 / 掉线 / 自己重连时冻结本地预测，避免无快照时跑偏
      if (Game.state === 'playing' && !this.reconnecting &&
          this.hostOnline && !this.hostAway) {
        // 先缓存边沿输入，再本地预测（Player.update 会消费 Input 的边沿事件）
        if (Input.jumpPressed) this.pendingJump = true;
        if (Input.jumpReleased) this.pendingJumpRelease = true;
        if (Input.dashPressed) this.pendingDash = true;

        // 本地预测自己的角色，避免 30ms 快照延迟带来的操作粘滞
        const me = players[this.myId];
        if (me && me.input === null) {
          // 移动平台的 dx/dy 已由快照计算，预测帧清零避免重复叠加
          for (const plat of Level.platforms) {
            if (plat.move) { plat.dx = 0; plat.dy = 0; }
          }
          me.update();
        }

        if (this.inTick % 2 === 0) {
          this.send({
            t: 'in',
            input: {
              left: Input.left, right: Input.right,
              up: Input.up, down: Input.down,
              jumpHeld: Input.jumpHeld,
              jumpPressed: !!this.pendingJump,
              jumpReleased: !!this.pendingJumpRelease,
              dashPressed: !!this.pendingDash
            }
          });
          this.pendingJump = false;
          this.pendingJumpRelease = false;
          this.pendingDash = false;
        }
      }
      if (Input.consumePause()) { this.leaveRoom(); return; }
      if (Input.consumePauseRequest() && this.inGame && this.started) {
        this.send({ t: 'pauseReq' });
      }
      // 客人不跑 Game.update，需要自行处理全屏 / 静音与背景音乐
      if (Input.consumeFullscreen()) toggleFullscreen();
      if (Input.consumeMute()) Game.toggleMute();
      if (Game.state === 'playing') Music.start();
      else if (Game.state !== 'paused') Music.stop();
      // 快照中断提示（房主卡住 / 掉线）
      if (this.inGame && !this.reconnecting && this.hostOnline &&
          !this.hostAway &&
          this.lastSnapAt && performance.now() - this.lastSnapAt > 12000) {
        this.dropToLobby('与房主连接中断，请重新加入房间');
        return;
      }
      // 远端玩家在相邻两份快照之间插值，消除 30Hz 跳动
      this.interpolateRemote(performance.now());
      Game.tick++;
      Particles.update();
      Camera.update();
      Input.clearFrame();
    },

    // 客人端播放房主同步过来的视听事件
    playNetEvents(evs) {
      for (const e of evs) {
        const x = e.x, y = e.y;
        if (e.k === 'coin') {
          Sound.coin();
          Particles.coinBurst(x, y);
          Level.addPopup(x, y - 8, '+1', '#ffe28a');
        } else if (e.k === 'gem') {
          Sound.gem();
          Particles.gemBurst(x, y);
          Level.addPopup(x, y - 8, '宝石 +1', '#9be2ff');
        } else if (e.k === 'heart') {
          Sound.heart();
          Particles.heartBurst(x, y);
          Level.addPopup(x, y - 6, 'P' + ((e.id | 0) + 1) + ' 生命 +1', '#ff9aa8');
        } else if (e.k === 'fruit') {
          Sound.power();
          Particles.fruitBurst(x, y);
          Level.addPopup(x, y - 8, '变大!', '#ffb23f');
        } else if (e.k === 'checkpoint') {
          Sound.checkpoint();
          Particles.coinBurst(x, y);
          Level.addPopup(x, y - 44, '检查点已激活', '#8adcff');
        } else if (e.k === 'shield') {
          Sound.shrink();
          Particles.gemBurst(x, y);
          Level.addPopup(x, y - 8, '护盾抵消', '#8adcff');
        } else if (e.k === 'shrink') {
          Sound.shrink();
          Particles.shrinkBurst(x, y);
          Level.addPopup(x, y - 8, '变小了', '#ffd23f');
        } else if (e.k === 'hurt') {
          Sound.hurt();
          Level.addPopup(x, y - 10, 'P' + ((e.id | 0) + 1) + ' -1 心', '#ff8a8a');
        } else if (e.k === 'revive') {
          Sound.heart();
          Level.addPopup(x, y - 18, '不屈意志：保留 1 心', '#ffd23f');
        } else if (e.k === 'stomp') {
          Sound.stomp();
          Particles.enemyChunks(x, y);
          Level.addRing(x, y);
          Level.addPopup(x, y - 8, '+1', '#ffe28a');
        } else if (e.k === 'armor') {
          Sound.stomp();
          Particles.enemyChunks(x, y);
          Level.addPopup(x, y - 8, '护甲破损', '#c8d0dc');
        }
      }
    },

    // 远端玩家位置插值（自己的角色由本地预测驱动）
    interpolateRemote(now) {
      if (!this.snapCurr) return;
      const prev = this.snapPrev || this.snapCurr;
      const span = Math.max(16, this.snapSpan || 33);
      const t = Math.max(0, Math.min(1, (now - this.snapAt) / span));
      for (let i = 0; i < players.length; i++) {
        if (i === this.myId) continue;
        const b = this.snapCurr[i];
        if (!b) continue;
        const a = prev[i] || b;
        const p = players[i];
        p.x = a.x + (b.x - a.x) * t;
        p.y = a.y + (b.y - a.y) * t;
      }
    },

    // ---- 房主：每 2 tick 广播一次世界快照 ----
    hostTick() {
      if (!this.inGame || this.members.length < 2) return;
      this.sendTick++;
      if (this.sendTick % 2 !== 0) return;
      const s = Game.state;
      if (!(s === 'playing' || s === 'levelIntro' || s === 'paused' ||
            s === 'dying' || s === 'dead' || s === 'win' ||
            s === 'gameComplete')) return;
      this.send({ t: 'snap', snap: this.buildSnapshot() });
    },

    // 立即补发一份全量快照（重连 / 队友加入后同步用）
    sendSnapshotNow() {
      if (!this.inGame) return;
      const s = Game.state;
      if (!(s === 'playing' || s === 'levelIntro' || s === 'paused' ||
            s === 'dying' || s === 'dead' || s === 'win' ||
            s === 'gameComplete')) return;
      this.hostBits = null;
      this.send({ t: 'snap', snap: this.buildSnapshot() });
    },

    buildSnapshot() {
      const L = Level;
      const r1 = (v) => Math.round(v * 10) / 10;
      const r2 = (v) => Math.round(v * 100) / 100;
      // 收集物状态用位图字符串，体积比 JSON 数字数组小很多
      const bitStr = (arr, key) => arr.map((o) => (o[key] ? 1 : 0)).join('');
      const cur = {
        level: Game.level,
        coinsC: bitStr(L.coins, 'collected'),
        gemsC: bitStr(L.gems, 'collected'),
        heartsC: bitStr(L.hearts, 'collected'),
        fruitsC: bitStr(L.fruits, 'collected'),
        hintsSeen: L.hints.map((h) => (h.seen ? 1 : 0)).join('')
      };
      // 关卡切换或长度变化时发送全量；否则只发变化过的位图
      const prev = this.hostBits;
      const full = !prev || prev.level !== cur.level ||
        prev.coinsC.length !== cur.coinsC.length ||
        prev.gemsC.length !== cur.gemsC.length ||
        prev.heartsC.length !== cur.heartsC.length ||
        prev.fruitsC.length !== cur.fruitsC.length ||
        prev.hintsSeen.length !== cur.hintsSeen.length;

      const snap = {
        tick: Game.tick, state: Game.state, level: Game.level,
        coins: Game.coins, totalCoins: Game.totalCoins, levelTime: Game.levelTime,
        lives: Game.lives, maxLives: Game.maxLives, shake: Game.shake,
        introTimer: Game.introTimer, deadFade: Game.deadFade,
        winFade: Game.winFade, dyingTimer: Game.dyingTimer,
        bossCarry: Game.bossCarry,
        // 房主的永久能力参数：客人本地预测时保持一致
        up: {
          mj: player.maxJumps(),
          dc: player.dashCdFrames(),
          rm: 1 + 0.06 * Storage.upgrade('swift')
        },
        // 紧凑数组：比对象键名节省大量体积（字段顺序与 applySnapshot 一致）
        players: players.map((p) => [
          r1(p.x), r1(p.y), r2(p.vx), r2(p.vy), p.w, p.h,
          (p.onGround ? 1 : 0) | (p.facing > 0 ? 2 : 0) | (p.big ? 4 : 0),
          p.hearts, p.shield, p.invuln, p.dashTime, p.dashDir,
          p.flash, p.jumpsLeft, p.visualId
        ]),
        enemies: L.enemies.map((e) => [
          r1(e.x), r1(e.y), e.dir, r1(e.anim),
          (e.alive ? 1 : 0) | (e.charging ? 2 : 0) | (e.elite ? 4 : 0),
          e.deadTimer | 0,
          Math.max(0, NET_ENEMY_TYPES.indexOf(e.type)),
          e.hp | 0, e.hurtTimer | 0
        ]),
        boss: L.boss ? {
          x: r1(L.boss.x), y: r1(L.boss.y), w: L.boss.w, h: L.boss.h,
          dir: L.boss.dir, anim: r1(L.boss.anim), hp: L.boss.hp,
          maxHp: L.boss.maxHp, phase: L.boss.phase, alive: L.boss.alive,
          hurtTimer: L.boss.hurtTimer, summonCd: L.boss.summonCd,
          act: L.boss.act | 0, actT: r1(L.boss.actT),
          nextAttack: r1(L.boss.nextAttack), nextKind: L.boss.nextKind | 0,
          chargeDir: L.boss.chargeDir | 0,
          beamDelay: r1(L.boss.beamDelay || 0), beamX: r1(L.boss.beamX || 0)
        } : null,
        traps: L.traps.map((t) => [
          Math.round(t.x), Math.round(t.y),
          (t.active ? 1 : 0) | (t.warn ? 2 : 0) | (t.armed ? 4 : 0),
          t.snap | 0, t.cool | 0, t.dir, t.timer | 0
        ]),
        proj: L.projectiles.map((p) => [
          r1(p.x), r1(p.y), p.w, p.h, r2(p.vx), r2(p.vy),
          Math.max(0, NET_PROJ_KINDS.indexOf(p.kind || 'fire')),
          p.life === undefined ? 0 : p.life | 0
        ]),
        lava: L.lava ? { y: r1(L.lava.y) } : null,
        gates: L.gates.map((g) => ({ opened: g.opened, openT: r2(g.openT), y: r1(g.y) })),
        falls: L.fallPlats.map((f) => ({
          state: f.state, timer: f.timer, alpha: r2(f.alpha),
          respawn: f.respawn, y: r1(f.y)
        })),
        pads: L.pads.map((p) => ({ squash: p.squash, cool: p.cool })),
        checkpoints: L.checkpoints.map((c) => ({ activated: c.activated })),
        activeCheckpoint: L.activeCheckpoint,
        flag: L.flag ? { x: r1(L.flag.x), y: r1(L.flag.y), w: L.flag.w, h: L.flag.h } : null,
        flagTrigger: L.flagTrigger ? { ...L.flagTrigger } : null,
        bossFightStarted: L.bossFightStarted,
        bossDefeated: L.bossDefeated,
        movers: L.platforms.filter((p) => p.move).map((p) => ({ x: r1(p.x), y: r1(p.y) }))
      };

      // 每 1 秒补一份全量位图，避免长时间只发增量导致状态无法自愈
      const keyframe = full || (Game.tick % 60 === 0);
      if (keyframe || cur.coinsC !== prev.coinsC) snap.coinsC = cur.coinsC;
      if (keyframe || cur.gemsC !== prev.gemsC) snap.gemsC = cur.gemsC;
      if (keyframe || cur.heartsC !== prev.heartsC) snap.heartsC = cur.heartsC;
      if (keyframe || cur.fruitsC !== prev.fruitsC) snap.fruitsC = cur.fruitsC;
      if (keyframe || cur.hintsSeen !== prev.hintsSeen) snap.hintsSeen = cur.hintsSeen;

      if (this.events.length) {
        snap.ev = this.events;
        this.events = [];
      }
      this.hostBits = cur;
      return snap;
    },

    applySnapshot(s) {
      if (!s || !Array.isArray(s.players)) return;
      const now = performance.now();
      // 解码紧凑数组（兼容旧的对象格式）
      const decP = (d) => Array.isArray(d) ? {
        x: d[0], y: d[1], vx: d[2], vy: d[3], w: d[4], h: d[5],
        onGround: !!(d[6] & 1), facing: (d[6] & 2) ? 1 : -1, big: !!(d[6] & 4),
        hearts: d[7], shield: d[8], invuln: d[9], dashTime: d[10],
        dashDir: d[11], flash: d[12], jumpsLeft: d[13], visualId: d[14]
      } : d;
      const decE = (d) => Array.isArray(d) ? {
        x: d[0], y: d[1], dir: d[2], anim: d[3],
        alive: !!(d[4] & 1), charging: !!(d[4] & 2), elite: !!(d[4] & 4),
        deadTimer: d[5], type: NET_ENEMY_TYPES[d[6]] || 'walker',
        hp: d[7], hurtTimer: d[8]
      } : d;
      const decT = (d) => Array.isArray(d) ? {
        x: d[0], y: d[1], active: !!(d[2] & 1), warn: !!(d[2] & 2),
        armed: !!(d[2] & 4), snap: d[3], cool: d[4], dir: d[5], timer: d[6]
      } : d;
      const decProj = (d) => Array.isArray(d) ? {
        x: d[0], y: d[1], w: d[2], h: d[3], vx: d[4], vy: d[5],
        kind: NET_PROJ_KINDS[d[6]] || 'fire',
        life: d[7] > 0 ? d[7] : undefined
      } : d;
      const psnap = s.players.map(decP);
      this.lastSnapAt = now;
      const partySize = Math.max(1, Math.min(4, psnap.length));
      // 换关 / 人数变化：先在本地重建同样的关卡，再由快照覆盖动态状态
      if (Game.level !== s.level || players.length !== partySize) {
        Game.prepareGuestLevel(s.level, partySize);
        this.bits = {};
        this.snapPrev = null;
        this.snapCurr = null;
        this.predReady = false;
        const local = players[this.myId];
        if (local) local.input = null;
      }
      // 估算快照间隔，用于远端插值
      if (this.lastSnapTime) {
        const dt = now - this.lastSnapTime;
        if (dt >= 10 && dt <= 120) {
          this.snapSpan = this.snapSpan * 0.6 + dt * 0.4;
        }
      }
      this.lastSnapTime = now;
      this.snapPrev = this.snapCurr;
      this.snapCurr = psnap;
      this.snapAt = now;

      Game.multiplayer = true;
      Game.endless = false;
      Game.levelItem = null;
      Game.tick = s.tick;
      Game.state = s.state;
      Game.coins = s.coins;
      Game.totalCoins = s.totalCoins;
      Game.levelTime = s.levelTime;
      Game.lives = s.lives;
      Game.maxLives = s.maxLives;
      Game.shake = s.shake;
      Game.introTimer = s.introTimer;
      Game.deadFade = s.deadFade;
      Game.winFade = s.winFade;
      Game.dyingTimer = s.dyingTimer;
      Game.bossCarry = s.bossCarry;

      const localId = this.myId;
      for (let i = 0; i < partySize; i++) {
        const p = players[i], d = psnap[i];
        if (i === localId) {
          // 自己的角色：小误差平滑校正，大误差 / 传送 / 非游戏中直接对齐
          const force = s.state !== 'playing' || !this.predReady ||
            d.hearts <= 0 ||
            Math.abs(d.x - p.x) > 72 || Math.abs(d.y - p.y) > 96 ||
            (d.invuln >= 60 && p.invuln < 24) ||
            !!d.big !== !!p.big;
          if (force) {
            p.x = d.x; p.y = d.y; p.vx = d.vx; p.vy = d.vy;
            p.onGround = !!d.onGround;
            p.dashTime = d.dashTime; p.dashDir = d.dashDir;
            p.jumpsLeft = d.jumpsLeft;
            p.facing = d.facing;
          } else {
            p.x += (d.x - p.x) * 0.4;
            p.y += (d.y - p.y) * 0.32;
            p.onGround = !!d.onGround;
            if (Math.abs(d.vx - p.vx) > 4.5) p.vx = d.vx;
            if (Math.abs(d.vy - p.vy) > 7) p.vy = d.vy;
          }
          p.w = d.w; p.h = d.h; p.big = !!d.big;
          p.hearts = d.hearts; p.shield = d.shield;
          p.invuln = Math.max(p.invuln, d.invuln);
          p.flash = Math.max(p.flash, d.flash);
          p.visualId = d.visualId;
          if (s.up) {
            p.netMaxJumps = s.up.mj;
            p.netDashCd = s.up.dc;
            p.netRunMul = s.up.rm;
          }
        } else {
          // 队友：位置交给 interpolateRemote，这里同步其余状态
          p.vx = d.vx; p.vy = d.vy;
          p.w = d.w; p.h = d.h; p.onGround = !!d.onGround;
          p.facing = d.facing; p.big = !!d.big;
          p.hearts = d.hearts; p.shield = d.shield;
          p.invuln = d.invuln; p.dashTime = d.dashTime;
          p.dashDir = d.dashDir; p.flash = d.flash;
          p.jumpsLeft = d.jumpsLeft;
          p.visualId = d.visualId;
          if (!this.snapPrev) { p.x = d.x; p.y = d.y; }
        }
      }
      if (s.state === 'playing') this.predReady = true;
      const mine = players[Math.max(0, Math.min(partySize - 1, this.myId))];
      Game.shield = mine ? mine.shield : 0;

      const L = Level;
      if (s.coinsC !== undefined) this.bits.coinsC = s.coinsC;
      if (s.gemsC !== undefined) this.bits.gemsC = s.gemsC;
      if (s.heartsC !== undefined) this.bits.heartsC = s.heartsC;
      if (s.fruitsC !== undefined) this.bits.fruitsC = s.fruitsC;
      if (s.hintsSeen !== undefined) this.bits.hintsSeen = s.hintsSeen;
      const flags = (arr, bits) => {
        if (bits === undefined) return;
        for (let i = 0; i < arr.length && i < bits.length; i++) {
          const v = bits[i];
          arr[i].collected = v === 1 || v === '1' || v === true;
        }
      };
      flags(L.coins, this.bits.coinsC);
      flags(L.gems, this.bits.gemsC);
      flags(L.hearts, this.bits.heartsC);
      flags(L.fruits, this.bits.fruitsC);
      // 提示只会在“已读”方向变化，位图增量同样适用
      if (this.bits.hintsSeen !== undefined) {
        const hs = this.bits.hintsSeen;
        const n = Math.min(hs.length, L.hints.length);
        for (let i = 0; i < n; i++) {
          L.hints[i].seen = hs[i] === 1 || hs[i] === '1' || hs[i] === true;
        }
      }

      // 敌人：房主二阶段召唤的增援会多出来，按快照补齐 / 截断
      if (Array.isArray(s.enemies)) {
        const es = s.enemies.map(decE);
        while (L.enemies.length < es.length) {
          L.enemies.push({
            x: 0, y: 0, w: ENEMY_SIZE.w, h: ENEMY_SIZE.h, dir: 1,
            speed: 0, baseSpeed: 0, anim: 0, type: 'walker',
            alive: true, deadTimer: 0, charging: false, hp: 1, hurtTimer: 0
          });
        }
        if (L.enemies.length > es.length) L.enemies.length = es.length;
        for (let i = 0; i < es.length; i++) {
          Object.assign(L.enemies[i], es[i]);
        }
      }

      if (s.boss) {
        if (!L.boss) L.boss = { w: BOSS_SIZE.w, h: BOSS_SIZE.h };
        Object.assign(L.boss, s.boss);
      } else L.boss = null;

      if (Array.isArray(s.traps)) {
        const ts = s.traps.map(decT);
        const n = Math.min(ts.length, L.traps.length);
        for (let i = 0; i < n; i++) {
          const t = ts[i], d = L.traps[i];
          d.x = t.x; d.y = t.y;
          d.active = !!t.active; d.warn = !!t.warn;
          d.snap = t.snap; d.cool = t.cool;
          d.armed = !!t.armed;
          d.timer = t.timer;
          if (t.dir) d.dir = t.dir;
        }
      }

      if (Array.isArray(s.proj)) L.projectiles = s.proj.map(decProj);

      // 房主同步来的视听事件（收集 / 受击 / 检查点等）
      if (Array.isArray(s.ev)) this.playNetEvents(s.ev);

      if (s.lava) {
        if (!L.lava) L.lava = { y: s.lava.y, cap: 0, speed: 0 };
        L.lava.y = s.lava.y;
      } else L.lava = null;

      if (Array.isArray(s.gates)) {
        const n = Math.min(s.gates.length, L.gates.length);
        for (let i = 0; i < n; i++) {
          const g = s.gates[i], d = L.gates[i];
          d.opened = !!g.opened; d.openT = g.openT; d.y = g.y;
        }
      }

      if (Array.isArray(s.falls)) {
        const n = Math.min(s.falls.length, L.fallPlats.length);
        for (let i = 0; i < n; i++) {
          const f = s.falls[i], d = L.fallPlats[i];
          d.state = f.state; d.timer = f.timer;
          d.alpha = f.alpha; d.respawn = f.respawn; d.y = f.y;
        }
      }

      if (Array.isArray(s.pads)) {
        const n = Math.min(s.pads.length, L.pads.length);
        for (let i = 0; i < n; i++) {
          L.pads[i].squash = s.pads[i].squash;
          L.pads[i].cool = s.pads[i].cool;
        }
      }

      if (Array.isArray(s.checkpoints)) {
        const n = Math.min(s.checkpoints.length, L.checkpoints.length);
        for (let i = 0; i < n; i++) {
          L.checkpoints[i].activated = !!s.checkpoints[i].activated;
        }
      }
      L.activeCheckpoint = s.activeCheckpoint;
      L.bossFightStarted = !!s.bossFightStarted;
      L.bossDefeated = !!s.bossDefeated;

      // 终点旗帜：Boss 击破后房主动态生成，客人同步
      L.flag = s.flag ? { x: s.flag.x, y: s.flag.y, w: s.flag.w, h: s.flag.h } : null;
      L.flagTrigger = s.flagTrigger ? { ...s.flagTrigger } : null;

      if (Array.isArray(s.movers)) {
        let k = 0;
        for (const p of L.platforms) {
          if (!p.move || k >= s.movers.length) continue;
          const m = s.movers[k++];
          p.dx = m.x - p.x;
          p.dy = m.y - p.y;
          p.x = m.x;
          p.y = m.y;
        }
      }

      Camera.update();
    },

    // ---- 大厅渲染（DOM） ----
    render() {
      if (!this.ui) return;
      const u = this.ui;
      const inRoom = !!this.code;
      u.setup.hidden = inRoom;
      u.room.hidden = !inRoom;
      u.close.hidden = inRoom;

      const canConnect = this.ws && this.ws.readyState === 1;
      u.create.disabled = !canConnect;
      u.join.disabled = !canConnect;

      if (!inRoom) {
        u.hint.textContent = '局域网：与房主同一 WiFi，浏览器打开 http://房主IP:8787 即可。' +
          '外网：房主用 cloudflared / ngrok 把本地 8787 暴露成 https 地址后分享，房间码不变。';
        return;
      }

      u.codeShow.textContent = this.code;
      u.list.innerHTML = '';
      this.members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'mp-member' + ((m.ready || i === this.hostId) ? ' ready' : '');
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = (m.name || ('玩家' + (i + 1))); 
        const tag = document.createElement('span');
        tag.className = 'tag';
        let tagText;
        if (m.online === false) tagText = '掉线重连中';
        else {
          tagText = i === this.hostId ? '房主' : (m.ready ? '已准备' : '未准备');
          const ms = this.lag[i];
          const jit = this.jitter[i];
          if (i > 0 && Number.isFinite(ms)) {
            tagText += ' · ' + ms + 'ms';
            if (Number.isFinite(jit) && jit >= 10) tagText += ' ±' + jit;
          }
        }
        tag.textContent = tagText;
        row.appendChild(name);
        row.appendChild(tag);
        if (this.role === 'host' && i !== this.hostId && !this.started) {
          const kick = document.createElement('button');
          kick.className = 'mp-kick';
          kick.textContent = '移出';
          kick.onclick = () => this.kickMember(i);
          row.appendChild(kick);
        }
        u.list.appendChild(row);
      });

      if (this.role === 'host') {
        u.ready.hidden = true;
        u.start.hidden = false;
        const waiting = this.members.some((m, i) => i !== this.hostId && !m.ready);
        u.start.disabled = this.members.length < 2 || waiting;
      } else {
        u.ready.hidden = false;
        u.start.hidden = true;
        const me = this.members[this.myId];
        u.ready.textContent = (me && me.ready) ? '取消准备' : '准备';
      }

      u.hint.textContent = this.role === 'host'
        ? '把房间码告诉朋友；全部准备后点击“开始游戏”。最多 4 人。'
        : '等待房主开始游戏。准备后房主才能开始。';
    }
  };

  // ============================================================

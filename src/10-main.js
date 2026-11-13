  // 11. 启动：固定时间步长 + requestAnimationFrame
  // ============================================================
  Game.init();
  Net.init();

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    let delta = now - lastTime;
    lastTime = now;
    if (delta > 200) delta = 200;
    accumulator += delta;

    let steps = 0;
    while (accumulator >= STEP_MS && steps < MAX_STEPS) {
      // 联机客人不跑本地模拟，只上报输入并应用房主快照
      if (Net.role === 'guest' && Net.inGame) Net.guestTick();
      else Game.update();
      accumulator -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;

    Renderer.draw();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // 联机调试入口（供自动化测试 / 排查同步问题）
  window.__mpDebug = {
    Net, Game, players, Level, Camera, Input, Storage, SKINS,
    LEVELS, UI, UPGRADES, Renderer,
    openLobby: () => Net.openLobby()
  };

  // 只读调试快照：方便自动化验证
  window.__gameSnapshot = () => ({
    state: Game.state,
    lives: Game.lives,
    level: Game.level,
    levelName: Level.data ? Level.data.name : null,
    levelCount: LEVEL_COUNT,
    coins: Game.coins,
    totalCoins: Game.totalCoins,
    levelTime: Game.levelTime,
    runTime: Game.runTime,
    sfxOn: Storage.data.sfxOn,
    musicOn: Storage.data.musicOn,
    bestCoins: Storage.data.bestCoins,
    unlocked: Storage.data.unlocked,
    cleared: Storage.data.cleared,
    levelBests: Storage.data.levelBests.map((b) => ({ ...b })),
    gems: Storage.data.gems.slice(),
    gemsCount: Storage.gemsCount(),
    skin: Storage.data.skin,
    difficulty: Storage.data.difficulty,
    lowQuality: Storage.data.lowQuality,
    maxLives: Game.maxLives,
    touchMode: Input.touchMode,
    shake: Game.shake,
    deadFade: Game.deadFade,
    confetti: Game.confetti.length,
    particles: Particles.list.length,
    deathMark: Game.deathMark ? { x: Game.deathMark.x, y: Game.deathMark.y, timer: Game.deathMark.timer } : null,
    rings: Level.rings.length,
    hints: Level.hints.map((h) => ({ x: h.x, seen: h.seen })),
    hearts: Level.hearts.map((h) => ({ x: h.x, y: h.y, collected: h.collected })),
    heartCap: Game.heartCap(),
    fruits: Level.fruits.map((f) => ({ x: f.x, y: f.y, collected: f.collected })),
    big: player.big,
    traps: Level.traps.map((t) => ({ kind: t.kind, x: t.x, active: !!t.active, warn: !!t.warn })),
    projectiles: Level.projectiles.length,
    lava: Level.lava ? { y: Level.lava.y } : null,
    gates: Level.gates.map((g) => ({ x: g.x, opened: g.opened, openT: g.openT })),
    medals: Storage.medalCount(),
    levelMedals: Storage.data.levelBests.map((b) => b.medals),
    bankCoins: Storage.data.bankCoins,
    coward: Storage.coward(),
    startLives: Storage.startLives(),
    invulnFrames: Storage.invulnFrames(),
    upgrades: { ...Storage.data.upgrades },
    endless: Game.endless,
    endlessRoom: Game.endlessRoom,
    endlessBest: Storage.data.endlessBest,
    levelItem: Game.levelItem,
    itemCards: 4,
    shield: Game.shield,
    slowFactor: Game.slowFactor,
    maxJumps: player.maxJumps(),
    dashCdMax: player.dashCdFrames(),
    themeIndex: Game.themeIndex,
    levelGems: Level.gems.map((g) => ({ x: g.x, y: g.y, collected: g.collected })),
    player: {
      x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      onGround: player.onGround, jumpsLeft: player.jumpsLeft,
      dashTime: player.dashTime, dashCd: player.dashCd,
      dashInertia: player.dashInertia, landStun: player.landStun,
      dropTimer: player.dropTimer, flash: player.flash
    },
    checkpoints: Level.checkpoints.map((c) => ({ x: c.x, y: c.y, activated: c.activated })),
    activeCheckpoint: Level.activeCheckpoint,
    coinsAtCheckpoint: Level.snapshot ? Level.snapshot.coins : 0,
    bossFightStarted: Level.bossFightStarted,
    fallPlats: Level.fallPlats.map((f) => ({
      x: f.x, state: f.state, timer: f.timer, alpha: f.alpha
    })),
    platforms: Level.platforms.length,
    pads: Level.pads.length,
    enemies: Level.enemies.map((e) => ({ x: e.x, y: e.y, alive: e.alive, type: e.type })),
    boss: Level.boss ? {
      x: Level.boss.x, hp: Level.boss.hp, maxHp: Level.boss.maxHp,
      phase: Level.boss.phase, alive: Level.boss.alive
    } : null,
    flag: Level.flag ? { x: Level.flag.x } : null,
    multiplayer: Game.multiplayer,
    players: players.map((p) => ({
      id: p.id, x: p.x, y: p.y, hearts: p.hearts,
      big: p.big, invuln: p.invuln, dashTime: p.dashTime
    })),
    net: {
      role: Net.role, code: Net.code, myId: Net.myId,
      hostId: Net.hostId, inGame: Net.inGame, started: Net.started,
      lag: { ...Net.lag },
      members: Net.members.map((m) => ({ id: m.id, name: m.name, ready: !!m.ready }))
    }
  });
})();

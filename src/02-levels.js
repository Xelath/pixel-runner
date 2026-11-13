  // 2. 关卡数据：16 关本体 + 16 关第二篇章（全部数据化配置，便于手动调整坐标）
  //    - 单关长度约为旧版 2~2.5 倍，含高低路线与隐藏金币区
  //    - platforms: 静态地面/浮台，move 为移动平台配置
  //    - oneWay: 单向平台（只能从下方跳上，站在上面 S+跳跃 下穿）
  //    - fallPlats: 下坠平台（踩上 1 秒后消失）
  //    - pads: 弹跳板（踩上弹起，用于到达隐藏区）
  //    - checkpoints: 检查点旗帜（死亡后从此处重生）
  // ============================================================
  const PH = PLAYER_SIZE.h;

  // 关卡构造工具：让长关卡布局更易读、更好改
  const ground = (x, w, y) =>
    ({ x, y: y === undefined ? GROUND_Y : y, w, h: 70, kind: 'ground' });
  const ledge = (x, y, w) => ({ x, y, w, h: 16, kind: 'ledge' });
  // 移动平台：axis 'x'|'y'，range 振幅，speed 角速度，phase 相位
  const mover = (x, y, w, axis, range, speed, phase) =>
    ({ x, y, w, h: 16, kind: 'ledge', move: { axis, range, speed, phase: phase || 0 } });
  // 单向平台
  const oneWay = (x, y, w) => ({ x, y, w, h: 14, kind: 'ledge', oneWay: true });
  // 金币简写
  const coin = (x, y) => ({ x, y });

  const LEVELS = [
    // ---------------------------------------------------------
    // 第 1 关 · 绿野启程（纯教学，2 检查点）
    // ---------------------------------------------------------
    {
      name: '第 1 关 · 绿野启程',
      tip: '长按空格可以跳得更高，空中再按一次空格触发二段跳',
      width: 5800,
      repeatOffset: 2900,               // 前半段宽度：后半段自动复制，总长度翻倍
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 340),
        ground(440, 300),
        ledge(500, 405, 90),
        oneWay(650, 350, 100),
        ground(980, 320),
        mover(1040, 400, 90, 'y', 45, 0.028, 0),
        ledge(1210, 345, 90),
        ground(1400, 300),
        ledge(1450, 400, 100),
        ledge(1580, 335, 100),
        ground(1800, 380),
        mover(1850, 400, 90, 'x', 80, 0.03, 0),
        ledge(2050, 340, 100),
        ground(2300, 320),
        ledge(2350, 400, 100),
        ledge(2500, 320, 100),
        ground(2720, 180)
      ],
      enemies: [
        { platform: 1, x: 560, dir: 1, speed: 0.9 },
        { platform: 4, x: 1150, dir: -1, speed: 1.0 },
        { platform: 7, x: 1500, dir: 1, speed: 1.0 },
        { platform: 10, x: 1950, dir: 1, speed: 1.0 },
        { platform: 13, x: 2400, dir: -1, speed: 0.95 }
      ],
      coins: [
        coin(130, 420), coin(170, 420), coin(210, 420),
        // 上路（浮台 + 单向平台）
        coin(520, 360), coin(560, 360), coin(600, 360),
        coin(680, 305), coin(720, 305),
        coin(1000, 420), coin(1040, 420),
        // 升降平台隐藏区
        coin(1060, 300), coin(1100, 300),
        coin(1230, 300), coin(1270, 300),
        coin(1470, 355), coin(1510, 355),
        coin(1600, 290), coin(1640, 290),
        coin(1830, 420), coin(1870, 420),
        coin(2070, 295), coin(2110, 295),
        coin(2370, 355), coin(2410, 355),
        coin(2520, 275), coin(2560, 275),
        coin(2760, 420), coin(2800, 420)
      ],
      spikes: [
        { x: 600, y: 458, w: 32, h: 12 },
        { x: 1250, y: 458, w: 32, h: 12 },
        { x: 1900, y: 458, w: 32, h: 12 },
        { x: 2450, y: 458, w: 32, h: 12 }
      ],
      checkpoints: [
        { x: 1120, y: GROUND_Y },
        { x: 2000, y: GROUND_Y }
      ],
      flag: { x: 5760, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 5736, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 2 关 · 尖刺小径（陷阱 + 移动平台，上下双路线）
    // ---------------------------------------------------------
    {
      name: '第 2 关 · 尖刺小径',
      tip: '尖刺一碰就掉血，上路偏跳跃、下路偏陷阱，两条路线都能抵达终点',
      width: 7280,
      repeatOffset: 3640,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 300),
        ground(420, 280),
        mover(760, 430, 100, 'x', 100, 0.025, 0),
        ground(980, 300),
        ledge(1060, 380, 90),
        ledge(1200, 330, 90),
        ground(1400, 340),
        oneWay(1580, 390, 110),
        mover(1880, 430, 100, 'x', 130, 0.028, 1.0),
        ground(2140, 260),
        ledge(2220, 380, 90),
        mover(2560, 380, 100, 'y', 55, 0.03, 0.5),
        ground(2520, 320),
        ledge(2850, 380, 80),
        mover(2960, 430, 100, 'y', 60, 0.03, 2.0),
        ground(3140, 260),
        ledge(3240, 360, 100),
        ground(3500, 140),
        ledge(2600, 300, 80)
      ],
      enemies: [
        { platform: 1, x: 600, dir: 1, speed: 1.0 },
        { platform: 3, x: 1120, dir: -1, speed: 1.05 },
        { platform: 6, x: 1620, dir: 1, speed: 1.0 },
        { platform: 9, x: 2220, dir: 1, speed: 1.1 },
        { platform: 12, x: 2760, dir: -1, speed: 1.1 },
        { platform: 15, x: 3300, dir: 1, speed: 1.15 }
      ],
      coins: [
        coin(130, 420), coin(170, 420), coin(210, 420),
        coin(480, 420), coin(520, 420),
        coin(780, 390), coin(820, 390),
        coin(1000, 420), coin(1040, 420),
        // 上路分支（浮台更高、金币更密）
        coin(1080, 340), coin(1120, 340),
        coin(1220, 290), coin(1260, 290),
        coin(1600, 350), coin(1640, 350),
        coin(1960, 390), coin(2000, 390),
        coin(2160, 420), coin(2200, 420),
        coin(2240, 340), coin(2280, 340),
        // 升降平台隐藏区
        coin(2620, 260), coin(2660, 260),
        coin(2580, 420), coin(2620, 420),
        coin(2870, 340), coin(2910, 340),
        coin(3060, 390), coin(3100, 390),
        coin(3260, 320), coin(3300, 320),
        coin(3560, 420), coin(3600, 420)
      ],
      spikes: [
        { x: 470, y: 458, w: 40, h: 12 },
        { x: 1020, y: 458, w: 48, h: 12 },
        { x: 1650, y: 458, w: 40, h: 12 },
        { x: 2190, y: 458, w: 48, h: 12 },
        { x: 2620, y: 458, w: 40, h: 12 },
        { x: 3260, y: 458, w: 48, h: 12 }
      ],
      checkpoints: [
        { x: 1500, y: GROUND_Y },
        { x: 2700, y: GROUND_Y }
      ],
      flag: { x: 7240, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7216, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 3 关 · 崩塌回廊（下坠平台 + 弹跳板，3 检查点）
    // ---------------------------------------------------------
    {
      name: '第 3 关 · 崩塌回廊',
      tip: '下坠平台踩上 1 秒就会崩塌，弹跳板可通往隐藏金币区',
      width: 7680,
      repeatOffset: 3840,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 320),
        ground(420, 300),
        mover(930, 420, 100, 'y', 50, 0.03, 0.5),
        ground(1180, 300),
        ledge(1240, 340, 100),
        ledge(1460, 320, 80),
        ledge(1510, 252, 80),
        ground(1580, 320),
        mover(2020, 430, 100, 'x', 110, 0.025, 0),
        ground(2260, 340),
        ledge(2400, 380, 90),
        ground(2980, 320),
        ledge(3300, 290, 100),
        ledge(3350, 220, 80),
        ground(3420, 200),
        ledge(3500, 360, 100),
        ground(3700, 140)
      ],
      fallPlats: [
        { x: 760, y: 430, w: 90 },
        { x: 1040, y: 430, w: 90 },
        { x: 2660, y: 420, w: 90 },
        { x: 2800, y: 390, w: 90 }
      ],
      pads: [
        { x: 1390, y: GROUND_Y, w: 52 },
        { x: 3240, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 1, x: 600, dir: 1, speed: 1.2 },
        { platform: 3, x: 1300, dir: -1, speed: 1.2 },
        { platform: 7, x: 1800, dir: 1, speed: 1.7 },
        { platform: 9, x: 2350, dir: -1, speed: 1.7 },
        { platform: 11, x: 3100, dir: 1, speed: 1.6 },
        { platform: 14, x: 3560, dir: 1, speed: 1.5 }
      ],
      coins: [
        coin(150, 420), coin(190, 420), coin(230, 420),
        coin(450, 420), coin(490, 420),
        coin(820, 390), coin(860, 390),
        coin(1060, 390), coin(1100, 390),
        coin(1200, 420), coin(1240, 420),
        coin(1260, 300), coin(1300, 300),
        // 弹跳板隐藏区
        coin(1480, 280), coin(1520, 280),
        coin(1530, 215), coin(1570, 215),
        coin(1600, 420), coin(1640, 420),
        coin(2040, 390), coin(2080, 390),
        coin(2280, 420), coin(2320, 420),
        coin(2420, 340), coin(2460, 340),
        // 下坠平台路线
        coin(2680, 380), coin(2820, 350),
        coin(3000, 420), coin(3040, 420),
        // 弹跳板隐藏区（后段）
        coin(3320, 245), coin(3360, 245),
        coin(3380, 178), coin(3420, 178),
        coin(3450, 420), coin(3490, 420),
        coin(3740, 420), coin(3780, 420)
      ],
      spikes: [
        { x: 260, y: 458, w: 40, h: 12 },
        { x: 1700, y: 458, w: 40, h: 12 },
        { x: 2500, y: 458, w: 48, h: 12 },
        { x: 3450, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1250, y: GROUND_Y },
        { x: 2320, y: GROUND_Y },
        { x: 3080, y: GROUND_Y }
      ],
      flag: { x: 7640, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7616, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 4 关 · 浮空峭壁（垂直攀爬 + 单向平台 + 多向移动平台）
    // ---------------------------------------------------------
    {
      name: '第 4 关 · 浮空峭壁',
      tip: '垂直攀爬段：单向平台可从下方穿过，站在上面按 S + 跳跃可向下穿落',
      width: 6960,
      repeatOffset: 3480,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 260),
        ledge(300, 405, 90),
        mover(430, 360, 90, 'y', 55, 0.03, 0.5),
        ledge(560, 300, 90),
        oneWay(700, 360, 90),
        ledge(860, 300, 110),
        ledge(1000, 360, 90),
        ledge(1120, 420, 100),
        ground(1240, 300),
        mover(1580, 400, 90, 'y', 70, 0.03, 0),
        oneWay(1720, 330, 110),
        oneWay(1880, 260, 110),
        ground(2060, 300),
        mover(2400, 400, 90, 'y', 90, 0.03, 0.8),
        oneWay(2580, 340, 110),
        mover(2760, 420, 90, 'y', 80, 0.032, 2.4),
        ledge(2900, 340, 110),
        ground(3020, 260),
        ledge(1360, 300, 80),
        ground(3360, 120)
      ],
      pads: [
        { x: 1300, y: GROUND_Y, w: 52 }    // 隐藏区：弹跳板弹上高台
      ],
      enemies: [
        { platform: 1, x: 330, dir: 1, speed: 0.8 },
        { platform: 5, x: 900, dir: 1, speed: 1.1 },
        { platform: 8, x: 1350, dir: -1, speed: 1.1 },
        { platform: 12, x: 2150, dir: 1, speed: 1.2 },
        { platform: 17, x: 3200, dir: -1, speed: 1.5 },
        { platform: 19, x: 3400, dir: 1, speed: 1.4 }
      ],
      coins: [
        coin(60, 420), coin(100, 420), coin(140, 420),
        coin(320, 365), coin(360, 365),
        coin(450, 290), coin(490, 290),
        coin(600, 260), coin(640, 260),
        coin(720, 320), coin(760, 320),
        // 垂直攀爬主线（金币密集）
        coin(880, 260), coin(920, 260),
        coin(1020, 320), coin(1060, 320),
        coin(1140, 380), coin(1180, 380),
        coin(1270, 420), coin(1310, 420),
        // 弹跳/冲刺隐藏区
        coin(1380, 260), coin(1420, 260),
        coin(1600, 360), coin(1640, 360),
        coin(1740, 290), coin(1780, 290),
        coin(1900, 220), coin(1940, 220),
        coin(2080, 420), coin(2120, 420),
        coin(2420, 360), coin(2460, 360),
        coin(2600, 300), coin(2640, 300),
        coin(2780, 380), coin(2820, 380),
        coin(2920, 300), coin(2960, 300),
        coin(3040, 420), coin(3080, 420),
        coin(3380, 420), coin(3420, 420)
      ],
      spikes: [
        { x: 150, y: 458, w: 32, h: 12 },
        { x: 1500, y: 458, w: 32, h: 12 },
        { x: 2200, y: 458, w: 40, h: 12 },
        { x: 3150, y: 458, w: 32, h: 12 }
      ],
      checkpoints: [
        { x: 880, y: 300 },
        { x: 2150, y: GROUND_Y },
        { x: 3080, y: GROUND_Y }
      ],
      flag: { x: 6920, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 6896, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 5 关 · 绝境试炼（全机制综合，3 检查点 + 大量隐藏金币）
    // ---------------------------------------------------------
    {
      name: '第 5 关 · 绝境试炼',
      tip: '所有机关同时登场：上路靠跳跃与单向平台，下路遍布陷阱与巡逻敌人',
      width: 8840,
      repeatOffset: 4420,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 300),
        mover(400, 430, 100, 'x', 140, 0.024, 0),
        ledge(720, 380, 90),
        oneWay(860, 330, 90),
        ledge(990, 380, 90),
        ground(660, 280),
        ground(1060, 320),
        ground(1880, 300),
        ledge(2020, 380, 110),
        mover(2300, 420, 100, 'x', 120, 0.026, 1.0),
        ground(2560, 300),
        ledge(2660, 380, 100),
        oneWay(2980, 400, 110),
        oneWay(3120, 340, 110),
        mover(3260, 400, 100, 'y', 60, 0.03, 2.0),
        ground(3380, 340),
        ledge(3690, 300, 90),
        ledge(3790, 250, 80),
        ground(4280, 140),
        mover(1760, 430, 100, 'y', 45, 0.03, 1.2)
      ],
      fallPlats: [
        { x: 1450, y: 420, w: 90 },
        { x: 1600, y: 390, w: 90 },
        { x: 3900, y: 420, w: 90 },
        { x: 4040, y: 390, w: 90 }
      ],
      pads: [
        { x: 1230, y: GROUND_Y, w: 52 },
        { x: 3620, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 6, x: 1300, dir: -1, speed: 1.3 },
        { platform: 7, x: 2100, dir: 1, speed: 1.6 },
        { platform: 10, x: 2800, dir: 1, speed: 1.7 },
        { platform: 15, x: 3520, dir: 1, speed: 1.5 },
        { platform: 15, x: 3600, dir: -1, speed: 1.5 },
        { platform: 16, x: 3700, dir: 1, speed: 1.2 }
      ],
      coins: [
        coin(60, 420), coin(100, 420), coin(140, 420),
        coin(420, 390), coin(460, 390),
        coin(740, 340), coin(780, 340),
        coin(880, 290), coin(920, 290),
        coin(1010, 340), coin(1050, 340),
        coin(1090, 420), coin(1130, 420),
        // 弹跳板隐藏区（前段）
        coin(1250, 250), coin(1290, 250),
        coin(1310, 195), coin(1350, 195),
        coin(1460, 380), coin(1500, 380),
        coin(1620, 340), coin(1660, 340),
        coin(1910, 420), coin(1950, 420),
        coin(2040, 340), coin(2080, 340),
        coin(2320, 380), coin(2360, 380),
        coin(2580, 420), coin(2620, 420),
        coin(2680, 340), coin(2720, 340),
        // 单向平台路线
        coin(3000, 360), coin(3040, 360),
        coin(3140, 300), coin(3180, 300),
        coin(3280, 360), coin(3320, 360),
        coin(3400, 420), coin(3440, 420),
        // 弹跳板隐藏区（后段）
        coin(3710, 245), coin(3750, 245),
        coin(3810, 205), coin(3850, 205),
        // 下坠平台路线
        coin(3950, 380), coin(4080, 350),
        coin(4300, 420), coin(4340, 420)
      ],
      spikes: [
        { x: 200, y: 458, w: 40, h: 12 },
        { x: 1120, y: 458, w: 48, h: 12 },
        { x: 1950, y: 458, w: 40, h: 12 },
        { x: 2620, y: 458, w: 48, h: 12 },
        { x: 3420, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1160, y: GROUND_Y },
        { x: 2050, y: GROUND_Y },
        { x: 3480, y: GROUND_Y }
      ],
      flag: { x: 8800, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 8776, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 6 关 · 终焉对决（前半跑酷 + 后半强化 Boss 战）
    // ---------------------------------------------------------
    {
      name: '第 6 关 · 终焉对决',
      tip: '跑酷段之后是岩角领主：冲撞与落石交替，半血后狂暴召唤小怪',
      width: 5560,
      repeatOffset: 2780,
      noMirror: true,                   // Boss 房必须保持在关卡末尾
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 280),
        ground(560, 260),
        mover(360, 430, 100, 'x', 100, 0.024, 0),
        ground(1220, 300),
        ground(1620, 300),
        ground(2020, 760),           // Boss 战斗区
        ledge(640, 380, 90),
        ledge(1460, 290, 100),
        ledge(2100, 380, 100),
        ledge(2400, 330, 90),
        ledge(2620, 380, 100)
      ],
      fallPlats: [
        { x: 960, y: 420, w: 90 },
        { x: 1090, y: 390, w: 90 }
      ],
      pads: [
        { x: 1430, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 1, x: 760, dir: 1, speed: 1.2 },
        { platform: 3, x: 1400, dir: -1, speed: 1.5 },
        { platform: 4, x: 1850, dir: 1, speed: 1.5 },
        { platform: 4, x: 1700, dir: -1, speed: 1.4 }
      ],
      coins: [
        coin(60, 420), coin(100, 420), coin(140, 420),
        coin(380, 380), coin(420, 380),
        coin(660, 330), coin(700, 330),
        coin(980, 360), coin(1110, 340),
        coin(1250, 420), coin(1290, 420),
        // 弹跳板隐藏区
        coin(1480, 240), coin(1520, 240),
        coin(1660, 420), coin(1700, 420),
        coin(2120, 330), coin(2160, 330),
        coin(2420, 280), coin(2460, 280),
        coin(2640, 330), coin(2680, 330)
      ],
      spikes: [
        { x: 220, y: 458, w: 40, h: 12 },
        { x: 600, y: 458, w: 40, h: 12 },
        { x: 1780, y: 458, w: 48, h: 12 }
      ],
      checkpoints: [
        { x: 1320, y: GROUND_Y },
        { x: 1700, y: GROUND_Y }
      ],
      // Boss 房入口：进入 Boss 战后死亡统一从此处重生（Boss 血量回满）
      bossArena: { x: 2060, y: GROUND_Y - PH },
      boss: { platform: 5, x: 2450, dir: -1, speed: 1.5, hp: 5 },
      flag: null,            // Boss 击败后动态生成
      flagTrigger: null
    },

    // ---------------------------------------------------------
    // 第 7 关 · 熔岩地窟（尖刺熔岩 + 升降平台 + 单向平台）
    // ---------------------------------------------------------
    {
      name: '第 7 关 · 熔岩地窟',
      tip: '地窟中熔岩尖刺密布，善用升降平台与单向平台跨越',
      width: 6400,
      repeatOffset: 3200,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 280),
        ground(420, 240),
        ledge(320, 400, 80),
        mover(700, 420, 100, 'x', 120, 0.026, 0),
        ground(980, 260),
        ground(1320, 240),
        mover(1600, 410, 100, 'y', 62, 0.03, 0.5),
        ground(1840, 260),
        oneWay(2080, 360, 110),
        ground(2260, 280),
        mover(2620, 420, 100, 'x', 120, 0.028, 1.0),
        ground(2960, 240),
        ledge(1240, 360, 70),
        ledge(1500, 320, 90),
        ledge(2400, 360, 90)
      ],
      fallPlats: [
        { x: 2820, y: 420, w: 90 }
      ],
      pads: [
        { x: 1400, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 1, x: 580, dir: 1, speed: 1.3 },
        { platform: 4, x: 1160, dir: -1, speed: 1.4 },
        { platform: 5, x: 1450, dir: 1, speed: 1.5 },
        { platform: 7, x: 1900, dir: 1, speed: 1.6 },
        { platform: 9, x: 2350, dir: -1, speed: 1.7 },
        { platform: 11, x: 3020, dir: 1, speed: 1.5 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(340, 360), coin(380, 360),
        coin(460, 420), coin(500, 420),
        coin(720, 380), coin(760, 380),
        coin(1000, 420), coin(1040, 420),
        coin(1250, 300), coin(1290, 300),
        coin(1340, 420), coin(1380, 420),
        // 弹跳板隐藏区
        coin(1480, 275), coin(1520, 275),
        coin(1620, 370), coin(1660, 370),
        coin(1860, 420), coin(1900, 420),
        coin(2100, 320), coin(2140, 320),
        coin(2280, 420), coin(2320, 420),
        coin(2420, 290), coin(2460, 290),
        coin(2640, 380), coin(2680, 380),
        coin(2840, 380),
        coin(2980, 420), coin(3020, 420), coin(3060, 420)
      ],
      spikes: [
        { x: 500, y: 458, w: 40, h: 12 },
        { x: 1500, y: 458, w: 40, h: 12 },
        { x: 2320, y: 458, w: 40, h: 12 },
        { x: 3050, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1080, y: GROUND_Y },
        { x: 1950, y: GROUND_Y },
        { x: 2400, y: GROUND_Y }
      ],
      flag: { x: 6360, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 6336, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 8 关 · 天空回廊（浮空云台 + 单向平台 + 长距跳跃）
    // ---------------------------------------------------------
    {
      name: '第 8 关 · 天空回廊',
      tip: '脚下是万丈高空，单向云台与升降平台是唯一落脚点',
      width: 7600,
      repeatOffset: 3800,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 220),
        ledge(300, 400, 90),
        oneWay(430, 340, 100),
        ledge(590, 280, 90),
        mover(740, 360, 100, 'y', 70, 0.03, 0),
        ledge(900, 300, 100),
        oneWay(1080, 380, 110),
        mover(1260, 420, 100, 'x', 130, 0.026, 1.0),
        ground(1540, 220),
        ledge(1800, 360, 100),
        oneWay(1960, 300, 110),
        mover(2140, 380, 100, 'y', 80, 0.03, 0.8),
        ground(2380, 240),
        ledge(2700, 380, 100),
        oneWay(2860, 320, 110),
        mover(3080, 400, 100, 'x', 100, 0.028, 2.0),
        ground(3360, 200),
        ground(3660, 140),
        ledge(1640, 300, 80)
      ],
      fallPlats: [
        { x: 1440, y: 430, w: 90 },
        { x: 3270, y: 420, w: 90 }
      ],
      pads: [
        { x: 1580, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 0, x: 120, dir: 1, speed: 1.2 },
        { platform: 8, x: 1620, dir: 1, speed: 1.4 },
        { platform: 8, x: 1720, dir: -1, speed: 1.3 },
        { platform: 12, x: 2560, dir: 1, speed: 1.6 },
        { platform: 16, x: 3400, dir: -1, speed: 1.5 },
        { platform: 17, x: 3680, dir: 1, speed: 1.4 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(320, 360), coin(360, 360),
        coin(450, 300), coin(490, 300),
        coin(610, 240), coin(650, 240),
        coin(760, 320), coin(800, 320),
        coin(920, 260), coin(960, 260),
        coin(1100, 340), coin(1140, 340),
        coin(1280, 380), coin(1320, 380),
        coin(1460, 390),
        coin(1560, 420), coin(1600, 420),
        // 弹跳板隐藏区
        coin(1660, 260), coin(1700, 260),
        coin(1820, 320), coin(1860, 320),
        coin(1980, 260), coin(2020, 260),
        coin(2160, 340), coin(2200, 340),
        coin(2400, 420), coin(2440, 420),
        coin(2720, 340), coin(2760, 340),
        coin(2880, 280), coin(2920, 280),
        coin(3240, 380),
        coin(3380, 420), coin(3420, 420),
        coin(3680, 420), coin(3720, 420)
      ],
      spikes: [
        { x: 150, y: 458, w: 40, h: 12 },
        { x: 1700, y: 458, w: 40, h: 12 },
        { x: 2500, y: 458, w: 48, h: 12 },
        { x: 3480, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1560, y: GROUND_Y },
        { x: 2450, y: GROUND_Y },
        { x: 3420, y: GROUND_Y }
      ],
      flag: { x: 7560, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7536, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 9 关 · 水晶洞窟（下坠平台 + 单向平台 + 升降平台综合）
    // ---------------------------------------------------------
    {
      name: '第 9 关 · 水晶洞窟',
      tip: '水晶洞窟机关交错：下坠平台、单向平台与升降台轮番登场',
      width: 7200,
      repeatOffset: 3600,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 260),
        ledge(300, 400, 80),
        oneWay(440, 340, 100),
        ledge(600, 290, 90),
        mover(760, 380, 100, 'y', 75, 0.03, 0.5),
        ground(940, 260),
        ground(1580, 280),
        mover(1940, 400, 100, 'x', 110, 0.026, 1.0),
        ground(2200, 280),
        oneWay(2580, 360, 110),
        oneWay(2740, 290, 110),
        ground(2920, 200),
        mover(3200, 420, 100, 'y', 55, 0.03, 2.0),
        ground(3360, 240),
        ledge(2400, 300, 90)
      ],
      fallPlats: [
        { x: 1260, y: 420, w: 90 },
        { x: 1400, y: 390, w: 90 }
      ],
      pads: [
        { x: 2300, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 0, x: 180, dir: 1, speed: 1.3 },
        { platform: 5, x: 1080, dir: -1, speed: 1.5 },
        { platform: 6, x: 1750, dir: 1, speed: 1.6 },
        { platform: 8, x: 2350, dir: 1, speed: 1.7 },
        { platform: 11, x: 3050, dir: -1, speed: 1.6 },
        { platform: 13, x: 3450, dir: 1, speed: 1.5 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(320, 360), coin(360, 360),
        coin(460, 300), coin(500, 300),
        coin(620, 250), coin(660, 250),
        coin(780, 340), coin(820, 340),
        coin(960, 420), coin(1000, 420),
        coin(1280, 380), coin(1320, 350),
        coin(1420, 350),
        coin(1600, 420), coin(1640, 420),
        coin(1960, 360), coin(2000, 360),
        coin(2220, 420), coin(2260, 420),
        // 弹跳板隐藏区
        coin(2420, 260), coin(2460, 260),
        coin(2600, 320), coin(2640, 320),
        coin(2760, 250), coin(2800, 250),
        coin(2940, 420), coin(2980, 420),
        coin(3220, 380), coin(3260, 380),
        coin(3380, 420), coin(3420, 420),
        coin(3480, 420)
      ],
      spikes: [
        { x: 120, y: 458, w: 40, h: 12 },
        { x: 1650, y: 458, w: 48, h: 12 },
        { x: 2380, y: 458, w: 40, h: 12 },
        { x: 2980, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1000, y: GROUND_Y },
        { x: 1680, y: GROUND_Y },
        { x: 2280, y: GROUND_Y }
      ],
      flag: { x: 7160, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7136, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 10 关 · 冰川峡谷（单向冰台 + 升降平台 + 长距跳跃）
    // ---------------------------------------------------------
    {
      name: '第 10 关 · 冰川峡谷',
      tip: '冰川峡谷：单向冰台只能从下方跳上，小心脚下深谷',
      width: 8000,
      repeatOffset: 4000,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 260),
        ledge(300, 400, 90),
        mover(460, 360, 100, 'y', 70, 0.03, 0.5),
        ground(700, 260),
        oneWay(880, 360, 110),
        mover(1080, 420, 100, 'x', 120, 0.026, 1.0),
        ground(1400, 280),
        ledge(1720, 380, 100),
        oneWay(1900, 320, 110),
        ground(2080, 260),
        mover(2360, 400, 100, 'y', 80, 0.03, 0.8),
        ground(2640, 280),
        ledge(2960, 360, 100),
        oneWay(3120, 300, 110),
        mover(3320, 420, 100, 'x', 100, 0.028, 2.0),
        ground(3660, 340),
        ledge(1660, 300, 80)
      ],
      fallPlats: [
        { x: 3520, y: 430, w: 90 }
      ],
      pads: [
        { x: 1560, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 3, x: 800, type: 'walker', dir: 1, speed: 1.3 },
        { platform: 6, x: 1500, type: 'charger', dir: -1, speed: 1.5 },
        { platform: 9, x: 2250, type: 'spiky', dir: 1, speed: 1.4 },
        { platform: 11, x: 2800, type: 'hopper', dir: -1, speed: 1.5 },
        { platform: 12, x: 3000, type: 'flyer', dir: 1, speed: 1.3 },
        { platform: 15, x: 3720, type: 'charger', dir: -1, speed: 1.6 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(320, 360), coin(360, 360),
        coin(480, 320), coin(520, 320),
        coin(720, 420), coin(760, 420),
        coin(900, 320), coin(940, 320),
        coin(1100, 380), coin(1140, 380),
        coin(1420, 420), coin(1460, 420),
        // 弹跳板隐藏区
        coin(1680, 260), coin(1720, 260),
        coin(1740, 340), coin(1780, 340),
        coin(1920, 280), coin(1960, 280),
        coin(2100, 420), coin(2140, 420),
        coin(2380, 360), coin(2420, 360),
        coin(2660, 420), coin(2700, 420),
        coin(2980, 320), coin(3020, 320),
        coin(3140, 260), coin(3180, 260),
        coin(3340, 380), coin(3380, 380),
        coin(3680, 420), coin(3720, 420)
      ],
      spikes: [
        { x: 150, y: 458, w: 40, h: 12 },
        { x: 1450, y: 458, w: 40, h: 12 },
        { x: 2250, y: 458, w: 40, h: 12 },
        { x: 2790, y: 458, w: 40, h: 12 },
        { x: 3700, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 760, y: GROUND_Y },
        { x: 2150, y: GROUND_Y },
        { x: 2700, y: GROUND_Y }
      ],
      flag: { x: 7960, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7936, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 11 关 · 废弃工厂（下坠平台 + 移动平台 + 冲锋怪）
    // ---------------------------------------------------------
    {
      name: '第 11 关 · 废弃工厂',
      tip: '废弃工厂：冲锋怪靠近时会突然加速，注意保持距离',
      width: 7600,
      repeatOffset: 3800,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 280),
        mover(380, 430, 100, 'x', 110, 0.024, 0),
        ground(660, 240),
        ledge(920, 390, 90),
        mover(1080, 360, 100, 'y', 70, 0.03, 0.5),
        ground(1340, 260),
        ground(2140, 260),
        oneWay(2320, 360, 110),
        mover(2520, 400, 100, 'x', 120, 0.026, 1.2),
        ground(2780, 260),
        ledge(3060, 380, 100),
        ground(3300, 260),
        ledge(3580, 360, 90),
        ground(3680, 120),
        ledge(2340, 300, 90)
      ],
      fallPlats: [
        { x: 1620, y: 420, w: 90 },
        { x: 1760, y: 390, w: 90 }
      ],
      pads: [
        { x: 2250, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 2, x: 800, type: 'charger', dir: -1, speed: 1.4 },
        { platform: 5, x: 1500, type: 'walker', dir: 1, speed: 1.4 },
        { platform: 6, x: 2280, type: 'spiky', dir: 1, speed: 1.5 },
        { platform: 9, x: 2900, type: 'hopper', dir: -1, speed: 1.5 },
        { platform: 11, x: 3400, type: 'flyer', dir: 1, speed: 1.4 },
        { platform: 12, x: 3620, type: 'walker', dir: -1, speed: 1.3 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(400, 390), coin(440, 390),
        coin(680, 420), coin(720, 420),
        coin(940, 350), coin(980, 350),
        coin(1100, 320), coin(1140, 320),
        coin(1360, 420), coin(1400, 420),
        coin(1640, 380), coin(1680, 380),
        coin(1780, 350), coin(1820, 350),
        coin(2160, 420), coin(2200, 420),
        // 弹跳板隐藏区
        coin(2360, 260), coin(2400, 260),
        coin(2340, 290), coin(2380, 290),
        coin(2540, 360), coin(2580, 360),
        coin(2800, 420), coin(2840, 420),
        coin(3080, 340), coin(3120, 340),
        coin(3320, 420), coin(3360, 420),
        coin(3600, 320), coin(3640, 320),
        coin(3700, 420), coin(3740, 420)
      ],
      spikes: [
        { x: 120, y: 458, w: 40, h: 12 },
        { x: 1400, y: 458, w: 40, h: 12 },
        { x: 2960, y: 458, w: 48, h: 12 },
        { x: 3340, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 700, y: GROUND_Y },
        { x: 2200, y: GROUND_Y },
        { x: 2850, y: GROUND_Y }
      ],
      flag: { x: 7560, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 7536, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 12 关 · 星海终章（终局综合关卡：五种怪物全部登场）
    // ---------------------------------------------------------
    {
      name: '第 12 关 · 星海终章',
      tip: '星海终章：五种怪物全部登场，尖刺怪无法踩头',
      width: 8400,
      repeatOffset: 4200,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 240),
        oneWay(280, 380, 100),
        ledge(430, 310, 90),
        mover(600, 400, 100, 'x', 120, 0.026, 0),
        ground(880, 240),
        mover(1160, 420, 100, 'y', 65, 0.03, 0.8),
        ground(1400, 240),
        oneWay(1680, 360, 110),
        ledge(1840, 290, 110),
        ground(2020, 260),
        mover(2300, 380, 100, 'y', 85, 0.03, 1.6),
        ground(2580, 260),
        oneWay(2780, 360, 110),
        oneWay(2920, 290, 110),
        mover(3100, 420, 100, 'x', 110, 0.028, 2.0),
        ground(3360, 260),
        ledge(3620, 340, 90),
        mover(3800, 420, 100, 'y', 55, 0.03, 0.5),
        ground(4040, 160),
        ledge(2740, 300, 90)
      ],
      fallPlats: [
        { x: 3260, y: 420, w: 90 }
      ],
      pads: [
        { x: 2650, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 0, x: 160, type: 'spiky', dir: 1, speed: 1.3 },
        { platform: 4, x: 1000, type: 'charger', dir: -1, speed: 1.5 },
        { platform: 6, x: 1500, type: 'flyer', dir: 1, speed: 1.4 },
        { platform: 9, x: 2200, type: 'hopper', dir: -1, speed: 1.5 },
        { platform: 11, x: 2750, type: 'spiky', dir: 1, speed: 1.5 },
        { platform: 15, x: 3500, type: 'charger', dir: -1, speed: 1.6 },
        { platform: 16, x: 3670, type: 'flyer', dir: 1, speed: 1.4 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(300, 340), coin(340, 340),
        coin(450, 270), coin(490, 270),
        coin(620, 360), coin(660, 360),
        coin(900, 420), coin(940, 420),
        coin(1180, 380), coin(1220, 380),
        coin(1420, 420), coin(1460, 420),
        coin(1700, 320), coin(1740, 320),
        coin(1860, 250), coin(1900, 250),
        coin(2040, 420), coin(2080, 420),
        coin(2320, 340), coin(2360, 340),
        coin(2600, 420), coin(2640, 420),
        // 弹跳板隐藏区
        coin(2760, 260), coin(2800, 260),
        coin(2800, 320), coin(2840, 320),
        coin(2940, 250), coin(2980, 250),
        coin(3120, 380), coin(3160, 380),
        coin(3380, 420), coin(3420, 420),
        coin(3640, 300), coin(3680, 300),
        coin(3820, 380), coin(3860, 380),
        coin(4060, 420), coin(4100, 420)
      ],
      spikes: [
        { x: 100, y: 458, w: 40, h: 12 },
        { x: 1450, y: 458, w: 40, h: 12 },
        { x: 2600, y: 458, w: 40, h: 12 },
        { x: 3400, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 950, y: GROUND_Y },
        { x: 2100, y: GROUND_Y },
        { x: 3450, y: GROUND_Y }
      ],
      flag: { x: 8360, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 8336, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 13 关 · 熔火核心（火球 / 激光 / 捕兽夹全开）
    // ---------------------------------------------------------
    {
      name: '第 13 关 · 熔火核心',
      tip: '熔火核心：火球与激光密集，注意观察发射节奏',
      width: 8400,
      repeatOffset: 4200,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 260),
        ground(420, 260),
        mover(760, 420, 100, 'x', 120, 0.026, 0),
        ground(1040, 280),
        oneWay(1320, 360, 110),
        mover(1500, 400, 100, 'y', 70, 0.03, 1.0),
        ground(1780, 280),
        ledge(2100, 360, 100),
        mover(2280, 420, 100, 'x', 110, 0.028, 0.5),
        ground(2560, 280),
        oneWay(2840, 360, 110),
        mover(3020, 380, 100, 'y', 80, 0.03, 1.5),
        ground(3300, 280),
        ledge(3600, 340, 100),
        ground(3800, 400),
        ledge(1180, 300, 80)
      ],
      pads: [
        { x: 1100, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 1, x: 520, type: 'walker', dir: 1, speed: 1.5 },
        { platform: 3, x: 1140, type: 'charger', dir: -1, speed: 1.6 },
        { platform: 6, x: 1950, type: 'hopper', dir: 1, speed: 1.6 },
        { platform: 9, x: 2680, type: 'flyer', dir: -1, speed: 1.5 },
        { platform: 12, x: 3400, type: 'spiky', dir: 1, speed: 1.6 },
        { platform: 13, x: 3650, type: 'flyer', dir: -1, speed: 1.5 },
        { platform: 14, x: 3900, type: 'hopper', dir: 1, speed: 1.6 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(440, 420), coin(480, 420),
        coin(780, 380), coin(820, 380),
        coin(1060, 420), coin(1100, 420),
        coin(1340, 320), coin(1380, 320),
        coin(1520, 360), coin(1560, 360),
        coin(1800, 420), coin(1840, 420),
        coin(2120, 320), coin(2160, 320),
        coin(2300, 380), coin(2340, 380),
        coin(2580, 420), coin(2620, 420),
        coin(2860, 320), coin(2900, 320),
        coin(3040, 340), coin(3080, 340),
        coin(3320, 420), coin(3360, 420),
        coin(3620, 300), coin(3660, 300),
        coin(3920, 420), coin(3960, 420)
      ],
      spikes: [
        { x: 150, y: 458, w: 40, h: 12 },
        { x: 500, y: 458, w: 40, h: 12 },
        { x: 2000, y: 458, w: 48, h: 12 },
        { x: 2700, y: 458, w: 40, h: 12 },
        { x: 3350, y: 458, w: 40, h: 12 },
        { x: 3950, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 1080, y: GROUND_Y },
        { x: 1860, y: GROUND_Y },
        { x: 2640, y: GROUND_Y }
      ],
      flag: { x: 8360, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 8336, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 14 关 · 幽暗地宫（下坠平台 + 捕兽夹 + 激光）
    // ---------------------------------------------------------
    {
      name: '第 14 关 · 幽暗地宫',
      tip: '幽暗地宫：下坠平台与捕兽夹遍布，注意脚下',
      width: 8800,
      repeatOffset: 4400,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 280),
        mover(360, 430, 100, 'x', 110, 0.024, 0),
        ground(640, 260),
        ledge(900, 390, 100),
        oneWay(1060, 320, 110),
        mover(1240, 400, 100, 'y', 70, 0.03, 0.8),
        ground(1520, 280),
        ground(2140, 280),
        ledge(2420, 360, 100),
        mover(2600, 420, 100, 'x', 120, 0.026, 1.0),
        oneWay(2900, 350, 110),
        mover(3080, 380, 100, 'y', 85, 0.03, 0.5),
        ground(3360, 280),
        ledge(3660, 340, 90),
        ground(3860, 300),
        ground(4160, 240),
        ledge(3980, 300, 80)
      ],
      fallPlats: [
        { x: 1840, y: 420, w: 90 },
        { x: 1980, y: 390, w: 90 }
      ],
      pads: [
        { x: 3900, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 2, x: 800, type: 'charger', dir: -1, speed: 1.6 },
        { platform: 6, x: 1650, type: 'hopper', dir: 1, speed: 1.6 },
        { platform: 7, x: 2250, type: 'spiky', dir: -1, speed: 1.6 },
        { platform: 12, x: 3480, type: 'spiky', dir: 1, speed: 1.7 },
        { platform: 14, x: 3950, type: 'flyer', dir: 1, speed: 1.5 },
        { platform: 13, x: 3700, type: 'hopper', dir: -1, speed: 1.5 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(380, 390), coin(420, 390),
        coin(660, 420), coin(700, 420),
        coin(920, 350), coin(960, 350),
        coin(1080, 280), coin(1120, 280),
        coin(1260, 360), coin(1300, 360),
        coin(1540, 420), coin(1580, 420),
        coin(1860, 380), coin(1900, 380),
        coin(2160, 420), coin(2200, 420),
        coin(2440, 320), coin(2480, 320),
        coin(2620, 380), coin(2660, 380),
        coin(2920, 310), coin(2960, 310),
        coin(3100, 340), coin(3140, 340),
        coin(3380, 420), coin(3420, 420),
        coin(3680, 300), coin(3720, 300),
        coin(3880, 420), coin(3920, 420),
        coin(4000, 260), coin(4040, 260),
        coin(4180, 420), coin(4220, 420)
      ],
      spikes: [
        { x: 120, y: 458, w: 40, h: 12 },
        { x: 2350, y: 458, w: 40, h: 12 },
        { x: 4200, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 700, y: GROUND_Y },
        { x: 1600, y: GROUND_Y },
        { x: 3420, y: GROUND_Y }
      ],
      flag: { x: 8760, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 8736, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 15 关 · 极光冰原（冰台 + 升降台 + 多重激光）
    // ---------------------------------------------------------
    {
      name: '第 15 关 · 极光冰原',
      tip: '极光冰原：冰台与升降台交错，小心周期激光',
      width: 9200,
      repeatOffset: 4600,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 260),
        ledge(300, 400, 90),
        oneWay(460, 330, 100),
        mover(620, 380, 100, 'y', 75, 0.03, 0.5),
        ground(900, 260),
        mover(1180, 420, 100, 'x', 120, 0.026, 1.0),
        ground(1460, 280),
        oneWay(1760, 360, 110),
        ledge(1920, 290, 100),
        ground(2100, 280),
        mover(2380, 400, 100, 'y', 80, 0.03, 0.8),
        ground(2660, 260),
        oneWay(2940, 360, 110),
        oneWay(3080, 290, 110),
        mover(3260, 420, 100, 'x', 110, 0.028, 2.0),
        ground(3540, 260),
        ledge(3820, 340, 100),
        mover(4000, 420, 100, 'y', 60, 0.03, 0.5),
        ground(4260, 340),
        ledge(2820, 300, 90)
      ],
      fallPlats: [
        { x: 3430, y: 420, w: 90 }
      ],
      pads: [
        { x: 2750, y: GROUND_Y, w: 52 }
      ],
      enemies: [
        { platform: 4, x: 1000, type: 'charger', dir: 1, speed: 1.6 },
        { platform: 9, x: 2200, type: 'hopper', dir: -1, speed: 1.6 },
        { platform: 11, x: 2750, type: 'flyer', dir: 1, speed: 1.5 },
        { platform: 15, x: 3750, type: 'spiky', dir: -1, speed: 1.7 },
        { platform: 18, x: 4350, type: 'charger', dir: 1, speed: 1.7 },
        { platform: 16, x: 3900, type: 'flyer', dir: -1, speed: 1.5 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(320, 360), coin(360, 360),
        coin(480, 290), coin(520, 290),
        coin(640, 340), coin(680, 340),
        coin(920, 420), coin(960, 420),
        coin(1200, 380), coin(1240, 380),
        coin(1480, 420), coin(1520, 420),
        coin(1780, 320), coin(1820, 320),
        coin(1940, 250), coin(1980, 250),
        coin(2120, 420), coin(2160, 420),
        coin(2400, 360), coin(2440, 360),
        coin(2680, 420), coin(2720, 420),
        coin(2840, 260), coin(2880, 260),
        coin(2960, 320), coin(3000, 320),
        coin(3100, 250), coin(3140, 250),
        coin(3280, 380), coin(3320, 380),
        coin(3560, 420), coin(3600, 420),
        coin(3840, 300), coin(3880, 300),
        coin(4020, 380), coin(4060, 380),
        coin(4280, 420), coin(4320, 420)
      ],
      spikes: [
        { x: 120, y: 458, w: 40, h: 12 },
        { x: 2250, y: 458, w: 40, h: 12 },
        { x: 3650, y: 458, w: 40, h: 12 },
        { x: 4450, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 980, y: GROUND_Y },
        { x: 2160, y: GROUND_Y },
        { x: 3600, y: GROUND_Y }
      ],
      flag: { x: 9160, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 9136, y: 356, w: 70, h: 114 }
    },

    // ---------------------------------------------------------
    // 第 16 关 · 星核终局（全怪物 / 全陷阱终极关卡）
    // ---------------------------------------------------------
    {
      name: '第 16 关 · 星核终局',
      tip: '星核终局：所有怪物与陷阱同时登场，难度拉满',
      width: 9600,
      repeatOffset: 4800,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: [
        ground(0, 240),
        oneWay(280, 380, 100),
        ledge(430, 310, 90),
        mover(600, 400, 100, 'x', 120, 0.026, 0),
        ground(900, 240),
        mover(1180, 420, 100, 'y', 70, 0.03, 1.0),
        ground(1460, 240),
        oneWay(1740, 360, 110),
        ledge(1900, 290, 110),
        ground(2100, 260),
        mover(2380, 380, 100, 'y', 85, 0.03, 1.6),
        oneWay(2660, 360, 110),
        oneWay(2800, 290, 110),
        ground(2980, 260),
        mover(3260, 420, 100, 'x', 110, 0.028, 2.0),
        ground(3540, 260),
        ledge(3820, 340, 90),
        mover(4000, 420, 100, 'y', 55, 0.03, 0.5),
        ground(4260, 260),
        ground(4560, 240)
      ],
      fallPlats: [
        { x: 3380, y: 420, w: 90 }
      ],
      enemies: [
        { platform: 4, x: 1000, type: 'charger', dir: -1, speed: 1.7 },
        { platform: 6, x: 1520, type: 'flyer', dir: 1, speed: 1.6 },
        { platform: 9, x: 2200, type: 'hopper', dir: -1, speed: 1.6 },
        { platform: 13, x: 3100, type: 'spiky', dir: 1, speed: 1.7 },
        { platform: 15, x: 3720, type: 'spiky', dir: -1, speed: 1.7 },
        { platform: 18, x: 4350, type: 'charger', dir: 1, speed: 1.8 },
        { platform: 16, x: 3900, type: 'flyer', dir: -1, speed: 1.6 }
      ],
      coins: [
        coin(80, 420), coin(120, 420), coin(160, 420),
        coin(300, 340), coin(340, 340),
        coin(450, 270), coin(490, 270),
        coin(620, 360), coin(660, 360),
        coin(920, 420), coin(960, 420),
        coin(1200, 380), coin(1240, 380),
        coin(1480, 420), coin(1520, 420),
        coin(1760, 320), coin(1800, 320),
        coin(1920, 250), coin(1960, 250),
        coin(2120, 420), coin(2160, 420),
        coin(2400, 340), coin(2440, 340),
        coin(2680, 320), coin(2720, 320),
        coin(2820, 250), coin(2860, 250),
        coin(3000, 420), coin(3040, 420),
        coin(3280, 380), coin(3320, 380),
        coin(3560, 420), coin(3600, 420),
        coin(3840, 300), coin(3880, 300),
        coin(4020, 380), coin(4060, 380),
        coin(4280, 420), coin(4320, 420),
        coin(4580, 420), coin(4620, 420)
      ],
      spikes: [
        { x: 120, y: 458, w: 40, h: 12 },
        { x: 1500, y: 458, w: 40, h: 12 },
        { x: 2300, y: 458, w: 40, h: 12 },
        { x: 4600, y: 458, w: 40, h: 12 }
      ],
      checkpoints: [
        { x: 970, y: GROUND_Y },
        { x: 2180, y: GROUND_Y },
        { x: 3610, y: GROUND_Y }
      ],
      flag: { x: 9560, y: 374, w: 5, h: 96 },
      flagTrigger: { x: 9536, y: 356, w: 70, h: 114 }
    }
  ];

  // ============================================================
  // 2.5 第二篇章：第 17~32 关（专属章节关卡）
  //     每关由独立的地形章节序列向右拼装，不再复用前 16 关布局；
  //     章节间距按基础跳跃（约 76px 高 / 150px 远）与二段跳可达范围设计。
  // ============================================================
  const ACT_TWO_DEFS = [
    { theme: 12, name: '熔岩回廊', tip: '熔岩持续上涨，落锤与地刺加入陷阱轮换', tier: 1,
      biome: { lava: { start: 560, cap: 500, speed: 0.032 }, wind: 0.02 },
      types: ['walker', 'hopper', 'charger', 'shooter'],
      hints: [{ x: 320, y: 320, text: '第二篇章：落锤周期性砸下，观察警示再通过' }],
      sections: [
        ['start'],
        ['pit', 150, 320],
        ['flat', 140, 340, 0],
        ['mover', 210, 'x', 80, 320],
        ['stairs', 140, 2, 300],
        ['flat', 150, 360, 1],
        ['fall', 250, 300],
        ['pad', 130, 380],
        ['flat', 150, 340, 0],
        ['bridge', 130, 2, 320],
        ['crusher', 150, 320, 1],
        ['flat', 140, 380, 1],
        ['finish', 140]
      ] },
    { theme: 14, name: '风暴峡谷', tip: '强风会把空中的你吹偏，落锤与地刺交错出现', tier: 1,
      biome: { wind: 0.06, gust: { period: 320, on: 130, strength: 0.34 } },
      types: ['walker', 'charger', 'hopper', 'flyer', 'spiky', 'shooter'],
      hints: [{ x: 320, y: 320, text: '周期强风：出现“强风”预警后，空中会被猛烈吹偏' }],
      sections: [
        ['start'],
        ['stairs', 160, 3, 280],
        ['bridge', 150, 3, 300],
        ['mover', 210, 'y', 55, 320],
        ['flat', 140, 340, 1],
        ['spike', 150, 360, 1],
        ['pit', 180, 300],
        ['tower', 140, 360, 3],
        ['mover', 200, 'x', 100, 300],
        ['bridge', 140, 3, 320],
        ['saw', 150, 340],
        ['flat', 140, 360, 1],
        ['finish', 130]
      ] },
    { theme: 8, name: '冰晶矿脉', tip: '冰面打滑叠加地刺弹出，落点要提前判断', tier: 2,
      biome: { ice: true },
      types: ['walker', 'hopper', 'flyer', 'armored', 'shooter'],
      hints: [{ x: 320, y: 320, text: '地面会打滑，地刺弹出前有警示闪动' }],
      sections: [
        ['start'],
        ['flat', 130, 360, 0],
        ['popspike', 140, 360, 2],
        ['pit', 170, 320],
        ['stairs', 150, 2, 280],
        ['bridge', 140, 3, 300],
        ['pad', 140, 360],
        ['fall', 260, 300],
        ['popspike', 150, 340, 2],
        ['mover', 200, 'x', 90, 320],
        ['flat', 140, 380, 2],
        ['finish', 130]
      ] },
    { theme: 14, name: '极夜冰川', tip: '黑暗中冰面与地刺同时出现，留意脚下的警示', tier: 2,
      biome: { ice: true, dark: true },
      types: ['walker', 'charger', 'ghost', 'shooter', 'armored'],
      hints: [{ x: 320, y: 320, text: '黑暗视野：幽灵会穿过平台靠近你' }],
      sections: [
        ['start'],
        ['bridge', 140, 3, 300],
        ['flat', 150, 320, 0],
        ['tower', 140, 360, 3],
        ['fall', 250, 300],
        ['pit', 180, 300],
        ['mover', 220, 'y', 62, 300],
        ['crusher', 150, 320, 1],
        ['flat', 140, 360, 1],
        ['bridge', 140, 3, 300],
        ['pad', 130, 360],
        ['finish', 150]
      ] },
    { theme: 10, name: '废弃电站', tip: '黑暗工厂里铁甲怪需要踩两次才会倒下', tier: 3,
      biome: { dark: true },
      types: ['walker', 'armored', 'shooter', 'charger', 'spiky'],
      hints: [{ x: 320, y: 320, text: '铁甲怪有护甲：第一次踩踏只会击碎护甲' }],
      sections: [
        ['start'],
        ['crusher', 150, 360, 2],
        ['flat', 140, 320, 1],
        ['laser', 150, 360],
        ['mover', 210, 'x', 85, 300],
        ['crusher', 150, 340, 2],
        ['pad', 140, 340],
        ['popspike', 150, 340, 2],
        ['bridge', 140, 3, 300],
        ['laser', 140, 340],
        ['fall', 250, 300],
        ['flat', 150, 380, 1],
        ['finish', 140]
      ] },
    { theme: 11, name: '星陨回廊', tip: '黑暗与强风叠加，炮台怪会远程射击', tier: 3,
      biome: { dark: true, wind: -0.05, gust: { period: 300, on: 120, strength: -0.32 } },
      types: ['walker', 'flyer', 'ghost', 'shooter', 'armored', 'charger'],
      hints: [{ x: 320, y: 320, text: '炮台怪会朝你发射弹体，冲刺可以躲开' }],
      sections: [
        ['start'],
        ['bridge', 150, 4, 300],
        ['mover', 210, 'y', 60, 300],
        ['flat', 140, 320, 1],
        ['pendulum', 150, 340],
        ['pit', 190, 300],
        ['spike', 150, 360, 2],
        ['tower', 140, 340, 4],
        ['mover', 220, 'x', 110, 300],
        ['laser', 140, 320],
        ['bridge', 140, 3, 320],
        ['flat', 150, 340, 1],
        ['finish', 140]
      ] },
    { theme: 6, name: '熔火深渊', tip: '熔岩上涨 + 黑暗视野，落锤与地刺双重夹击', tier: 4,
      biome: { lava: { start: 540, cap: 470, speed: 0.04 }, dark: true },
      types: ['walker', 'charger', 'spiky', 'armored', 'shooter', 'ghost'],
      hints: [{ x: 320, y: 320, text: '熔岩上涨：不要在下层停留太久' }],
      sections: [
        ['start'],
        ['flat', 130, 320, 0],
        ['mover', 230, 'x', 100, 300],
        ['popspike', 150, 340, 2],
        ['pit', 190, 300],
        ['pad', 140, 360],
        ['crusher', 150, 320, 2],
        ['bridge', 150, 3, 320],
        ['fall', 260, 300],
        ['mover', 230, 'y', 65, 300],
        ['laser', 150, 320],
        ['flat', 140, 340, 1],
        ['finish', 150]
      ] },
    { theme: 15, name: '暗星守卫', tip: '暗星守卫会蓄力冲撞与震地波，半血后狂暴并召唤增援', tier: 4,
      boss: { hp: 8, speed: 1.9, style: 'guardian' }, biome: { dark: true },
      types: ['walker', 'armored', 'shooter', 'charger'],
      hints: [{ x: 320, y: 320, text: '暗星守卫会冲撞与震地，半血后狂暴召唤增援' }],
      sections: [
        ['start'],
        ['flat', 140, 320, 0],
        ['pit', 170, 300],
        ['tower', 140, 340, 3],
        ['crusher', 150, 320, 1],
        ['fall', 250, 300],
        ['bridge', 140, 3, 300],
        ['flat', 140, 340, 1],
        ['arena', 160]
      ] },
    { theme: 13, name: '腐化地宫', tip: '黑暗地宫中幽灵与铁甲怪混编，地刺从脚下弹出', tier: 4,
      biome: { dark: true, ice: true },
      types: ['walker', 'ghost', 'armored', 'shooter', 'spiky'],
      hints: [{ x: 320, y: 320, text: '地刺只在弹出时造成伤害，可等它缩回再走' }],
      sections: [
        ['start'],
        ['fall', 240, 300],
        ['flat', 140, 340, 1],
        ['crusher', 150, 340, 2],
        ['popspike', 150, 340, 2],
        ['pit', 180, 300],
        ['mover', 220, 'y', 60, 320],
        ['pad', 140, 340],
        ['bridge', 150, 3, 300],
        ['flat', 140, 360, 2],
        ['pendulum', 150, 320],
        ['finish', 140]
      ] },
    { theme: 9, name: '极光绝壁', tip: '冰面 + 强风 + 幽灵，空中路线风险更高', tier: 5,
      biome: { ice: true, wind: 0.05, gust: { period: 340, on: 120, strength: 0.3 } },
      types: ['walker', 'hopper', 'charger', 'ghost', 'armored', 'shooter'],
      hints: [{ x: 320, y: 320, text: '幽灵不受地形阻挡，注意头顶' }],
      sections: [
        ['start'],
        ['stairs', 160, 3, 280],
        ['bridge', 150, 4, 300],
        ['mover', 220, 'y', 70, 320],
        ['laser', 150, 340],
        ['flat', 150, 340, 2],
        ['pit', 190, 300],
        ['tower', 140, 340, 4],
        ['popspike', 150, 320, 2],
        ['bridge', 150, 4, 300],
        ['crusher', 150, 340, 2],
        ['pad', 130, 340],
        ['finish', 150]
      ] },
    { theme: 15, name: '虚空星道', tip: '黑暗与反向强风，炮台与铁甲怪密集出现', tier: 5,
      biome: { wind: -0.06, dark: true, gust: { period: 290, on: 120, strength: -0.36 } },
      types: ['walker', 'flyer', 'ghost', 'shooter', 'armored', 'spiky'],
      hints: [{ x: 320, y: 320, text: '反向周期强风：看到“强风预警”先落地稳住' }],
      sections: [
        ['start'],
        ['bridge', 160, 5, 300],
        ['mover', 230, 'x', 120, 300],
        ['pit', 200, 300],
        ['spike', 150, 340, 2],
        ['pendulum', 150, 320],
        ['tower', 140, 320, 5],
        ['fall', 260, 300],
        ['laser', 150, 320],
        ['bridge', 150, 4, 300],
        ['flat', 150, 340, 2],
        ['finish', 150]
      ] },
    { theme: 0, name: '灰烬绿野', tip: '熟悉的林地已被熔岩侵蚀，敌人速度更快', tier: 5,
      biome: { lava: { start: 560, cap: 490, speed: 0.034 } },
      types: ['walker', 'charger', 'hopper', 'shooter', 'armored', 'ghost'],
      hints: [{ x: 320, y: 320, text: '第二篇章的敌人移动更快' }],
      sections: [
        ['start'],
        ['flat', 140, 360, 2],
        ['mover', 220, 'x', 100, 320],
        ['popspike', 150, 360, 2],
        ['pad', 140, 340],
        ['crusher', 150, 340, 2],
        ['pit', 190, 300],
        ['fall', 260, 300],
        ['bridge', 150, 3, 320],
        ['laser', 150, 320],
        ['saw', 150, 340],
        ['flat', 140, 340, 2],
        ['finish', 140]
      ] },
    { theme: 4, name: '血月尖刺', tip: '黑暗中尖刺与地刺成片出现，落点要稳', tier: 6,
      biome: { dark: true },
      types: ['walker', 'spiky', 'charger', 'shooter', 'armored'],
      hints: [{ x: 320, y: 320, text: '尖刺怪不能踩头，请用冲刺绕开' }],
      sections: [
        ['start'],
        ['spike', 150, 380, 3],
        ['crusher', 150, 340, 2],
        ['popspike', 150, 360, 3],
        ['bridge', 150, 4, 300],
        ['flat', 140, 320, 2],
        ['mover', 230, 'y', 70, 300],
        ['pendulum', 150, 320],
        ['fall', 270, 300],
        ['pad', 140, 320],
        ['laser', 150, 320],
        ['spike', 150, 380, 3],
        ['finish', 150]
      ] },
    { theme: 2, name: '幽紫矿洞', tip: '冰面矿洞中炮台怪从远处压制，注意弹道', tier: 6,
      biome: { ice: true },
      types: ['walker', 'hopper', 'flyer', 'ghost', 'shooter', 'armored'],
      hints: [{ x: 320, y: 320, text: '炮台弹体会追踪发射方向，横向移动可躲' }],
      sections: [
        ['start'],
        ['bridge', 150, 4, 300],
        ['mover', 220, 'y', 70, 300],
        ['flat', 150, 320, 1],
        ['tower', 140, 320, 5],
        ['popspike', 150, 340, 3],
        ['pit', 190, 300],
        ['crusher', 150, 320, 2],
        ['laser', 150, 320],
        ['fall', 260, 300],
        ['bridge', 150, 4, 320],
        ['flat', 140, 340, 2],
        ['finish', 150]
      ] },
    { theme: 3, name: '深蓝风暴', tip: '反向强风与冰面同时出现，冲刺用来稳住落点', tier: 7,
      biome: { wind: -0.055, ice: true, gust: { period: 280, on: 120, strength: -0.38 } },
      types: ['walker', 'charger', 'armored', 'ghost', 'shooter', 'spiky'],
      hints: [{ x: 320, y: 320, text: '风暴中尽量贴地移动，减少空中漂移' }],
      sections: [
        ['start'],
        ['bridge', 170, 5, 300],
        ['mover', 240, 'x', 130, 300],
        ['flat', 150, 340, 2],
        ['pendulum', 150, 340],
        ['laser', 150, 340],
        ['tower', 140, 300, 5],
        ['popspike', 160, 340, 3],
        ['fall', 270, 300],
        ['mover', 240, 'y', 80, 300],
        ['bridge', 160, 5, 320],
        ['crusher', 160, 340, 3],
        ['pad', 140, 320],
        ['finish', 150]
      ] },
    { theme: 15, name: '终焉星核', tip: '终焉星核会发射星核弹幕与核心光柱，击败后才会出现终点旗帜', tier: 8,
      boss: { hp: 12, speed: 2.0, style: 'core' }, biome: { dark: true, wind: -0.045 },
      types: ['walker', 'armored', 'shooter', 'ghost', 'charger', 'spiky'],
      hints: [{ x: 320, y: 320, text: '终焉星核：先躲弹幕，再看光柱预警，击败后才出现终点' }],
      sections: [
        ['start'],
        ['flat', 150, 320, 1],
        ['bridge', 160, 4, 300],
        ['crusher', 150, 340, 2],
        ['fall', 260, 300],
        ['popspike', 150, 320, 2],
        ['tower', 140, 320, 4],
        ['pendulum', 150, 320],
        ['laser', 150, 320],
        ['mover', 240, 'x', 120, 300],
        ['spike', 160, 340, 2],
        ['bridge', 160, 4, 320],
        ['arena', 180]
      ] }
  ];

  // ---- 第二篇章章节拼装工具 ----
  const A2 = {
    STEP_W: 95,     // 台阶水平间距
    STEP_H: 56      // 台阶高度差（单跳可达）
  };

  // 地面（记录索引供敌人 / 检查点使用）
  function a2Ground(S, x, w, y) {
    const py = y === undefined ? GROUND_Y : y;
    S.plats.push(ground(x, w, py));
    S.grounds.push({ index: S.plats.length - 1, x, w, y: py });
  }
  // 浮台 / 单向平台
  function a2Ledge(S, x, y, w, ow) {
    S.plats.push(ow ? oneWay(x, y, w) : ledge(x, y, w));
    return { x, y, w };
  }
  // 隐藏高台（用于放置宝石 / 爱心）
  function a2High(S, x, y, w) {
    const h = a2Ledge(S, x, y, w, false);
    S.highs.push(h);
    return h;
  }
  // 一排金币
  function a2Coins(S, x, y, n, step) {
    const gap = step === undefined ? 40 : step;
    for (let i = 0; i < n; i++) {
      S.coins.push(coin(Math.round(x + i * gap), y));
    }
  }
  function a2Trap(S, kind, x, extra) {
    S.traps.push(Object.assign({ kind, x: Math.round(x) }, extra || {}));
  }

  // ---- 章节定义：每个章节从当前右端继续向右铺 ----
  const ACT_SECTIONS = {
    // 出生安全区
    start(S) {
      a2Ground(S, 0, 300);
      a2Coins(S, 110, GROUND_Y - 50, 3, 40);
      S.x = 300;
    },

    // 平地：可带尖刺
    flat(S, gap, len, spikeCount) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      a2Coins(S, x + 40, GROUND_Y - 50,
        Math.min(5, Math.max(3, Math.round(len / 90))), 40);
      const n = spikeCount || 0;
      for (let i = 0; i < n; i++) {
        S.spikes.push({
          x: Math.round(x + len * (0.32 + 0.36 * i)), y: 458, w: 40, h: 12
        });
      }
      S.x = x + len;
    },

    // 深坑：中间一块落脚浮台
    pit(S, gap, len) {
      const x = S.x + gap;
      if (gap >= 150) {
        const mx = S.x + Math.round(gap * 0.45);
        a2Ledge(S, mx, 415, 72);
        a2Coins(S, mx + 16, 375, 2, 28);
      } else {
        a2Coins(S, S.x + 26, GROUND_Y - 96, Math.max(2, Math.round(gap / 60)), 36);
      }
      a2Ground(S, x, len);
      a2Coins(S, x + 40, GROUND_Y - 50, 3, 40);
      S.x = x + len;
    },

    // 台阶：先上后下，顶部可藏收集物
    stairs(S, gap, steps, len) {
      const x0 = S.x + gap;
      let last = x0;
      for (let k = 1; k <= steps; k++) {
        const lx = x0 + (k - 1) * A2.STEP_W;
        a2Ledge(S, lx, GROUND_Y - A2.STEP_H * k, 85);
        a2Coins(S, lx + 14, GROUND_Y - A2.STEP_H * k - 42, 2, 28);
        last = lx + 85;
      }
      for (let k = steps - 1; k >= 1; k--) {
        const lx = last + 10;
        a2Ledge(S, lx, GROUND_Y - A2.STEP_H * k, 85);
        a2Coins(S, lx + 14, GROUND_Y - A2.STEP_H * k - 42, 1, 0);
        last = lx + 85;
      }
      const gx = last + Math.max(70, Math.round(gap * 0.55));
      a2Ground(S, gx, len || 280);
      a2Coins(S, gx + 40, GROUND_Y - 50, 3, 40);
      S.x = gx + (len || 280);
    },

    // 移动平台跨坑
    mover(S, gap, axis, range, len) {
      const x = S.x + gap;
      const bx = axis === 'x' ? S.x + Math.round(gap * 0.18) : x - 100;
      S.plats.push(mover(bx, 415, 95, axis, range, 0.028, 0));
      a2Coins(S, bx + 18, 366, 2, 28);
      a2Ground(S, x, len);
      a2Coins(S, x + 40, GROUND_Y - 50, 3, 40);
      S.x = x + len;
    },

    // 下坠平台链
    fall(S, gap, len) {
      const x = S.x + gap;
      const f1 = S.x + Math.round(gap * 0.24);
      const f2 = S.x + Math.round(gap * 0.58);
      S.fallPlats.push({ x: f1, y: 420, w: 82 }, { x: f2, y: 392, w: 82 });
      a2Coins(S, f1 + 16, 380, 2, 28);
      a2Coins(S, f2 + 16, 352, 2, 28);
      a2Ground(S, x, len);
      a2Coins(S, x + 40, GROUND_Y - 50, 3, 40);
      S.x = x + len;
    },

    // 单向平台桥（下方是深渊）
    bridge(S, gap, count, len) {
      let bx = S.x + gap;
      for (let i = 0; i < count; i++) {
        const y = 428 - (i % 2) * 22;
        a2Ledge(S, bx, y, 84, true);
        a2Coins(S, bx + 16, y - 40, 2, 26);
        bx += 100;
      }
      const gx = bx + 20;
      a2Ground(S, gx, len);
      a2Coins(S, gx + 40, GROUND_Y - 50, 3, 40);
      S.x = gx + len;
    },

    // 弹跳板 + 隐藏高台
    pad(S, gap, len) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      const px = x + Math.round(len * 0.38);
      S.pads.push({ x: px, y: GROUND_Y, w: 52 });
      const hi = a2High(S, px - 34, GROUND_Y - 158, 112);
      a2Coins(S, hi.x + 18, hi.y - 38, 3, 28);
      if (!S.gem) S.gem = { x: hi.x + 50, y: hi.y - 72 };
      a2Coins(S, x + 30, GROUND_Y - 50,
        Math.min(4, Math.max(2, Math.round(len / 100))), 40);
      S.x = x + len;
    },

    // 纵向单向平台塔（隐藏路线）
    tower(S, gap, len, steps) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      let lx = x + 34;
      let top = null;
      for (let k = 1; k <= steps; k++) {
        top = a2Ledge(S, lx, GROUND_Y - 55 * k, 78, true);
        a2Coins(S, lx + 14, GROUND_Y - 55 * k - 38, 2, 26);
        lx += 80;
      }
      if (top) {
        S.highs.push(top);
        if (!S.gem) S.gem = { x: top.x + 38, y: top.y - 68 };
      }
      S.x = x + len;
    },

    // 尖刺段：上方单向平台可绕行
    spike(S, gap, len, count) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      for (let i = 0; i < (count || 1); i++) {
        const ratio = count > 1 ? 0.28 + 0.44 * i / (count - 1) : 0.42;
        S.spikes.push({
          x: Math.round(x + len * ratio), y: 458, w: 42, h: 12
        });
      }
      a2Ledge(S, x + 24, GROUND_Y - 132, Math.min(150, len - 60), true);
      a2Coins(S, x + 40, GROUND_Y - 172, 3, 30);
      a2Coins(S, x + 40, GROUND_Y - 50, 2, 40);
      S.x = x + len;
    },

    crusher(S, gap, len, count) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      for (let i = 0; i < (count || 1); i++) {
        const ratio = count > 1 ? 0.3 + 0.4 * i / (count - 1) : 0.4;
        a2Trap(S, 'crusher', x + len * ratio - TRAP.CRUSHER_W / 2,
          { phase: i * 30 });
      }
      a2Coins(S, x + 36, GROUND_Y - 50,
        Math.min(4, Math.max(2, Math.round(len / 100))), 40);
      S.x = x + len;
    },

    popspike(S, gap, len, count) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      for (let i = 0; i < (count || 1); i++) {
        const ratio = count > 1 ? 0.3 + 0.4 * i / (count - 1) : 0.4;
        a2Trap(S, 'popspike', x + len * ratio - TRAP.SPIKE_W / 2,
          { phase: i * 24 });
      }
      a2Coins(S, x + 36, GROUND_Y - 50, 3, 40);
      S.x = x + len;
    },

    saw(S, gap, len) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      a2Trap(S, 'saw', x + len * 0.55, { range: 80, speed: 0.034 });
      a2Coins(S, x + 36, GROUND_Y - 50, 3, 40);
      S.x = x + len;
    },

    laser(S, gap, len) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      a2Trap(S, 'laser', x + len * 0.3, { y: GROUND_Y - 76, w: 150 });
      a2Coins(S, x + Math.round(len * 0.3) + 40, GROUND_Y - 120, 3, 30);
      a2Coins(S, x + 36, GROUND_Y - 50, 2, 40);
      S.x = x + len;
    },

    pendulum(S, gap, len) {
      const x = S.x + gap;
      a2Ground(S, x, len);
      a2Trap(S, 'pendulum', x + len * 0.5);
      a2Coins(S, x + 36, GROUND_Y - 50, 2, 40);
      a2Coins(S, x + Math.round(len * 0.5) - 40, GROUND_Y - 150, 2, 30);
      S.x = x + len;
    },

    // Boss 房（Boss 参数取 def.boss）
    arena(S, gap) {
      const x = S.x + gap;
      a2Ground(S, x, 780);
      S.arena = { x: x + 60, y: GROUND_Y - PH };
      const cfg = S.bossDef || { hp: 8, speed: 1.6 };
      S.boss = {
        platform: S.plats.length - 1,
        x: x + 600,
        dir: -1,
        speed: cfg.speed,
        hp: cfg.hp,
        style: cfg.style || 'brute'
      };
      a2Coins(S, x + 40, GROUND_Y - 50, 2, 40);
      S.x = x + 780;
    },

    // 终点旗地面
    finish(S, gap) {
      const x = S.x + gap;
      a2Ground(S, x, 420);
      a2Coins(S, x + 40, GROUND_Y - 50, 3, 40);
      S.x = x + 420;
      S.flagX = S.x - 40;
    }
  };

  // 逐章节拼装一整关，并自动布置检查点 / 收集物 / 敌人
  function buildActTwoLevel(def, index) {
    const S = {
      plats: [], coins: [], spikes: [], traps: [],
      fallPlats: [], pads: [], grounds: [], highs: [],
      x: 0, gem: null, arena: null, boss: null, flagX: null,
      bossDef: def.boss || null
    };
    for (const tok of def.sections) {
      const fn = ACT_SECTIONS[tok[0]];
      if (fn) fn.apply(null, [S].concat(tok.slice(1)));
    }

    const width = Math.max(3000, S.x);

    // ---- 检查点：沿主线地面每 ~1200px 一根，Boss 房与终点前不放 ----
    const limitX = S.arena ? S.arena.x - 120 : width - 500;
    const checkpoints = [];
    let lastCp = -9999;
    for (const g of S.grounds) {
      if (g.x < 900 || g.x > limitX || g.w < 160) continue;
      const cx = g.x + Math.min(Math.round(g.w * 0.32), 180);
      if (cx - lastCp < 1150) continue;
      checkpoints.push({ x: cx, y: g.y });
      lastCp = cx;
      if (checkpoints.length >= 4) break;
    }

    // ---- 爱心：优先放在隐藏高台，不足时补在主线后半段 ----
    const hearts = [];
    for (const h of S.highs) {
      if (hearts.length >= 2) break;
      if (h.x < 1200) continue;
      if (hearts.some((o) => Math.abs(o.x - h.x) < 900)) continue;
      hearts.push({ x: Math.round(h.x + h.w / 2), y: Math.round(h.y - 46) });
    }
    if (hearts.length < 2) {
      for (const g of S.grounds) {
        if (hearts.length >= 2) break;
        if (g.x < 1100 || g.x > width - 600) continue;
        if (S.arena && g.x >= S.arena.x - 100) continue;
        if (hearts.some((o) => Math.abs(o.x - (g.x + g.w / 2)) < 900)) continue;
        hearts.push({ x: g.x + Math.round(g.w * 0.55), y: g.y - 76 });
      }
    }

    // ---- 隐藏宝石：弹跳板高台 / 塔顶 ----
    let gem = null;
    if (S.gem) {
      gem = { x: Math.round(S.gem.x), y: Math.round(S.gem.y) };
    } else if (S.highs.length) {
      const h = S.highs[S.highs.length - 1];
      gem = { x: Math.round(h.x + h.w / 2), y: Math.round(h.y - 66) };
    }

    // ---- 变大果实：中后段地面 ----
    let fruit = null;
    const fruitGrounds = S.grounds.filter((g) =>
      g.w >= 240 && g.x > width * 0.45 && g.x < width * 0.85 &&
      (!S.arena || g.x < S.arena.x - 100));
    if (fruitGrounds.length) {
      const g = fruitGrounds[Math.floor(fruitGrounds.length * 0.4)];
      fruit = { x: Math.round(g.x + g.w * 0.55), y: GROUND_Y - 44 };
    }

    // ---- 敌人：按章节地面均匀分布，种类循环，难度随 tier 提升 ----
    const enemies = [];
    const types = def.types;
    const cap = 8 + def.tier;
    const stopX = S.arena ? S.arena.x - 140 : width - 260;
    let count = 0;
    S.grounds.forEach((g, gi) => {
      if (count >= cap) return;
      if (g.x < 700 || g.x > stopX || g.w < 190) return;
      const per = (def.tier >= 5 ? 2 : 1) +
        (def.tier >= 7 && g.w >= 320 ? 1 : 0);
      for (let k = 0; k < per && count < cap; k++) {
        const span = Math.max(50, g.w - 170);
        enemies.push({
          platform: g.index,
          x: g.x + 70 + ((gi * 47 + k * 113) % span),
          dir: count % 2 === 0 ? 1 : -1,
          speed: Math.round((0.88 + def.tier * 0.05) * 100) / 100,
          type: types[count % types.length],
          elite: def.tier >= 5 && count % 4 === 1
        });
        count++;
      }
    });

    const flag = S.flagX === null ? null
      : { x: Math.round(S.flagX), y: 374, w: 5, h: 96 };
    const flagTrigger = S.flagX === null ? null
      : { x: Math.round(S.flagX) - 24, y: 356, w: 70, h: 114 };

    return {
      name: '第 ' + (index + 1) + ' 关 · ' + def.name,
      tip: def.tip,
      width,
      spawn: { x: 60, y: GROUND_Y - PH },
      platforms: S.plats,
      fallPlats: S.fallPlats,
      pads: S.pads,
      enemies,
      coins: S.coins,
      spikes: S.spikes,
      checkpoints,
      traps: S.traps,
      gems: gem ? [gem] : [],
      hearts,
      fruits: fruit ? [fruit] : [],
      gates: null,
      flag,
      flagTrigger,
      boss: S.boss,
      bossArena: S.arena,
      biome: { ...def.biome },
      enemyTypes: def.types.slice(),
      hints: def.hints.map((h) => ({ x: h.x, y: h.y, text: h.text, seen: false })),
      themeIndex: def.theme
    };
  }

  // 生成并追加第 17~32 关
  for (let i = 0; i < ACT_TWO_DEFS.length; i++) {
    LEVELS.push(buildActTwoLevel(ACT_TWO_DEFS[i], 16 + i));
  }

  // ============================================================

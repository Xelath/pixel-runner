
(() => {
  'use strict';

  // ============================================================
  // 1. 基础配置（所有物理量以“每帧（60Hz）”为单位）
  // ============================================================
  const VIEW = { W: 960, H: 540 };
  const STEP_MS = 1000 / 60;          // 固定时间步长
  const MAX_STEPS = 5;                // 单帧最多追补的物理步数

  const PHYS = {
    GRAVITY: 0.58,                    // 重力加速度
    MAX_FALL: 11,                     // 最大下落速度
    MAX_RUN: 4.7,                     // 水平最大速度
    RUN_ACCEL: 0.62,                  // 地面加速度
    GROUND_FRICTION: 0.72,            // 地面松手减速度
    AIR_ACCEL: 0.42,                  // 空中加速度
    AIR_FRICTION: 0.16,               // 空中松手减速度
    JUMP_VELOCITY: -9.4,              // 第一段跳初速度
    AIR_JUMP_VELOCITY: -8.6,          // 二段跳初速度
    COYOTE_FRAMES: 6,                 // 土狼时间（0.1 秒 = 6 帧，离开平台后仍可起跳）
    JUMP_BUFFER_FRAMES: 6,            // 跳跃缓冲（0.1 秒 = 6 帧，落地前按下可自动起跳）
    MAX_JUMPS: 2,                     // 落地后可用跳跃次数（二段跳）
    START_LIVES: 3,
    INVULN_FRAMES: 90,                // 受伤后的无敌帧
    FALL_DEATH_Y: 640,                // 掉出屏幕底部的死亡线
    STOMP_BOUNCE: -8.0                // 踩头消灭后的弹跳速度
  };

  // 冲刺技能参数
  const DASH = {
    DURATION: 14,                      // 冲刺持续帧数（约 0.23s）
    SPEED: 11,                         // 冲刺速度
    COOLDOWN: 90,                      // 公共冷却（1.5s）
    INVULN: 18,                        // 冲刺无敌帧（0.3s）
    EASE_OUT_FRAMES: 4,                // 末尾减速帧数
    INERTIA_FRAMES: 16,                // 冲刺结束后保留惯性的帧数
    INERTIA_KEEP: 0.68,                // 冲刺结束瞬间保留的速度比例
    INERTIA_FRICTION: 0.22,            // 惯性阶段每帧额外衰减
    INERTIA_MAX_RATIO: 1.4             // 惯性阶段允许的最大常规移速倍数
  };

  const PLAYER_SIZE = { w: 22, h: 34 };
  const ENEMY_SIZE = { w: 26, h: 26 };
  const COIN_SIZE = { w: 16, h: 16 };
  const GEM_SIZE = { w: 18, h: 18 };
  const BOSS_SIZE = { w: 64, h: 64 };
  const BIG_SIZE = { w: 30, h: 44 };   // 吃下变大果实后的碰撞盒

  // 陷阱参数（火球 / 激光 / 捕兽夹）
  const TRAP = {
    FIRE_INTERVAL: 120,   // 火球发射间隔帧数
    FIRE_SPEED: 3.4,      // 火球水平速度
    FIRE_SIZE: 14,        // 火球边长
    LASER_PERIOD: 150,    // 激光完整周期
    LASER_ON: 52,         // 激光开启帧数
    LASER_WARN: 24,       // 开启前的预警帧数
    BEAR_W: 26,           // 捕兽夹宽度
    BEAR_H: 14,
    BEAR_SNAP: 22,        // 夹合动画帧数
    BEAR_COOLDOWN: 150,   // 触发后重新布防帧数
    SAFE_RADIUS: 240,     // 出生点 / 检查点附近不布置陷阱的安全半径
    ARM_RANGE: 760,       // 玩家接近到该距离后陷阱才开始工作
    SAW_W: 30,            // 滚锯碰撞盒
    SAW_RANGE: 90,        // 滚锯左右巡逻半径
    SAW_SPEED: 0.035,     // 滚锯移动速度（角速度）
    PEND_W: 34,           // 摆锤球体碰撞盒
    PEND_PIVOT_Y: 120,    // 摆锤悬挂点高度
    PEND_LEN: 330,        // 摆锤链长
    PEND_AMP: 0.85,       // 摆锤最大摆角（弧度）
    PEND_SPEED: 0.045,    // 摆锤角速度
    // 落锤：周期性从天花板砸下
    CRUSHER_W: 56,
    CRUSHER_H: 46,
    CRUSHER_TOP: 96,      // 悬挂时的顶部 y
    CRUSHER_PERIOD: 190,  // 完整周期帧数
    CRUSHER_WARN: 40,     // 下落前的警示阶段帧数
    // 地刺：周期性从地面弹出
    SPIKE_W: 46,
    SPIKE_H: 18,
    SPIKE_PERIOD: 150,
    SPIKE_WARN: 45        // 弹出前的警示阶段帧数
  };

  // 各难度允许出现的陷阱种类：
  //   休闲 = 捕兽夹 + 滚锯；普通 = 再加摆锤 / 激光 / 落锤 / 地刺；硬核 = 再加火球
  const TRAP_MODES = {
    casual: ['bear', 'saw'],
    normal: ['bear', 'saw', 'pendulum', 'laser', 'crusher', 'popspike'],
    hard:   ['bear', 'saw', 'pendulum', 'laser', 'crusher', 'popspike', 'fire']
  };

  // ------------------------------------------------------------
  // 第五阶段：手感 / 视觉 / 流程优化配置（集中管理，便于微调）
  //    注：重力、跳跃力、土狼时间、缓冲帧数在 PHYS 中
  // ------------------------------------------------------------
  // 手感参数
  const FEEL = {
    JUMP_CUT_VELOCITY: -3.4,   // 跳跃键提前松开时把上升速度截断到此值（短按跳得低）
    LAND_DUST_FALL: 3,         // 落地速度超过该值才触发尘土/落地音效
    AIR_CONTROL_RISE: 1.0,     // 上升阶段的空中水平控制系数
    AIR_CONTROL_FALL: 0.7,     // 下落阶段的空中水平控制系数
    AIR_FRICTION_FALL: 0.7,    // 下落阶段空中松手摩擦系数
    LAND_STUN_FRAMES: 2,       // 落地硬直帧数
    LAND_STUN_DECEL: 0.45,     // 落地瞬间水平速度衰减比例
    LAND_SHAKE_MIN_FALL: 9,    // 触发震屏的最小下落速度
    LAND_SHAKE_MAX: 12,        // 落地震屏最大强度
    EDGE_GRACE: 2,             // 平台边缘支撑容错（px）
    DEATH_MARK_FRAMES: 110,    // 死亡位置虚影显示帧数
    BOSS_KEEP_DAMAGE: 0.5,     // Boss 战重生保留已损失血量的比例
    RUN_DUST_SPEED: 2.4,       // 跑步扬尘触发的最低水平速度
    CEILING_GRACE: 24,         // 撞到平台底部后的短暂无敌帧
    PAD_GRACE: 30              // 弹跳板起跳瞬间的短暂无敌帧
  };

  // 难度配置（只影响数值，不影响收集与存档）
  const DIFFICULTY = {
    casual: { id: 'casual', name: '休闲', lives: 5, enemySpeed: 0.8, checkpointStep: 1 },
    normal: { id: 'normal', name: '普通', lives: 3, enemySpeed: 1.0, checkpointStep: 1 },
    hard:   { id: 'hard',   name: '硬核', lives: 1, enemySpeed: 1.15, checkpointStep: 2 }
  };
  const DIFFICULTY_ORDER = ['casual', 'normal', 'hard'];

  // 胆小鬼模式：设置中开启后大幅降低难度（可与任意难度叠加）
  const COWARD = {
    LIVES: 5,             // 出发 / 重试生命数（直接给满 5 颗心）
    ENEMY_SPEED: 0.55,    // 敌人移速倍率
    BOSS_HP: 0.6,         // Boss 生命倍率（5 → 3）
    BOSS_SPEED: 0.5,      // Boss 移速倍率
    LAVA_SPEED: 0.4,      // 熔岩上涨速度倍率
    INVULN_MUL: 2,        // 受伤无敌帧倍率
    TRAPS_OFF: true,      // 火球 / 激光 / 捕兽夹全部停用
    SPIKES_SAFE: true,    // 尖刺只击退、不扣血
    NO_DAMAGE: true       // 敌人 / Boss 碰撞也不扣心
  };

  // 角色配色皮肤：unlock 为解锁所需宝石数（0 = 默认）
  //    收集宝石会逐步解锁新配色，可在设置中循环切换
  const SKINS = [
    { id: 'classic', name: '经典蓝', unlock: 0,  body: '#3fb6ff', light: '#8adcff', dark: '#2a86c4' },
    { id: 'emerald', name: '翡翠绿', unlock: 3,  body: '#3fd28a', light: '#a6ffd0', dark: '#1f8a5a' },
    { id: 'crimson', name: '烈焰红', unlock: 5,  body: '#ff6b6b', light: '#ffb3b3', dark: '#c23b4a' },
    { id: 'amber',   name: '琥珀金', unlock: 7,  body: '#ffc94a', light: '#ffe8a3', dark: '#c9921f' },
    { id: 'violet',  name: '幽夜紫', unlock: 9,  body: '#b48cff', light: '#dcc7ff', dark: '#7a4fd0' },
    { id: 'frost',   name: '霜青',   unlock: 11, body: '#8fe8f0', light: '#d8fbff', dark: '#4fa8b8' },
    { id: 'magma',   name: '熔岩橙', unlock: 13, body: '#ff9440', light: '#ffc38a', dark: '#c25a1f' },
    { id: 'rose',    name: '樱粉',   unlock: 15, body: '#ff85b3', light: '#ffc2d8', dark: '#c24f7d' }
  ];

  // ------------------------------------------------------------
  // 能力商店：用通关获得的可支配金币购买永久能力
  //    价格按等级递增；bankCoins 只增不减（购买时扣除）
  // ------------------------------------------------------------
  const UPGRADES = [
    { id: 'magnet', name: '金币磁铁', max: 2, prices: [80, 180],
      desc: '自动吸取附近金币 / 宝石（Lv2 范围更大）' },
    { id: 'shield', name: '护盾', max: 1, prices: [120],
      desc: '每次出发或重生额外获得 1 层护盾' },
    { id: 'dash',   name: '冲刺冷却', max: 2, prices: [100, 220],
      desc: '冲刺冷却缩短 15% / 30%' },
    { id: 'jump',   name: '三段跳', max: 1, prices: [180],
      desc: '额外解锁一次空中跳跃' },
    { id: 'vitality', name: '生命强化', max: 2, prices: [90, 200],
      desc: '出发 / 重生多 1 颗心，生命上限 +1（Lv2 再 +1）' },
    { id: 'swift',  name: '疾风之靴', max: 2, prices: [110, 240],
      desc: '移动速度 +6% / +12%，空中控制更稳' },
    { id: 'revive', name: '不屈意志', max: 1, prices: [260],
      desc: '每关首次致命伤害保留 1 颗心' }
  ];
  // 磁铁半径：能力等级 0/1/2
  const MAGNET_RADIUS = [0, 90, 160];

  // 临时道具：每关开始选择 1 个，仅本关（含重试）生效
  const ITEMS = [
    { id: 'shield', name: '护盾', color: '#8adcff', desc: '本关首次受伤免疫' },
    { id: 'slow',   name: '时间减速', color: '#d8c2ff', desc: '敌人 / 陷阱速度 -35%' },
    { id: 'magnet', name: '磁铁', color: '#ffd23f', desc: '吸引附近金币与收集物' },
    { id: 'super',  name: '超级跳', color: '#7ff0a8', desc: '跳跃高度提升约 20%' }
  ];
  const ITEM_MAGNET_RADIUS = 130;   // 临时磁铁道具的吸附半径

  // 无尽模式参数
  const ENDLESS = {
    BASE_WIDTH: 2400,     // 初始房间宽度
    WIDTH_STEP: 50,       // 每深入 1 间加宽
    MAX_WIDTH: 3400,
    ENEMY_CAP: 9,         // 单房间敌人上限
    TRAP_CAP: 5           // 单房间陷阱上限
  };

  // 每关独立配色基调（暖绿 / 土黄 / 灰紫 / 深蓝 / 暗红 / 深黑）
  const THEMES = [
    { name: '暖绿', skyTop: '#8fd0f0', skyBottom: '#6bb9e8', mountain: '#5a8fb0', tree: '#2f7a4d', trunk: '#5a3a22', ambient: '#ffe28a', ambientAlpha: 0.30 },
    { name: '土黄', skyTop: '#e8c58a', skyBottom: '#c99b5c', mountain: '#a1764a', tree: '#7d6231', trunk: '#5a3a22', ambient: '#ffd89a', ambientAlpha: 0.26 },
    { name: '灰紫', skyTop: '#9a86b8', skyBottom: '#6a5a86', mountain: '#6d5c88', tree: '#4f4268', trunk: '#3a2f4a', ambient: '#d8c2ff', ambientAlpha: 0.24 },
    { name: '深蓝', skyTop: '#4f78a8', skyBottom: '#2c4a72', mountain: '#385d80', tree: '#24425e', trunk: '#1c3044', ambient: '#9be2ff', ambientAlpha: 0.26 },
    { name: '暗红', skyTop: '#7a3f4a', skyBottom: '#45232e', mountain: '#5c2f38', tree: '#40222a', trunk: '#2a161c', ambient: '#ff9a8a', ambientAlpha: 0.22 },
    { name: '深黑', skyTop: '#2a2c3a', skyBottom: '#12141c', mountain: '#23252f', tree: '#191b24', trunk: '#101218', ambient: '#cfd8ff', ambientAlpha: 0.20 },
    { name: '熔岩', skyTop: '#6b2a1e', skyBottom: '#2e1210', mountain: '#5a2418', tree: '#42190f', trunk: '#2a1009', ambient: '#ffb066', ambientAlpha: 0.28 },
    { name: '天空', skyTop: '#9ed4ff', skyBottom: '#5ea8e0', mountain: '#6a9ec4', tree: '#3a7d9e', trunk: '#2a4a5c', ambient: '#e8f8ff', ambientAlpha: 0.30 },
    { name: '水晶', skyTop: '#7a6ab8', skyBottom: '#3a2f5e', mountain: '#5a4a8c', tree: '#3a3168', trunk: '#241d40', ambient: '#d8c2ff', ambientAlpha: 0.28 },
    { name: '冰川', skyTop: '#dff2ff', skyBottom: '#8fc8e8', mountain: '#9bc6e0', tree: '#6fa8c4', trunk: '#4a7288', ambient: '#ffffff', ambientAlpha: 0.32 },
    { name: '废墟', skyTop: '#8a7a6a', skyBottom: '#4a3f36', mountain: '#6a5a4c', tree: '#4f4238', trunk: '#332a24', ambient: '#ffe0a0', ambientAlpha: 0.24 },
    { name: '星海', skyTop: '#1a2240', skyBottom: '#080c1a', mountain: '#2a3458', tree: '#1a2340', trunk: '#101628', ambient: '#aaccff', ambientAlpha: 0.34 },
    { name: '熔火', skyTop: '#8a2a1a', skyBottom: '#2a0c08', mountain: '#6a2010', tree: '#4a1408', trunk: '#2a0a04', ambient: '#ff8a3f', ambientAlpha: 0.30 },
    { name: '地宫', skyTop: '#3a4a32', skyBottom: '#141a12', mountain: '#2f3d2a', tree: '#22301e', trunk: '#141c10', ambient: '#b8ff9a', ambientAlpha: 0.26 },
    { name: '极光', skyTop: '#8ad8e8', skyBottom: '#3a7a9e', mountain: '#6aaabc', tree: '#3a7a8c', trunk: '#24505c', ambient: '#d8fffa', ambientAlpha: 0.34 },
    { name: '星核', skyTop: '#2a1a4a', skyBottom: '#0a0612', mountain: '#3a2a5e', tree: '#241a40', trunk: '#140e24', ambient: '#ffd1ff', ambientAlpha: 0.36 }
  ];

  // 关卡内首次机制提示（玩家经过后自动消失）
  const LEVEL_HINTS = [
    [ { x: 340, y: 342, text: '按 Shift 冲刺' },
      { x: 520, y: 300, text: '踩头消灭敌人' } ],
    [ { x: 430, y: 350, text: '尖刺会扣血，跳跃避开' } ],
    [ { x: 690, y: 330, text: '橙色裂纹平台踩上 1 秒后崩塌' },
      { x: 1360, y: 300, text: '弹跳板可弹到高处隐藏区' } ],
    [ { x: 650, y: 320, text: '蓝色单向平台：从下方跳上，S + 跳跃下穿' } ],
    [ { x: 2940, y: 320, text: '上路单向平台 + 下路陷阱，任选其一' } ],
    [ { x: 1960, y: 330, text: 'Boss 会冲撞与落石，半血后狂暴并召唤小怪' } ],
    [ { x: 360, y: 330, text: '熔岩尖刺密布，善用升降平台跨越' } ],
    [ { x: 320, y: 310, text: '天空回廊：单向云台只能从下方跳上' } ],
    [ { x: 330, y: 320, text: '水晶洞窟：弹跳板可到达隐藏宝石' } ],
    [ { x: 330, y: 320, text: '冰川峡谷：单向冰台只能从下方跳上' } ],
    [ { x: 330, y: 320, text: '废弃工厂：冲锋怪靠近时会突然加速' } ],
    [ { x: 330, y: 320, text: '星海终章：尖刺怪无法踩头，请用冲刺绕行' } ],
    [ { x: 330, y: 320, text: '熔火核心：火球与激光密集，注意观察节奏' } ],
    [ { x: 330, y: 320, text: '幽暗地宫：下坠平台与捕兽夹遍布' } ],
    [ { x: 330, y: 320, text: '极光冰原：冰台与升降台交错，小心激光' } ],
    [ { x: 330, y: 320, text: '星核终局：所有陷阱与怪物同时登场' } ]
  ];

  // 每关隐藏宝石位置（需借助弹跳板 / 升降平台 / 二段跳到达）
  const GEM_SPOTS = [
    { x: 1085, y: 285 },   // 第 1 关：升降平台上方
    { x: 2630, y: 250 },   // 第 2 关：隐藏高台
    { x: 1550, y: 195 },   // 第 3 关：弹跳板隐藏区
    { x: 1390, y: 245 },   // 第 4 关：弹跳板隐藏区
    { x: 3820, y: 190 },   // 第 5 关：弹跳板隐藏区（后段）
    { x: 1500, y: 195 },   // 第 6 关：弹跳板隐藏区
    { x: 1530, y: 245 },   // 第 7 关：熔岩地窟隐藏高台
    { x: 1690, y: 240 },   // 第 8 关：天空回廊隐藏高台
    { x: 2450, y: 245 },   // 第 9 关：水晶洞窟隐藏高台
    { x: 1690, y: 245 },   // 第 10 关：冰川峡谷
    { x: 2370, y: 245 },   // 第 11 关：废弃工厂
    { x: 2770, y: 245 },   // 第 12 关：星海终章
    { x: 1220, y: 245 },   // 第 13 关：熔火核心
    { x: 4010, y: 245 },   // 第 14 关：幽暗地宫
    { x: 2850, y: 245 },   // 第 15 关：极光冰原
    { x: 3860, y: 285 }    // 第 16 关：星核终局
  ];

  // 每关爱心拾取位置（捡到 +1 颗心，最多 5 颗）
  const HEART_SPOTS = [
    [ { x: 1240, y: 300 }, { x: 2560, y: 270 } ],
    [ { x: 1220, y: 285 }, { x: 3260, y: 315 } ],
    [ { x: 1520, y: 210 }, { x: 3320, y: 240 } ],
    [ { x: 900, y: 250 }, { x: 2600, y: 295 } ],
    [ { x: 1010, y: 335 }, { x: 2680, y: 335 } ],
    [ { x: 1290, y: 415 }, { x: 2140, y: 325 } ],
    [ { x: 340, y: 345 }, { x: 2150, y: 305 } ],
    [ { x: 640, y: 235 }, { x: 2490, y: 355 } ],
    [ { x: 640, y: 235 }, { x: 2650, y: 295 } ],
    [ { x: 450, y: 330 }, { x: 2990, y: 310 } ],
    [ { x: 540, y: 340 }, { x: 3100, y: 300 } ],
    [ { x: 470, y: 270 }, { x: 2960, y: 250 } ],
    [ { x: 1100, y: 330 }, { x: 2700, y: 330 } ],
    [ { x: 940, y: 330 }, { x: 2500, y: 300 } ],
    [ { x: 330, y: 360 }, { x: 3850, y: 300 } ],
    [ { x: 450, y: 270 }, { x: 3880, y: 290 } ]
  ];

  // 每关陷阱布置（前半段坐标，后半段镜像复制）
  // 五种陷阱：fire 火球发射口 / laser 周期激光 / bear 捕兽夹 / saw 滚锯 / pendulum 摆锤
  // 难度分配：休闲仅捕兽夹；普通无火球；火球只在硬核模式出现
  // 关卡递进：第 1 关无陷阱，第 2-3 关捕兽夹，第 4 关火球（仅硬核），第 5 关激光
  const LEVEL_TRAPS = [
    [],
    [ { kind: 'bear', x: 2350 } ],
    [ { kind: 'bear', x: 2350 }, { kind: 'bear', x: 3150 } ],
    [ { kind: 'bear', x: 2200 }, { kind: 'fire', x: 3150, dir: -1 } ],
    [ { kind: 'bear', x: 2700 }, { kind: 'laser', x: 1860, y: 300, w: 150 } ],
    [ { kind: 'bear', x: 1450 }, { kind: 'fire', x: 2500, dir: -1 }, { kind: 'laser', x: 1850, y: 340, w: 140 } ],
    [ { kind: 'bear', x: 2000 }, { kind: 'fire', x: 3000, dir: -1 }, { kind: 'laser', x: 150, y: 340, w: 140 } ],
    [ { kind: 'bear', x: 2550 }, { kind: 'fire', x: 3400, dir: -1 }, { kind: 'laser', x: 1380, y: 330, w: 150 } ],
    [ { kind: 'bear', x: 1800 }, { kind: 'fire', x: 3000, dir: -1 }, { kind: 'laser', x: 2580, y: 300, w: 140 } ],
    [ { kind: 'bear', x: 900 }, { kind: 'fire', x: 2100, dir: 1 }, { kind: 'laser', x: 3100, y: 320, w: 150 } ],
    [ { kind: 'bear', x: 800 }, { kind: 'fire', x: 3400, dir: -1 }, { kind: 'laser', x: 2800, y: 330, w: 140 } ],
    [ { kind: 'bear', x: 1450 }, { kind: 'fire', x: 3400, dir: -1 }, { kind: 'laser', x: 1700, y: 320, w: 150 } ],
    [ { kind: 'bear', x: 1900 }, { kind: 'bear', x: 3400 }, { kind: 'fire', x: 2760, dir: -1 }, { kind: 'laser', x: 1400, y: 320, w: 140 } ],
    [ { kind: 'bear', x: 1700 }, { kind: 'bear', x: 4000 }, { kind: 'fire', x: 3980, dir: -1 }, { kind: 'laser', x: 2500, y: 300, w: 150 } ],
    [ { kind: 'bear', x: 2200 }, { kind: 'bear', x: 4300 }, { kind: 'fire', x: 3580, dir: -1 }, { kind: 'laser', x: 1200, y: 320, w: 150 } ],
    [ { kind: 'bear', x: 2250 }, { kind: 'bear', x: 4300 }, { kind: 'fire', x: 3680, dir: -1 }, { kind: 'laser', x: 1300, y: 320, w: 150 }, { kind: 'laser', x: 3000, y: 300, w: 160 } ]
  ];

  // 每关变大果实位置（吃下后变大，受伤一次变小）
  const FRUIT_SPOTS = [
    { x: 1160, y: 300 }, { x: 2900, y: 330 }, { x: 2440, y: 330 },
    { x: 1020, y: 300 }, { x: 2740, y: 330 }, { x: 1470, y: 250 },
    { x: 1250, y: 310 }, { x: 930, y: 250 }, { x: 620, y: 250 },
    { x: 1740, y: 320 }, { x: 940, y: 330 }, { x: 1860, y: 250 },
    { x: 2740, y: 300 }, { x: 3500, y: 300 }, { x: 3980, y: 300 },
    { x: 3900, y: 290 }
  ];

  // 环境机制补充参数：黑暗视野 / 熔岩上涨
  const DARK = {
    ALPHA: 0.86,          // 黑暗遮罩不透明度
    LIGHT: 150            // 玩家周围可视半径
  };
  const LAVA = {
    DEFAULT_SPEED: 0.03,  // 熔岩每帧上升像素
    RESERVED: 600
  };

  // 每关环境机制：ice 冰面打滑 / wind 空中风力 / dark 黑暗视野 / lava 熔岩上涨
  const BIOME_BY_LEVEL = [
    {}, {}, {}, {}, {}, {},
    { lava: { start: 560, cap: 500, speed: 0.03 } },
    { wind: 0.045 }, {}, { ice: true }, {},
    { wind: -0.035 },
    { lava: { start: 550, cap: 480, speed: 0.035 } },
    { dark: true }, { ice: true, wind: 0.03 },
    { wind: -0.05, dark: true }
  ];

  // 机关门：门体与开关（后半段镜像复制）
  const GATES_BY_LEVEL = [
    null, null, null, null, null, null, null, null, null, null,
    { x: 3000, y: 390, w: 20, h: 80, switch: { x: 2920, y: 430, w: 26, h: 40 } },
    null, null,
    { x: 3600, y: 390, w: 20, h: 80, switch: { x: 3500, y: 430, w: 26, h: 40 } },
    null,
    { x: 2300, y: 390, w: 20, h: 80, switch: { x: 2220, y: 430, w: 26, h: 40 } }
  ];
  const ENEMY_TYPES_BY_LEVEL = [
    ['walker'], ['walker'],
    ['walker', 'hopper'],
    ['walker', 'charger', 'hopper'],
    ['walker', 'charger', 'hopper', 'flyer'],
    ['walker', 'charger', 'hopper', 'flyer'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky', 'shooter'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky', 'armored'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky', 'ghost', 'shooter'],
    ['walker', 'charger', 'hopper', 'flyer', 'spiky', 'ghost', 'shooter', 'armored']
  ];

  // 怪物图鉴数据：threat 为威胁星级（1~3），first 为首次登场关卡号（1 起）
  const BESTIARY = [
    { id: 'walker',   name: '红角小怪', threat: 1, first: 1,
      desc: '平台来回巡逻，可踩头消灭' },
    { id: 'hopper',   name: '弹跳史莱姆', threat: 1, first: 3,
      desc: '周期蓄力起跳，落点飘忽' },
    { id: 'charger',  name: '冲锋兽', threat: 2, first: 4,
      desc: '靠近时突然加速冲撞' },
    { id: 'flyer',    name: '蝠翼飞行怪', threat: 2, first: 5,
      desc: '空中悬浮巡逻，居高临下' },
    { id: 'spiky',    name: '钢刺怪', threat: 2, first: 7,
      desc: '头顶尖刺，无法踩头' },
    { id: 'shooter',  name: '炮台怪', threat: 3, first: 13,
      desc: '原地架炮，定时发射弹体' },
    { id: 'armored',  name: '铁甲怪', threat: 3, first: 14,
      desc: '双层护甲，需要连踩两次' },
    { id: 'ghost',    name: '幽影', threat: 3, first: 15,
      desc: '穿墙透体，缓慢追踪玩家' }
  ];

  // Boss 图鉴：id 与关卡内 Boss 的 style 一致
  const BOSS_BESTIARY = [
    { id: 'brute',    name: '岩角领主', threat: 3, first: 6,
      desc: '冲撞与落石交替，半血狂暴召唤小怪。' },
    { id: 'guardian', name: '暗星守卫', threat: 3, first: 24,
      desc: '冲锋与震地波连击，半血进入狂暴。' },
    { id: 'core',     name: '终焉星核', threat: 3, first: 32,
      desc: '弹幕与光柱齐发，击败后终点才出现。' }
  ];

  // 音频参数
  const AUDIO = {
    MASTER_VOLUME: 0.9,        // 总音量
    MUSIC_VOLUME: 0.22,        // 背景音乐音量（已调低，避免盖过音效）
    BEAT: 0.16                 // 背景音乐每拍时长（秒）
  };

  // 本地存档键名
  const STORAGE_KEY = 'pixelRunnerSave_v1';

  // 粒子参数
  const PARTICLES = {
    CAP: 220,                  // 粒子上限（防止低配设备过载）
    COIN: 8,                   // 金币爆散粒数
    ENEMY: 10,                 // 敌人碎块粒数
    DUST: 6,                   // 落地尘土粒数
    BOSS: 26                   // Boss 击败爆散粒数
  };

  // 触控虚拟按键尺寸
  const TOUCH = {
    BTN: 78,                   // 方向/跳跃按钮边长
    SMALL: 70,                 // 冲刺按钮边长
    MARGIN: 20,                // 距屏幕边缘
    GAP: 14                    // 按钮间距
  };

  // ------------------------------------------------------------
  // 第四阶段：关卡扩充配置（关卡长度、元素属性集中管理）
  // ------------------------------------------------------------
  const LEVEL_COUNT = 32;             // 关卡总数（16 关本体 + 16 关第二篇章）
  const GROUND_Y = 470;               // 标准地面顶部 y 坐标
  const HEART_CAP = 5;                // 生命上限（爱心拾取最多补到 5 颗心）

  // 检查点参数
  const CHECKPOINT = {
    POLE_H: 72,                       // 旗杆高度
    TRIGGER_W: 56,                    // 触发区域宽度
    TRIGGER_H: 88,                    // 触发区域高度
    // 检查点快照字段（死亡重生时回滚的内容）
    SNAPSHOT_COINS: true,             // 快照本关金币数 + 每枚金币收集状态
    SNAPSHOT_ENEMIES: true            // 快照敌人位置 / 朝向 / 存活状态
  };

  // 新交互元素 / Boss 二阶段参数
  const MECH = {
    BOUNCE_VELOCITY: -15.5,           // 弹跳板弹起速度（约普通跳跃的 1.65 倍）
    PAD_SQUASH_FRAMES: 18,            // 弹跳板压缩-弹起动画帧数
    PAD_COOLDOWN: 12,                 // 弹跳板重复触发冷却帧数
    FALL_DELAY: 60,                   // 下坠平台被踩上后 60 帧（1 秒）开始消失
    FALL_FADE: 18,                    // 下坠平台消失动画帧数
    FALL_RESPAWN: 100,                // 消失后重新出现所需帧数
    DROP_THROUGH_FRAMES: 14,          // 单向平台下穿时忽略碰撞的帧数
    DROP_THROUGH_VY: 1.5,             // 下穿瞬间的初始下落速度
    SUMMON_INTERVAL: 150,             // Boss 二阶段召唤小怪的间隔帧数
    SUMMON_CAP: 3,                    // Boss 二阶段同时存在的召唤物上限
    BOSS_PHASE2_SPEED: 1.5,           // Boss 二阶段速度倍率
    PLATFORM_SNAP: 3,                 // 平台顶部吸附容差（px，抵消升降平台的浮点间隙）
    MOVER_EASE_POWER: 0.78            // 移动平台端点缓动（<1 使平台在端点停留更久）
  };

  // Boss 攻击节奏（style: brute / guardian / core）
  const BOSS_MECH = {
    // 岩角领主（第一篇章 Boss）：冲撞 + 落石
    BRUTE_FIRST: 240,
    BRUTE_INTERVAL: 320,
    BRUTE_INTERVAL_P2: 220,
    BRUTE_WINDUP: 40,
    BRUTE_CHARGE: 30,
    BRUTE_CHARGE_SPEED: 4.2,
    BRUTE_RECOVER: 44,
    BRUTE_ROCK_SPEED: 3.2,
    BRUTE_ROCK_LIFE: 150,
    // 暗星守卫：冲撞 + 震地波
    GUARD_FIRST: 180,                 // 进入 Boss 房后的首次攻击延迟
    GUARD_INTERVAL: 210,              // 常规攻击间隔
    GUARD_INTERVAL_P2: 150,           // 狂暴后攻击间隔
    GUARD_WINDUP: 34,                 // 冲撞 / 震地前的蓄力帧
    GUARD_DASH: 34,                   // 冲撞持续帧
    GUARD_DASH_SPEED: 5.2,            // 冲撞速度
    GUARD_RECOVER: 34,                // 攻击后硬直帧
    GUARD_WAVE_SPEED: 3.3,            // 震地波水平速度
    GUARD_WAVE_LIFE: 120,             // 震地波存活帧
    // 终焉星核：星核弹幕 + 核心光柱
    CORE_FIRST: 150,
    CORE_INTERVAL: 160,
    CORE_INTERVAL_P2: 110,
    CORE_VOLLEY_WINDUP: 30,           // 弹幕蓄力
    CORE_VOLLEY_RECOVER: 36,
    CORE_ORB_SPEED: 3.6,              // 弹幕速度
    CORE_BEAM_WINDUP: 46,             // 光柱预警帧
    CORE_BEAM_ON: 42,                 // 光柱持续帧
    CORE_BEAM_RECOVER: 34,            // 光柱后硬直
    CORE_BEAM_W: 44                   // 光柱宽度
  };

  // ============================================================

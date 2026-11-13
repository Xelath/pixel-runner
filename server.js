'use strict';
/**
 * 像素跳跃 · 多人联机中继服务器
 *  - 同端口托管 index.html + WebSocket（/ws），局域网 / 外网隧道都只需这一个端口
 *  - 房间码加入，最多 4 人，无账号
 *  - 房主浏览器跑完整模拟并广播快照，服务器只做房间管理与消息转发
 *
 * 启动：node server.js（默认端口 8787，可用 PORT 环境变量覆盖）
 * 外网：cloudflared tunnel --url http://localhost:8787
 *       或 ngrok http 8787
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = 4;
const MAX_MSG_BYTES = 200 * 1024;
const RECONNECT_GRACE_MS = 30000;   // 掉线后保留席位的时间
const EMPTY_ROOM_GRACE_MS = 60000;  // 全员掉线后房间保留时间
const INDEX_FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  let pathname = '/';
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (e) {}
  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(INDEX_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('index.html 未找到，请把 server.js 与 index.html 放在同一目录');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
    return;
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server, path: '/ws' });
// code -> { code, members:[{ws,name,ready,token,online,disconnectTimer}], started, level }
const rooms = new Map();

function makeToken() {
  return crypto.randomBytes(8).toString('hex');
}

function send(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略已断开的连接 */ }
}

function broadcast(room, obj) {
  for (const m of room.members) {
    if (m.online === false) continue;
    send(m.ws, obj);
  }
}

function roomState(room, ws, memberIdx) {
  const you = memberIdx !== undefined ? memberIdx : findMember(room, ws);
  return {
    t: 'room',
    code: room.code,
    hostId: 0,
    started: room.started,
    hostAway: !!room.hostAway,
    you,
    token: you >= 0 && room.members[you] ? room.members[you].token : undefined,
    members: room.members.map((m, i) => ({
      id: i, name: m.name, ready: !!m.ready,
      online: m.online !== false,
      ms: (m.online !== false && m.ws && Number.isFinite(m.ws.rtt))
        ? Math.round(m.ws.rtt) : null,
      j: (m.online !== false && m.ws && Number.isFinite(m.ws.jitter))
        ? Math.round(m.ws.jitter) : null
    }))
  };
}

function broadcastRoom(room) {
  for (let i = 0; i < room.members.length; i++) {
    const m = room.members[i];
    if (m.online === false) continue;
    send(m.ws, roomState(room, m.ws, i));
  }
}

// 应用层延迟测量：服务器向每个连接发 lagPing，客户端原样回 ts，服务器算 RTT
function broadcastLag(room) {
  const list = room.members.map((m, i) => ({
    id: i,
    ms: (m.online !== false && m.ws && Number.isFinite(m.ws.rtt))
      ? Math.round(m.ws.rtt) : null,
    j: (m.online !== false && m.ws && Number.isFinite(m.ws.jitter))
      ? Math.round(m.ws.jitter) : null
  }));
  broadcast(room, { t: 'lag', list });
}

function newRoomCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return null;
}

function sanitizeName(name) {
  const n = String(name || '').trim().slice(0, 8);
  return n || '玩家';
}

function findMember(room, ws) {
  return room.members.findIndex((m) => m.ws === ws);
}

function clearRoomTimers(room) {
  if (room.emptyTimer) { clearTimeout(room.emptyTimer); room.emptyTimer = null; }
  if (room.hostTimer) { clearTimeout(room.hostTimer); room.hostTimer = null; }
  for (const m of room.members) {
    if (m.disconnectTimer) { clearTimeout(m.disconnectTimer); m.disconnectTimer = null; }
  }
}

function closeRoom(room, reason) {
  clearRoomTimers(room);
  for (const m of room.members) {
    if (!m.ws) continue;
    m.ws.roomCode = null;
    send(m.ws, { t: 'closed', reason });
  }
  rooms.delete(room.code);
}

function scheduleEmptyCleanup(room) {
  if (room.emptyTimer) return;
  room.emptyTimer = setTimeout(() => {
    room.emptyTimer = null;
    if (room.members.every((m) => m.online === false)) {
      closeRoom(room, '房间已关闭');
    }
  }, EMPTY_ROOM_GRACE_MS);
}

function removeMember(room, idx, reason) {
  if (idx < 0 || !room.members[idx]) return;
  // 房主离开 / 长时间掉线：整个房间关闭
  if (idx === 0) {
    closeRoom(room, reason || '房主已离开，房间关闭');
    return;
  }
  const member = room.members[idx];
  if (member.disconnectTimer) {
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
  }
  room.members.splice(idx, 1);

  if (room.started) {
    // 对局中队友彻底掉线：本局中止，所有人回到房间
    room.started = false;
    for (const m of room.members) m.ready = false;
    broadcast(room, { t: 'abort', reason: reason || '有队友离开，本局已结束' });
  }
  broadcastRoom(room);
  if (room.members.length === 0) {
    closeRoom(room, '房间已关闭');
  } else if (room.members.every((m) => m.online === false)) {
    scheduleEmptyCleanup(room);
  }
}

function removeFromRoom(ws) {
  const code = ws.roomCode;
  if (!code) return;
  ws.roomCode = null;
  const room = rooms.get(code);
  if (!room) return;
  const idx = findMember(room, ws);
  if (idx < 0) return;
  removeMember(room, idx, '已离开房间');
}

// 连接意外断开：先保留席位，等待客户端用 token 重连
function handleDisconnect(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const idx = findMember(room, ws);
  if (idx < 0) return;
  ws.roomCode = null;
  const member = room.members[idx];
  member.online = false;
  member.ws = null;
  if (idx === 0) room.hostAway = false;
  broadcastRoom(room);

  if (room.members.every((m) => m.online === false)) {
    scheduleEmptyCleanup(room);
    return;
  }
  if (idx === 0) {
    if (!room.hostTimer) {
      room.hostTimer = setTimeout(() => {
        room.hostTimer = null;
        const host = room.members[0];
        if (host && host.online === false) {
          closeRoom(room, '房主长时间未重连，房间已关闭');
        }
      }, RECONNECT_GRACE_MS);
    }
  } else {
    member.disconnectTimer = setTimeout(() => {
      member.disconnectTimer = null;
      if (member.online === false) {
        const i = room.members.indexOf(member);
        removeMember(room, i, '队友长时间未重连');
      }
    }, RECONNECT_GRACE_MS);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.rtt = null;               // 应用层往返延迟（毫秒）
  ws.lastRtt = null;           // 上一次 RTT，用于估算抖动
  ws.jitter = 0;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > MAX_MSG_BYTES) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;

    // ---- 延迟测量回包 ----
    if (msg.t === 'lagPong') {
      const sent = Number(msg.ts);
      if (Number.isFinite(sent)) {
        const rtt = Math.max(0, Date.now() - sent);
        // 抖动：相邻 RTT 变化量的指数平滑
        if (ws.lastRtt !== null) {
          const d = Math.abs(rtt - ws.lastRtt);
          ws.jitter = Math.round(ws.jitter * 0.7 + d * 0.3);
        }
        ws.lastRtt = rtt;
        // 指数平滑，避免单次抖动造成数字乱跳
        ws.rtt = ws.rtt === null ? rtt : Math.round(ws.rtt * 0.65 + rtt * 0.35);
      }
      const lagRoom = ws.roomCode ? rooms.get(ws.roomCode) : null;
      if (lagRoom) broadcastLag(lagRoom);
      return;
    }

    // ---- 用 token 重连（掉线后保留席位 30 秒）----
    if (msg.t === 'rejoin') {
      if (ws.roomCode) return;
      const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
      const room = rooms.get(code);
      if (!room) {
        send(ws, { t: 'error', msg: '房间已关闭，无法重连', rejoin: true });
        return;
      }
      const token = String(msg.token || '');
      const idx = room.members.findIndex((m) => m.token === token);
      if (idx < 0) {
        send(ws, { t: 'error', msg: '重连凭证无效', rejoin: true });
        return;
      }
      const member = room.members[idx];
      if (member.online && member.ws && member.ws !== ws) {
        const old = member.ws;
        old.roomCode = null;
        try { old.close(); } catch (e) {}
      }
      if (member.disconnectTimer) {
        clearTimeout(member.disconnectTimer);
        member.disconnectTimer = null;
      }
      if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
        room.emptyTimer = null;
      }
      if (idx === 0 && room.hostTimer) {
        clearTimeout(room.hostTimer);
        room.hostTimer = null;
      }
      member.ws = ws;
      member.online = true;
      ws.roomCode = code;
      if (idx === 0) room.hostAway = false;
      send(ws, {
        t: 'resumed', code, you: idx, role: idx === 0 ? 'host' : 'guest',
        started: room.started, level: room.level || 0,
        partySize: room.members.length
      });
      broadcastRoom(room);
      // 对局中重连：让房主补一份全量快照给所有人
      if (room.started) {
        const host = room.members[0];
        if (host && host.online && host.ws) send(host.ws, { t: 'resyncReq' });
      }
      console.log('[房间 ' + code + '] ' + member.name + ' 重连成功');
      return;
    }

    // ---- 创建房间 ----
    if (msg.t === 'create') {
      if (ws.roomCode) { send(ws, { t: 'error', msg: '你已经在房间中' }); return; }
      const code = newRoomCode();
      if (!code) { send(ws, { t: 'error', msg: '房间已满，请稍后再试' }); return; }
      const room = {
        code,
        members: [{
          ws, name: sanitizeName(msg.name), ready: false,
          token: makeToken(), online: true, disconnectTimer: null
        }],
        started: false, level: 0, emptyTimer: null, hostTimer: null,
        hostAway: false
      };
      rooms.set(code, room);
      ws.roomCode = code;
      send(ws, { t: 'lagPing', ts: Date.now() });   // 尽快测出首个延迟
      broadcastRoom(room);
      console.log('[房间 ' + code + '] 创建，房主：' + room.members[0].name);
      return;
    }

    // ---- 加入房间 ----
    if (msg.t === 'join') {
      if (ws.roomCode) { send(ws, { t: 'error', msg: '你已经在房间中' }); return; }
      const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
      const room = rooms.get(code);
      if (!room) { send(ws, { t: 'error', msg: '房间码不存在或已关闭' }); return; }
      if (room.started) { send(ws, { t: 'error', msg: '该房间对局已开始' }); return; }
      if (room.members.length >= MAX_PLAYERS) {
        send(ws, { t: 'error', msg: '房间已满（最多 ' + MAX_PLAYERS + ' 人）' });
        return;
      }
      room.members.push({
        ws, name: sanitizeName(msg.name), ready: false,
        token: makeToken(), online: true, disconnectTimer: null
      });
      ws.roomCode = code;
      send(ws, { t: 'lagPing', ts: Date.now() });
      broadcastRoom(room);
      console.log('[房间 ' + code + '] ' + sanitizeName(msg.name) +
        ' 加入（' + room.members.length + '/' + MAX_PLAYERS + '）');
      return;
    }

    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (!room) {
      if (msg.t !== 'leave') send(ws, { t: 'error', msg: '请先创建或加入房间' });
      return;
    }
    const idx = findMember(room, ws);
    const isHost = idx === 0;

    // ---- 离开房间 ----
    if (msg.t === 'leave') {
      removeFromRoom(ws);
      send(ws, { t: 'closed', reason: '已离开房间' });
      return;
    }

    // ---- 房主关闭房间 ----
    if (msg.t === 'close') {
      if (!isHost) return;
      closeRoom(room, String(msg.reason || '房主已关闭房间'));
      return;
    }

    // ---- 准备 / 取消准备（房主默认已准备）----
    if (msg.t === 'ready') {
      if (isHost || idx < 0 || room.started) return;
      room.members[idx].ready = !!msg.ready;
      broadcastRoom(room);
      return;
    }

    // ---- 房主移出大厅成员 ----
    if (msg.t === 'kick') {
      if (!isHost || room.started) return;
      const id = Number(msg.id);
      if (!Number.isInteger(id) || id < 1 || id >= room.members.length) return;
      const target = room.members[id];
      if (target.disconnectTimer) {
        clearTimeout(target.disconnectTimer);
        target.disconnectTimer = null;
      }
      target.online = false;
      if (target.ws) {
        target.ws.roomCode = null;
        send(target.ws, { t: 'closed', reason: '你已被房主移出房间' });
      }
      room.members.splice(id, 1);
      broadcastRoom(room);
      console.log('[房间 ' + room.code + '] 房主移出 ' + target.name);
      return;
    }

    // ---- 客人请求暂停（房主裁决）----
    if (msg.t === 'pauseReq') {
      if (isHost || !room.started) return;
      const host = room.members[0];
      if (host && host.online && host.ws) {
        send(host.ws, {
          t: 'pauseReq', from: idx,
          name: room.members[idx] ? room.members[idx].name : ''
        });
      }
      return;
    }

    // ---- 房主开始游戏 ----
    if (msg.t === 'start') {
      if (!isHost) { send(ws, { t: 'error', msg: '只有房主可以开始' }); return; }
      if (room.started) return;
      if (room.members.length < 2) {
        send(ws, { t: 'error', msg: '至少需要 2 人才能开始' });
        return;
      }
      if (room.members.some((m, i) => i !== 0 && !m.ready)) {
        send(ws, { t: 'error', msg: '还有队友未准备' });
        return;
      }
      room.started = true;
      room.hostAway = false;
      const level = Math.max(0, Math.min(31, Number(msg.level) || 0));
      room.level = level;
      broadcast(room, { t: 'start', level, partySize: room.members.length });
      console.log('[房间 ' + room.code + '] 开始游戏，' + room.members.length + ' 人');
      return;
    }

    // ---- 客人输入 -> 转发给房主 ----
    if (msg.t === 'in') {
      if (isHost || !room.started) return;
      send(room.members[0].ws, { t: 'in', from: idx, input: msg.input });
      return;
    }

    // ---- 房主切后台 / 返回前台 -> 通知客人暂停等待 ----
    if (msg.t === 'hostAway') {
      if (!isHost) return;
      room.hostAway = !!msg.away;
      for (let i = 1; i < room.members.length; i++) {
        if (room.members[i].online === false) continue;
        send(room.members[i].ws, { t: 'hostAway', away: room.hostAway });
      }
      return;
    }

    // ---- 房主世界快照 -> 广播给客人 ----
    if (msg.t === 'snap') {
      if (!isHost || !room.started) return;
      if (msg.snap && Number.isFinite(msg.snap.level)) room.level = msg.snap.level;
      const payload = { t: 'snap', snap: msg.snap };
      for (let i = 1; i < room.members.length; i++) {
        if (room.members[i].online === false) continue;
        send(room.members[i].ws, payload);
      }
      return;
    }

    // ---- 房主中止本局 / 重置准备状态 ----
    if (msg.t === 'abort') {
      if (!isHost) return;
      room.started = false;
      for (const m of room.members) m.ready = false;
      broadcast(room, { t: 'abort', reason: String(msg.reason || '房主结束了本局') });
      broadcastRoom(room);
      return;
    }
    if (msg.t === 'reset') {
      if (!isHost) return;
      room.started = false;
      for (const m of room.members) m.ready = false;
      broadcastRoom(room);
      return;
    }
  });

  // 意外断开：保留席位等待 token 重连（主动 leave 已清空 roomCode）
  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => { /* 忽略连接错误，close 会统一清理 */ });
});

// 心跳：清理半开连接
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch (e) {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 20000);

// 每 2 秒测一次延迟：服务器发 lagPing，客户端回 lagPong，结果按房间广播
const lagTimer = setInterval(() => {
  const ts = Date.now();
  for (const room of rooms.values()) {
    for (const m of room.members) {
      if (m.online === false) continue;
      send(m.ws, { t: 'lagPing', ts });
    }
  }
}, 2000);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(lagTimer);
});

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，请关闭占用程序或用 PORT=xxxx node server.js 换端口。');
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('');
  console.log('  像素跳跃 · 多人联机服务器已启动');
  console.log('  ------------------------------------------');
  console.log('  本机访问：http://localhost:' + PORT);
  for (const ip of ips) console.log('  局域网：  http://' + ip + ':' + PORT);
  console.log('');
  console.log('  外网朋友加入（任选其一，在同目录新开终端）：');
  console.log('    cloudflared tunnel --url http://localhost:' + PORT);
  console.log('    ngrok http ' + PORT);
  console.log('  把生成的 https 地址发给朋友，房间码保持一致。');
  console.log('  ------------------------------------------');
  console.log('');
});

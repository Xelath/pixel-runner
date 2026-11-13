'use strict';
/**
 * 单文件构建脚本
 *  - 源码按功能拆在 src/ 下，构建时按固定顺序拼接回单文件 index.html
 *  - 日常修改请改 src/ 内的分块，改完执行：node build.js（或 npm run build）
 *  - index.html 是生成产物，直接改它会在下次构建时被覆盖
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const TEMPLATE = path.join(SRC, 'index.template.html');
const MARK = '/* @@GAME_CODE@@ */';

// 拼接顺序固定：配置 → 关卡 → 通用 → 输入 → 关卡运行时 → 世界 → 游戏 → 联机 → 渲染 → 启动
const FILES = [
  '01-config.js',
  '02-levels.js',
  '03-core.js',
  '04-input.js',
  '05-level.js',
  '06-world.js',
  '07-game.js',
  '08-net.js',
  '09-render.js',
  '10-main.js'
];

const template = fs.readFileSync(TEMPLATE, 'utf8');
if (!template.includes(MARK)) {
  throw new Error('模板缺少占位符 ' + MARK);
}
const code = FILES
  .map((name) => fs.readFileSync(path.join(SRC, name), 'utf8'))
  .join('');
const out = template.replace(MARK, () => code);

// 基础完整性检查，避免拼错顺序后生成一个打不开的页面
if (!out.includes('(() => {') || !out.trimEnd().endsWith('</html>')) {
  throw new Error('构建结果不完整，请检查 src/ 分块与模板');
}

fs.writeFileSync(path.join(ROOT, 'index.html'), out, 'utf8');
console.log('构建完成 → index.html（' + out.length + ' 字节）');

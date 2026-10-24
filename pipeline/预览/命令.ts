import { createRequire } from 'node:module';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 前台跑 } from '../环境/子进程.ts';
import { 新建预览目录 } from './预览.ts';

/** Remotion CLI 的 js 入口：用 node 直接跑，不经 npx（Windows 上 npx 是 .cmd） */
const remotion入口 = () => {
  const 包 = createRequire(path.join(代码根(), 'package.json')).resolve('@remotion/cli/package.json');
  return path.join(path.dirname(包), 'remotion-cli.js');
};

export const 预览命令: Record<string, 命令> = {
  preview: {
    用法: 'preview new <主题>',
    说明: '在主检出的 预览/ 下建 <UTC 月日-时分>-<主题>/，打印路径；主题以「工作-」开头的是中间稿，建在数据根 run/草稿/ 下',
    跑: async (args, 记录) => {
      const p = 解析参数(args, {});
      if (p.位置[0] !== 'new' || p.位置.length !== 2) throw new 用法错误('要 anim preview new <主题>');
      const dir = 新建预览目录(p.位置[1]!);
      记录.产物.push(dir);
      console.log(dir);
    },
  },
  studio: {
    用法: 'studio [<remotion studio 的参数…>]',
    说明: '开 Remotion Studio 在浏览器里预览所选作品（入口 <作品根>/index.ts，打包规则读 remotion.config.ts），参数原样转给 remotion studio',
    不记录: true,
    // remotion.config.ts 在 Remotion CLI 进程里求值，靠 ANIM_WORK 知道是哪部作品（资产锁、求解入口按它取）
    跑: (args) =>
      前台跑([process.execPath, remotion入口(), 'studio', 相对代码根(path.join(作品根(), 'index.ts')), ...args], { cwd: 代码根(), env: { ...process.env, ANIM_WORK: 作品名() } }),
  },
};

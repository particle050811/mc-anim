// anim env：列出每项配置的值和来源；anim doctor：查本机能不能跑（必需项不过就退出码 1，可选项只提示）。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 解析参数 } from '../cli/参数.ts';
import { 读资产表 } from '../资产/资产表.ts';
import { 字节路径, 读资产锁 } from '../资产/资产锁.ts';
import { 全部配置, 配置, 数据路径, isMac } from './配置.ts';
import { 代码根, 主检出 } from './路径.ts';
import { 读内存, 读数说明 } from './资源.ts';
import { 试跑 } from './子进程.ts';

type 结果 = { 项: string; 过: boolean; 必需: boolean; 说明: string };

const 可写 = (dir: string) => {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const 已装版本 = (包: string): string | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(代码根(), 'node_modules', 包, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

export const 体检 = (): 结果[] => {
  const r: 结果[] = [];
  const 查 = (项: string, 过: boolean, 说明: string, 必需 = true) => r.push({ 项, 过, 必需, 说明 });

  const 要的node = fs.readFileSync(path.join(代码根(), '.nvmrc'), 'utf8').trim();
  查('Node', process.versions.node.split('.')[0] === 要的node, `${process.version}（.nvmrc 要 ${要的node}）`);

  const pkg = JSON.parse(fs.readFileSync(path.join(代码根(), 'package.json'), 'utf8'));
  const 锁定 = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>).filter(([, v]) => /^\d/.test(v));
  const 不符 = 锁定.filter(([k, v]) => 已装版本(k) !== v).map(([k, v]) => `${k} 要 ${v}、装的是 ${已装版本(k) ?? '没装'}`);
  查('npm 依赖', 不符.length === 0, 不符.length ? `${不符.join('；')}（跑 npm ci）` : `${锁定.length} 个锁死版本都对`);

  for (const 名 of ['ffmpeg', 'ffprobe'] as const) {
    const v = 试跑([配置(名), '-version']);
    查(名, v.退出码 === 0, v.退出码 === 0 ? v.stdout.split('\n')[0]! : `跑不起来：${配置(名)}（装上或设 ANIM_${名.toUpperCase()}）`);
  }
  const 编码器表 = 试跑([配置('ffmpeg'), '-hide_banner', '-encoders']).stdout;
  const 有编码器 = (名: string) => new RegExp(`\\s${名}\\s`).test(编码器表);
  查('成片编码器', 有编码器(配置('编码器')), `${配置('编码器')}${有编码器(配置('编码器')) ? '' : ' 不在 ffmpeg 里（换 ANIM_VIDEO_ENCODER=libx264）'}`);
  查('libx264', 有编码器('libx264'), '预览、分享版要用', true);
  if (isMac) 查('videotoolbox', 有编码器('h264_videotoolbox'), 'Mac 成片默认用它', false);

  for (const [k, 要] of [['core.quotepath', 'false'], ['core.longpaths', 'true']] as const) {
    const v = 试跑(['git', '-C', 代码根(), 'config', '--get', k]).stdout.trim();
    查(`git ${k}`, v === 要, v === 要 ? v : `是「${v || '没设'}」，要 ${要}（git config ${k} ${要}）`);
  }

  const uv = 试跑(['uv', '--version']);
  查('uv', uv.退出码 === 0, uv.退出码 === 0 ? uv.stdout.trim() : '没装（Python 叶子工具要用；见 https://docs.astral.sh/uv/）', false);

  for (const 子 of ['store', '私有', 'terrain', 'cache', '交付', 'run', '基线', 'archive']) {
    const d = 数据路径(子);
    查(`数据根/${子}`, fs.existsSync(d) && 可写(d), fs.existsSync(d) ? (可写(d) ? d : `${d} 不可写`) : `${d} 不在（建好或设 ANIM_DATA）`);
  }
  const 锁目录 = 配置('锁目录');
  查('锁目录', fs.existsSync(锁目录) && 可写(锁目录), fs.existsSync(锁目录) ? 锁目录 : `${锁目录} 不在（第一次拿锁时会建）`, false);
  查('游戏环境', fs.existsSync(配置('游戏')), 配置('游戏'), false);

  const 锁 = 读资产锁();
  const 缺字节 = Object.entries(锁).filter(([, e]) => !fs.existsSync(字节路径(e))).map(([id]) => id);
  查('资产字节', 缺字节.length === 0, 缺字节.length ? `${缺字节.length} 件不在数据根：${缺字节.slice(0, 5).join('、')}${缺字节.length > 5 ? '…' : ''}` : `资产锁 ${Object.keys(锁).length} 件都在`);
  const 表 = 读资产表();
  const 没登记 = Object.keys(锁).filter((id) => !表.条目.has(id));
  查('资产表', 表.问题.length === 0 && 没登记.length === 0, [...表.问题.slice(0, 5), ...(没登记.length ? [`资产锁里有 ${没登记.length} 件资产表没登记：${没登记.slice(0, 5).join('、')}`] : [])].join('；') || `${表.条目.size} 条`);

  const 浏览器 = path.join(代码根(), 'node_modules', '.remotion', 'chrome-headless-shell');
  查('Remotion 浏览器', fs.existsSync(浏览器), fs.existsSync(浏览器) ? 浏览器 : '还没下载（第一次渲染时 Remotion 自动下）', false);

  const m = 读内存();
  查('内存读数', m !== null, m ? 读数说明(m) : '读不到（资源闸不等内存，直接放行）', false);
  return r;
};

export const 环境命令: Record<string, 命令> = {
  env: {
    用法: 'env',
    说明: '列出本机配置的值和来源（环境变量 > anim.local.toml > 默认）',
    不记录: true,
    跑: async (args) => {
      解析参数(args, {});
      const { 值, 本地文件 } = 全部配置();
      console.log(`代码根：${代码根()}\n主检出：${主检出()}\n本地配置：${本地文件 ?? '（没有 anim.local.toml）'}\n`);
      for (const [名, v] of Object.entries(值)) console.log(`${名}：${v.值}\n    取自${v.来源}；环境变量 ${v.变量}，anim.local.toml 键 ${v.键}。${v.说明}`);
    },
  },
  doctor: {
    用法: 'doctor',
    说明: '体检：Node、依赖版本、ffmpeg、编码器、git 设置、数据根、资产字节',
    跑: async (args, 记录) => {
      解析参数(args, {});
      const r = 体检();
      for (const x of r) console.log(`${x.过 ? '✓' : x.必需 ? '✗' : '!'} ${x.项}：${x.说明}`);
      const 不过 = r.filter((x) => !x.过 && x.必需);
      for (const x of r.filter((x) => !x.过)) 记录.记(x.必需 ? '错误' : '警告', `${x.项}：${x.说明}`);
      console.log(不过.length ? `\n${不过.length} 项必需的没过` : '\n必需项全过');
      return 不过.length ? 1 : 0;
    },
  },
};

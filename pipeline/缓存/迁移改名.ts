// anim cache 改后缀 [--执行]：把数据根里旧的 <指纹>.crf12.mkv 就地改名 <指纹>.x264.mkv（用户 11-01 定后缀不绑档位，决策 0008）。一次性，迁完可删。
// 只改名不转码（再转就压两代）：段签按大小、修改时间和字节认母版，manifest 不记这个名字；.用过、.检出-*、.指纹.json 按指纹前 16 位起名，不用动。
// 代码只认新后缀，没改名的旧文件 render 当母版不在，gc 报「不认识」不删。默认只打印；--执行 过渲染闸，别的检出渲染写旧名的时候不改。
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径 } from '../环境/配置.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 压缩后缀 } from '../渲/母版.ts';

const 旧名 = /^([0-9a-f]{16})\.crf12\.mkv$/;

export type 改名项 = { 旧: string; 新: string; 冲突: boolean };

/** 一层层列 cache/母版/<作品>/<段键>/ 下的旧名字；不给作品就是所有目录（包括代码里没登记的作品） */
export const 找旧后缀 = (作品: string | null): 改名项[] => {
  const 根 = 数据路径('cache', '母版');
  if (!fs.existsSync(根)) return [];
  const 子目录 = (d: string) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name));
  const r: 改名项[] = [];
  for (const 作品目录 of 作品 ? [path.join(根, 作品)].filter((d) => fs.existsSync(d)) : 子目录(根)) {
    for (const 段目录 of 子目录(作品目录)) {
      for (const 名 of fs.readdirSync(段目录).sort()) {
        const m = 旧名.exec(名);
        if (!m) continue;
        const 新 = path.join(段目录, `${m[1]}${压缩后缀}`);
        r.push({ 旧: path.join(段目录, 名), 新, 冲突: fs.existsSync(新) });
      }
    }
  }
  return r;
};

/** 硬链接再删旧名：目标已存在 link 直接报错，rename 会悄悄盖掉。修改时间跟着 inode 不变 */
const 改一个 = (x: 改名项) => {
  fs.linkSync(x.旧, x.新);
  fs.unlinkSync(x.旧);
};

export const 迁移改名 = async (作品: string | null, o: { 执行: boolean; 记录: 运行记录 }) => {
  const 相对 = (p: string) => path.relative(数据路径('cache', '母版'), p).split(path.sep).join('/');
  console.log(`anim cache 改后缀（${o.执行 ? '执行' : '只打印，加 --执行 才改'}）${数据路径('cache', '母版')}${作品 ? `，作品 ${作品}` : '，全部作品'}`);
  const 做 = async () => {
    let 改了 = 0;
    let 失败 = 0;
    const 项 = 找旧后缀(作品);
    for (const x of 项) {
      if (x.冲突) {
        失败++;
        o.记录.记('错误', `${相对(x.新)} 已存在，${相对(x.旧)} 没改（不覆盖，要看两份哪份该留）`);
        continue;
      }
      if (!o.执行) {
        console.log(`  要改 ${相对(x.旧)} → ${path.basename(x.新)}`);
        continue;
      }
      try {
        改一个(x);
        改了++;
      } catch (e) {
        失败++;
        o.记录.记('错误', `${相对(x.旧)} 没改成：${(e as Error).message.split('\n')[0]}`);
      }
    }
    if (o.执行) console.log(`改了 ${改了} 个${失败 ? `，${失败} 个没改（见错误）` : ''}`);
    else console.log(`共 ${项.length} 个，要改 ${项.length - 失败} 个${失败 ? `，${失败} 个目标已存在` : ''}`);
    return 失败 ? 1 : 0;
  };
  return o.执行 ? 过渲染闸(做, undefined, {}, { 种: 'cache 改后缀', 不开渲染: true }) : 做();
};

// anim film 补声音：给 10-30 以前出的交付补上「自足」要的文件（只新增，不改 manifest、不动别的文件）：
//   全片-未拉响度.flac：按 成片.ts 一样按样本截、接各段声音（有段签读 声音.flac，没有读母版），量出的响度要和 manifest 的 原LUFS 一样才收；
//   剪辑包/画面.mp4（作品开了剪辑包、交付里还没有的）：和 edit-package 现做的同一套（剪辑包.ts 的 做剪辑画面）。
// 要的母版、段签都不在的交付补不了，报出来跳过。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 做剪辑画面 } from '../适配器/剪映/剪辑包.ts';
import { 交付缺, 剪辑画面文件, 未拉响度文件, 段声音源, 拼未拉响度, 读交付manifest, 读交付设置 } from './交付.ts';
import { 量响度 } from './成片.ts';

/** 交付根下所有交付目录（有 manifest.json 的） */
export const 全部交付 = () => {
  const 根 = 交付根();
  if (!fs.existsSync(根)) return [];
  return fs
    .readdirSync(根, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(根, e.name, 'manifest.json')))
    .map((e) => path.join(根, e.name))
    .sort();
};

export const 补交付 = async (dirs: string[], opts: { 只看?: boolean; 记录: 运行记录; 等放行: () => Promise<void> }) => {
  const 要剪辑包 = 读交付设置(作品根()).剪辑包;
  let 补了 = 0;
  let 补不了 = 0;
  for (const dir of dirs) {
    const 名 = path.basename(dir);
    const 缺 = 交付缺(dir, 要剪辑包);
    if (!缺.length) {
      console.log(`✓ ${名}：已经自足`);
      continue;
    }
    const m = 读交付manifest(dir);
    if (m.作品 !== 作品名()) throw new Error(`${dir} 是 ${m.作品} 的交付，现在选的作品是 ${作品名()}`);
    const 原 = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { 响度?: { 原LUFS?: number } };
    if (opts.只看) {
      console.log(`· ${名}：缺 ${缺.join('、')}`);
      continue;
    }
    if (缺.includes(未拉响度文件)) {
      const 源 = 段声音源(m);
      const 没有 = m.段.filter((_, i) => !源[i]).map((s) => `${s.键}（${s.指纹.slice(0, 16)}）`);
      if (没有.length) {
        补不了++;
        opts.记录.记('警告', `${名}：补不了 ${未拉响度文件}，这些段的段签声音和母版都不在：${没有.join('、')}`);
      } else {
        await opts.等放行();
        const 出 = path.join(dir, 未拉响度文件);
        const tmp = path.join(dir, `全片-未拉响度.写入中-${process.pid}.flac`);
        try {
          await 拼未拉响度(源 as string[], m, tmp);
          const 量 = 量响度(tmp).lufs;
          const 当时 = 原.响度?.原LUFS;
          // 同一份 PCM 量两次是同一个数；对不上说明段声音和出片时不一样（母版重渲过之类）
          if (typeof 当时 === 'number' && Number.isFinite(当时) && Math.abs(量 - 当时) > 0.05) {
            throw new Error(`拼出来 ${量.toFixed(2)} LUFS，manifest 记的出片时是 ${当时.toFixed(2)} LUFS，声音和出片时不一样，不收`);
          }
          fs.renameSync(tmp, 出);
          补了++;
          opts.记录.产物.push(出);
          console.log(`✓ ${名}：补了 ${未拉响度文件}（${量.toFixed(2)} LUFS，${源.filter((f) => f!.endsWith('.flac')).length}/${源.length} 段读段签声音）`);
        } catch (e) {
          补不了++;
          opts.记录.记('警告', `${名}：${未拉响度文件} 没补上：${(e as Error).message.split('\n')[0]}`);
        } finally {
          fs.rmSync(tmp, { force: true });
        }
      }
    }
    if (缺.includes(剪辑画面文件)) {
      const 不在 = [...m.段.map((s) => s.母版), ...m.叠层.map((l) => l.文件)].filter((f) => !fs.existsSync(f));
      if (不在.length) {
        补不了++;
        opts.记录.记('警告', `${名}：补不了 ${剪辑画面文件}，母版或叠层不在：${不在.map((f) => path.basename(path.dirname(f)) + '/' + path.basename(f)).join('、')}`);
        continue;
      }
      await opts.等放行();
      const 出 = path.join(dir, 剪辑画面文件);
      fs.mkdirSync(path.dirname(出), { recursive: true });
      await 做剪辑画面(m, 出);
      补了++;
      opts.记录.产物.push(出);
      console.log(`✓ ${名}：补了 ${剪辑画面文件}`);
    }
  }
  console.log(`\n补了 ${补了} 个文件${补不了 ? `，${补不了} 个补不了（见警告）` : ''}`);
  return 补不了 ? 1 : 0;
};

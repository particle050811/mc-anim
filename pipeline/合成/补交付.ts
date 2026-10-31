// anim film 补声音：给 10-30 以前出的交付补上「自足」要的文件（只新增，不改 manifest、不动别的文件）：
//   全片-未拉响度.flac：按 成片.ts 一样按样本截、接各段声音（段签的 声音.flac，现在的或 历史/ 里的；都不行读母版），量出的响度要和 manifest 的 原LUFS 一样才收；
//   剪辑包/画面.mp4（作品开了剪辑包、交付里还没有的）：和 edit-package 现做的同一套（剪辑包.ts 的 做剪辑画面）。没开剪辑包的作品不补，交付照旧不自足。
// 补出来的文件解钉后就是这份交付唯一的来源，所以源要是出片时那一份：v2 比 manifest 记的母版字节 sha；v1 没记，母版、叠层、段签派生时的母版
// 改于都不能晚于 manifest.json（晚了就是出片以后重渲或转码过）。补了什么、从哪补的记进 补做.json。要的源都不在或对不上的交付报出来跳过。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 做剪辑画面 } from '../适配器/剪映/剪辑包.ts';
import { 文件sha, 段签文件, 读段签, 读历史段签, 对得上母版, 段签齐, type 段签 } from '../段签/段签.ts';
import { 交付缺, 剪辑画面文件, 未拉响度文件, 拼未拉响度, 读交付manifest, 读交付设置, type 交付段 } from './交付.ts';
import { 量响度 } from './成片.ts';

export const 补做文件 = '补做.json';

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

type 出片时 = { 作品: string; 改于: number };

/** 段签派生时的母版是不是出片时那份（转码过的看转码前） */
const 签是出片时的 = (签: 段签, s: 交付段, 片: 出片时) => {
  const 原 = 签.母版.转码自 ?? 签.母版;
  return s.字节sha ? 签.母版.字节sha === s.字节sha || 原.字节sha === s.字节sha : 原.改于 <= 片.改于;
};

/** 现在的母版是不是出片时那份：v2 比字节 sha（段签和母版对得上就用段签记的，省得读整个文件），v1 比改于 */
export const 母版是出片时的 = async (s: 交付段, 片: 出片时) => {
  if (!fs.existsSync(s.母版)) return false;
  if (!s.字节sha) return fs.statSync(s.母版).mtimeMs <= 片.改于;
  const 签 = 读段签(s.键, s.指纹, 片.作品);
  if (签 && (await 对得上母版(签, s.母版))) return 签.母版.字节sha === s.字节sha;
  return (await 文件sha(s.母版)) === s.字节sha;
};

/** 一段的声音从哪补：出片时那份母版派生的段签 声音.flac（现在的、历史/ 里的）> 出片时那份母版；都没有是 null */
export const 出片时声音 = async (s: 交付段, 片: 出片时): Promise<string | null> => {
  const 现 = 读段签(s.键, s.指纹, 片.作品);
  const 候选 = [...(段签齐(现) ? [{ 签: 现, 声音: 现.声音 ? 段签文件(现, 现.声音.文件) : null }] : []), ...读历史段签(s.键, s.指纹, 片.作品).map((h) => ({ 签: h.签, 声音: h.签.声音 ? path.join(path.dirname(h.抽样), h.签.声音.文件) : null }))];
  for (const c of 候选) if (c.声音 && fs.existsSync(c.声音) && 签是出片时的(c.签, s, 片)) return c.声音;
  return (await 母版是出片时的(s, 片)) ? s.母版 : null;
};

const 记补做 = (dir: string, 文件: string, 说明: Record<string, unknown>) => {
  const f = path.join(dir, 补做文件);
  const 旧 = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>) : {};
  const tmp = `${f}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ ...旧, [文件.split(path.sep).join('/')]: { 补于: new Date().toISOString(), ...说明 } }, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, f);
};

export const 补交付 = async (dirs: string[], opts: { 只看?: boolean; 记录: 运行记录; 等放行: () => Promise<void> }) => {
  const 要剪辑包 = 读交付设置(作品根()).剪辑包;
  let 补了 = 0;
  let 补不了 = 0;
  for (const dir of dirs) {
    const 名 = path.basename(dir);
    const 缺 = 交付缺(dir);
    if (!缺.length) {
      console.log(`✓ ${名}：已经自足`);
      continue;
    }
    const m = 读交付manifest(dir);
    if (m.作品 !== 作品名()) throw new Error(`${dir} 是 ${m.作品} 的交付，现在选的作品是 ${作品名()}`);
    const 原 = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { 响度?: { 原LUFS?: number } };
    const 片: 出片时 = { 作品: m.作品, 改于: fs.statSync(path.join(dir, 'manifest.json')).mtimeMs };
    const 不补画面 = 缺.includes(剪辑画面文件) && !要剪辑包;
    if (opts.只看) {
      console.log(`· ${名}：缺 ${缺.join('、')}${不补画面 ? `（作品没开剪辑包，${剪辑画面文件} 不补，这份交付照旧钉着母版）` : ''}`);
      continue;
    }
    if (缺.includes(未拉响度文件)) {
      const 源: (string | null)[] = [];
      for (const s of m.段) 源.push(await 出片时声音(s, 片));
      const 没有 = m.段.filter((_, i) => !源[i]).map((s) => `${s.键}（${s.指纹.slice(0, 16)}）`);
      if (没有.length) {
        补不了++;
        opts.记录.记('警告', `${名}：补不了 ${未拉响度文件}，这些段出片时那份母版的段签声音和母版都不在（或出片以后重渲、转码过）：${没有.join('、')}`);
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
          记补做(dir, 未拉响度文件, { 响度: Number(量.toFixed(2)), 原LUFS: 当时 ?? null, 源: 源.map((f) => (f!.endsWith('.flac') ? '段签声音' : '母版')), 核对: m.版本 >= 2 ? '母版字节 sha' : '母版改于不晚于 manifest' });
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
    if (不补画面) console.log(`· ${名}：作品没开剪辑包，${剪辑画面文件} 不补，这份交付照旧钉着母版`);
    else if (缺.includes(剪辑画面文件)) {
      const 不在 = [...m.段.map((s) => s.母版), ...m.叠层.map((l) => l.文件)].filter((f) => !fs.existsSync(f));
      const 变过: string[] = [];
      for (const s of m.段) if (fs.existsSync(s.母版) && !(await 母版是出片时的(s, 片))) 变过.push(s.键);
      for (const l of m.叠层) if (fs.existsSync(l.文件) && fs.statSync(l.文件).mtimeMs > 片.改于) 变过.push(l.键);
      if (不在.length || 变过.length) {
        补不了++;
        const 说 = [
          不在.length ? `母版或叠层不在：${不在.map((f) => path.basename(path.dirname(f)) + '/' + path.basename(f)).join('、')}` : '',
          变过.length ? `出片以后重渲或转码过：${变过.join('、')}` : '',
        ].filter(Boolean);
        opts.记录.记('警告', `${名}：补不了 ${剪辑画面文件}，${说.join('；')}`);
        continue;
      }
      await opts.等放行();
      const 出 = path.join(dir, 剪辑画面文件);
      fs.mkdirSync(path.dirname(出), { recursive: true });
      await 做剪辑画面(m, 出);
      记补做(dir, 剪辑画面文件, { 核对: m.版本 >= 2 ? '母版字节 sha' : '母版、叠层改于不晚于 manifest' });
      补了++;
      opts.记录.产物.push(出);
      console.log(`✓ ${名}：补了 ${剪辑画面文件}`);
    }
  }
  console.log(`\n补了 ${补了} 个文件${补不了 ? `，${补不了} 个补不了（见警告）` : ''}`);
  return 补不了 ? 1 : 0;
};

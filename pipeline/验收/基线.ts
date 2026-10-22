// 旧项目基线作参照：数据根 基线/<旧段号>/段.json 列的帧（首帧、每 24 帧、末帧和台词音效落点）、帧/*.png、音频.wav，
// 由 pipeline/适配器/旧项目/基线.ts 从冻结-1021 的母版抽出。旧段号 ↔ 段键查 作品/应力转动/旧名.tsv（类别 段号）。
import fs from 'node:fs';
import path from 'node:path';
import { decode } from 'fast-png';
import { 基线根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 旧布局作品 } from '../环境/作品.ts';
import { 扫声音, type 参照 } from './验收.ts';

type 基线段 = { 段: string; 帧数: number; 帧: { 帧: number; 文件: string }[]; 音频?: { 文件: string } };

/** 段键 → 旧段号；表里没有就是新段，没有基线 */
export const 旧段号 = (段键: string, 根 = 代码根()): string | null => {
  const 行们 = fs.readFileSync(path.join(根, '作品', 旧布局作品, '旧名.tsv'), 'utf8').split('\n').slice(1);
  for (const l of 行们) {
    const [类别, 旧名, 新键] = l.split('\t');
    if (类别 === '段号' && 新键 === 段键) return 旧名!;
  }
  return null;
};

export const 基线目录 = (旧号: string) => path.join(基线根(), 旧号);

/** PNG（rgb 或 rgba，8 位）→ rgb24 */
const 读png = (file: string) => {
  const p = decode(fs.readFileSync(file));
  if (p.depth !== 8) throw new Error(`${file} 不是 8 位 PNG`);
  const n = p.width * p.height;
  const src = p.data as Uint8Array;
  if (p.channels === 3) return { 宽: p.width, 高: p.height, rgb: Buffer.from(src.buffer, src.byteOffset, n * 3) };
  const rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = src[i * p.channels]!;
    rgb[i * 3 + 1] = src[i * p.channels + 1]!;
    rgb[i * 3 + 2] = src[i * p.channels + 2]!;
  }
  return { 宽: p.width, 高: p.height, rgb };
};

export const 基线参照 = async (目录: string): Promise<参照> => {
  const 表 = JSON.parse(fs.readFileSync(path.join(目录, '段.json'), 'utf8')) as 基线段;
  const 帧们 = 表.帧.map((f) => f.帧).sort((a, b) => a - b);
  const 文件 = new Map(表.帧.map((f) => [f.帧, path.join(目录, f.文件)]));
  const 首 = 读png(文件.get(帧们[0]!)!);
  const 音频 = 表.音频 ? path.join(目录, 表.音频.文件) : null;
  return {
    名: '基线',
    宽: 首.宽,
    高: 首.高,
    帧数: 表.帧数,
    帧们,
    签名: new Map(),
    像素: async function* (要的) {
      for (const f of 要的) {
        const p = 读png(文件.get(f)!);
        if (p.宽 !== 首.宽 || p.高 !== 首.高) throw new Error(`${文件.get(f)} 尺寸和别的基线帧不一样`);
        yield p.rgb;
      }
    },
    声音: 音频 && fs.existsSync(音频) ? await 扫声音(音频) : null,
  };
};

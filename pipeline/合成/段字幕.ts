// 段里画的字幕（用户 11-05 定「母版 = 成片切片」：字幕不再后叠，跟着段一起渲）。
// 字幕的时间要看前后句、配音的停顿，所以先按整部作品的正片顺序排一遍（字幕.ts），再切给各段：
// 全片编排帧换成输出帧（engine/段/出帧.ts，和段的输出窗同一种取整），落在这一段输出窗里的那截就是这段的；跨段的一屏前后两段各画一截。
// 卡画成整帧大小的透明 PNG（字幕卡.ts），进渲染设置的 字幕，所以字幕变了只有涉及的段指纹变。
import { 全片起帧表, 段输出窗, 输出帧号 } from '../../engine/段/出帧.ts';
import type { 段字幕 } from '../../engine/段/设置值.ts';
import { 作品根 } from '../环境/作品.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 读作品资产锁, 解析资产 } from '../资产/资产锁.ts';
import { 读单声道 } from './音频.ts';
import { 排字幕, type 字幕屏 } from './字幕.ts';
import { 画整帧字幕卡 } from './字幕卡.ts';
import { 上一段于, 算台词落点, 读台词表 } from './台词落点.ts';

/** 全部正片段按清单顺序排字幕；返回各屏（全片编排帧）和各段的全片起帧 */
export const 排全片字幕 = (全部: readonly 段信息[]) => {
  const 正片 = 全部.filter((s) => s.章 !== '核对');
  const 起帧 = 全片起帧表(全部.map((s) => ({ 键: s.键, 帧数: s.段.帧数 })));
  if (!正片.some((s) => s.段.声音?.some((x) => x.台词 !== undefined))) return { 屏们: [] as 字幕屏[], 起帧 };
  const fps = 正片[0]!.段.fps;
  if (正片.some((s) => s.段.fps !== fps)) throw new Error('各段编排帧率不一样，排不了全片字幕');
  const 锁 = 读作品资产锁(作品根());
  const 截们 = 正片.map((s) => ({ 段: s, 全片起帧: 起帧.get(s.键)! }));
  const 落点们 = 算台词落点(截们, 读台词表(), (id) => 解析资产(id, 锁).文件, 上一段于([...全部]));
  const 总帧数 = 截们.reduce((a, c) => a + c.段.段.帧数, 0);
  const 切点们 = 截们.slice(1).map((c) => c.全片起帧);
  const 缓存 = new Map<string, Float32Array>();
  const 读 = (f: string) => 缓存.get(f) ?? 缓存.set(f, 读单声道(f)).get(f)!;
  return { 屏们: 排字幕(落点们, 总帧数, fps, 读, 切点们).屏们, 起帧 };
};

/** 一段的字幕卡：本段输出帧 [起, 止)；画面宽高是成片像素 */
export const 段字幕卡 = (s: 段信息, 全片: ReturnType<typeof 排全片字幕>, 输出fps: number, 画面宽: number, 画面高: number): 段字幕[] => {
  if (s.章 === '核对') return [];
  const 编排fps = s.段.fps;
  const 窗 = 段输出窗(全片.起帧.get(s.键)!, s.段.帧数, 编排fps, 输出fps);
  const 图们 = new Map<string, string>();
  const out: 段字幕[] = [];
  for (const p of 全片.屏们) {
    const 起 = Math.max(0, 输出帧号(p.起帧, 编排fps, 输出fps) - 窗.起);
    const 止 = Math.min(窗.帧数, 输出帧号(p.止帧, 编排fps, 输出fps) - 窗.起);
    if (止 <= 起) continue;
    const key = `${p.位置}\u0000${p.字}`;
    let 图 = 图们.get(key);
    if (!图) {
      图 = `data:image/png;base64,${画整帧字幕卡(p.字, p.位置, 画面宽, 画面高).toString('base64')}`;
      图们.set(key, 图);
    }
    out.push({ 图, 起, 止 });
  }
  return out;
};

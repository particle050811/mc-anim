// 一段渲完（CRF1 已改名、写好指纹）之后的收尾：派生段签 → 转存压缩母版 → 删 CRF1 → 删同段旧指纹。都是 CPU 活，只解码 CRF1 和跑 x264，不用显卡。
// 默认在后台子进程里跑（后台转存.ts）；ANIM_INLINE_TRANSCODE=1 时 渲.ts 留在渲染闸里当场调。两边同一份代码、同样的警告文本。
// 失败语义：段签没成的不转（无损抽样帧只能从 CRF1 抽，CRF1 留着等 --只派生）；转存没成的留 CRF1，用到时再转。都只警告，不让整批失败。
// 全程拿着这个指纹的占用（母版占用.ts）；放了占用才删旧。
import fs from 'node:fs';
import { 配置 } from '../环境/配置.ts';
import { 内存够渲染, 读内存, 读压力, 读数说明, type 内存读数 } from '../环境/资源.ts';
import { 出段签 } from '../段签/段签.ts';
import { 漂移提示 } from '../段签/补.ts';
import { 删旧 } from '../缓存/钉.ts';
import { 记阶段, type 阶段记录 } from '../运行记录/阶段.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 原母版路径, 现母版 } from './母版.ts';
import { 占着 } from './母版占用.ts';
import { 备好母版, 存成压缩, 存成压缩内层, 还是那份 } from './转存.ts';

export type 后处理参数 = {
  键: string;
  指纹: string;
  级别: string;
  作品: string;
  留CRF1: boolean;
  /** 阶段表里记在哪个标签下（render:<作品>/<段>:<级别>） */
  标签: string;
  /** 不是刚渲的：render 命中「已是最新」、CRF1 还没转（上回被杀、转存失败或旧母版），接着补 */
  续补?: boolean;
};
export type 后处理结局 = '压缩' | '留CRF1' | '别人转了';
export type 后处理结果 = { 母版: string | null; 结局: 后处理结局 };
export type 后处理钩子 = {
  收: 阶段记录[];
  记录: Pick<运行记录, '记'>;
  /** 每步开始前等内存（等内存够）；内联不传：旧串行就不看内存 */
  让内存?: () => Promise<void>;
};

const 首行 = (e: unknown) => (e as Error).message.split('\n')[0];

const 续补一段 = async (p: 后处理参数, h: 后处理钩子): Promise<后处理结果> => {
  await h.让内存?.();
  const t = Date.now();
  try {
    // 留CRF1 不走 备好母版：它转完会删已被取代的 CRF1
    const 压 = p.留CRF1 ? (await 存成压缩(p.键, p.指纹, p.级别, { 作品: p.作品, 记录: h.记录 })).文件 : await 备好母版(p.键, p.指纹, p.级别, { 作品: p.作品, 记录: h.记录, 不过闸: true });
    return { 母版: 压 ?? 现母版(p.键, p.指纹, p.作品), 结局: '压缩' };
  } catch (e) {
    h.记录.记('警告', `${p.键} 接着补压缩母版没成（${首行(e)}），CRF1 留着，用到时再转`);
    return { 母版: 现母版(p.键, p.指纹, p.作品), 结局: '留CRF1' };
  } finally {
    记阶段(h.收, p.标签, '转存', t, (Date.now() - t) / 1000);
  }
};

export const 后处理一段 = async (p: 后处理参数, h: 后处理钩子): Promise<后处理结果> => {
  if (p.续补) return 续补一段(p, h);
  const { 键, 指纹, 级别, 作品, 标签 } = p;
  const 原 = 原母版路径(键, 指纹, 作品);
  const 结果 = await 占着(键, 指纹, 作品, async (): Promise<后处理结果> => {
    // 等占用的这会儿 film 的 备好母版 可能已经转完删了
    if (!fs.existsSync(原)) return { 母版: 现母版(键, 指纹, 作品), 结局: '别人转了' };
    const 当时 = fs.statSync(原);
    await h.让内存?.();
    const t1 = Date.now();
    let 有段签 = false;
    try {
      const d = await 出段签(原, { 段键: 键, 指纹, 级别, 派生: '渲染', 作品, 计时: { 收: h.收, 标签 } });
      有段签 = true;
      if (d.自查?.结论 === '漂移') h.记录.记('警告', 漂移提示(键, d.自查));
      else if (d.自查) console.log(`   ${键}：同一指纹重渲，自查${d.自查.结论}（${d.自查.说明}）`);
    } catch (e) {
      h.记录.记('警告', `${键} 渲好了，段签没派生成（${首行(e)}）：anim render ${键} --只派生 再补`);
    }
    记阶段(h.收, 标签, '派生段签', t1, (Date.now() - t1) / 1000);
    let 出: 后处理结果 = { 母版: 原, 结局: '留CRF1' };
    // 没有段签不转：无损抽样帧只能从 CRF1 抽，CRF1 留着等 --只派生
    if (有段签) {
      await h.让内存?.();
      const t2 = Date.now();
      try {
        const z = await 存成压缩内层(键, 指纹, 级别, { 作品, 记录: h.记录 });
        // 留CRF1：verify --对基线 要逐帧比，只有 CRF1 能比；留下的已被取代，下次 film 或 gc 就删。
        // 核身份：转的这会儿同一指纹又重渲了，那份是新的，不是这份转出来的
        if (!p.留CRF1 && 还是那份(原, 当时)) fs.rmSync(原, { force: true });
        出 = { 母版: z.文件, 结局: '压缩' };
        console.log(`   ${键}：CRF1 ${(z.原大小 / 1e9).toFixed(2)} GB → 压缩母版 ${(z.新大小 / 1e9).toFixed(2)} GB`);
      } catch (e) {
        h.记录.记('警告', `${键} 渲好了，转存压缩母版没成（${首行(e)}），CRF1 留着，用到时再转`);
      }
      记阶段(h.收, 标签, '转存', t2, (Date.now() - t2) / 1000);
    }
    return 出;
  });
  const t删 = Date.now();
  删旧('母版', 键, 级别, 指纹, { 记录: h.记录, 作品 });
  记阶段(h.收, 标签, '删旧', t删, (Date.now() - t删) / 1000);
  return 结果;
};

const 轮询毫秒 = 5000;
/** 等这么久还不够、压力又不是 4，就照做：旧串行根本不看内存，不比原来差；让下一段一直等着更糟（Chrome 占着内存不出帧） */
const 最长等毫秒 = 600_000;

/**
 * 内存低于资源闸下限（闸.ts 的准入同一个判断、同一个配置项）时后台让一让：只在每步开始前看，已经跑起来的 x264 不停。
 * 返回等了多少秒；事 给调度日志，超时 给警告
 */
export const 等内存够 = async (o: {
  读内存?: () => 内存读数 | null;
  读压力?: () => number | null;
  下限?: number;
  睡?: (ms: number) => Promise<void>;
  现在?: () => number;
  事?: (事: '起' | '止', 字段: Record<string, unknown>) => void;
  超时?: (说明: string) => void;
} = {}): Promise<number> => {
  const 读m = o.读内存 ?? 读内存;
  const 读压 = o.读压力 ?? 读压力;
  const 下限 = o.下限 ?? Number(配置('渲染内存下限'));
  const 睡 = o.睡 ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const 现在 = o.现在 ?? Date.now;
  const 读 = () => {
    const m = 读m();
    const 压力 = 读压();
    return { m, 压力, 过: 压力 !== 4 && (!m || 内存够渲染(m, 下限)) };
  };
  let 看 = 读();
  if (看.过) return 0;
  const 起 = 现在();
  o.事?.('起', { 读数: 看.m ? 读数说明(看.m) : null, 压力: 看.压力, 阈值: 下限 });
  for (;;) {
    await 睡(轮询毫秒);
    看 = 读();
    const 秒 = (现在() - 起) / 1000;
    if (看.过) {
      o.事?.('止', { 秒 });
      return 秒;
    }
    if (看.压力 !== 4 && 现在() - 起 >= 最长等毫秒) {
      o.事?.('止', { 秒, 超时: true });
      o.超时?.(`后台等内存满 ${Math.round(秒 / 60)} 分钟还不够（${看.m ? 读数说明(看.m) : '无读数'}，下限 ${下限}%），先转着`);
      return 秒;
    }
  }
};

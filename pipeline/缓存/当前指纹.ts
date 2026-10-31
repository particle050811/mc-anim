// 回收用的保留集来源里要现算的那部分：一部作品各段、各渲染级别的当前指纹（母版和段声明的透明叠层），和 anim stale、anim render 同一套算法。
// 算不出的（清单读不出、某段打包失败、指纹里记了缺字节）就整个目录留下：宁可少省，不删掉还要用的。
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 叠层键, 算全部段指纹, 算段指纹, type 指纹任务, type 段指纹 } from '../指纹/指纹.ts';
import { 叠层路径, 原母版路径 } from '../渲/母版.ts';
import { 叠层渲染参数, 渲染参数 } from '../渲/设置.ts';
import { 叠层目录, 母版目录, 数据路径 } from '../环境/配置.ts';
import { 指定作品, 指定的作品 } from '../环境/作品.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import type { 保留集 } from './回收.ts';

/** 缺字节时打进包的是占位，render 会先补字节再算指纹，这里没补，算出来的和渲染时的对不上 */
const 不可信 = (fp: 段指纹) => (fp.项.缺字节?.length ? `指纹里记了缺字节 ${fp.项.缺字节.length} 件（先 anim assets seed / pull）` : null);

const 试 = async (保留: 保留集, 目录: string, 算: () => Promise<段指纹>, 加: (fp: 段指纹) => void, 警告: (s: string) => void, 名: string) => {
  try {
    const fp = await 算();
    const 不信 = 不可信(fp);
    if (不信) {
      警告(`${名}：${不信}，整个目录留着`);
      保留.加目录(目录, { 类: '算不出', 说明: 不信 });
    } else 加(fp);
  } catch (e) {
    警告(`${名} 的当前指纹算不出（${(e as Error).message.split('\n')[0]}），整个目录留着`);
    保留.加目录(目录, { 类: '算不出', 说明: '当前指纹算不出' });
  }
};

export type 当前母版 = { 作品: string; 键: string; 级别: 渲染级别; 指纹: string };

/** 作品 各段在各渲染级别下的母版当前指纹（anim cache 转存 用）；算不出的报警告跳过 */
export const 当前母版们 = async (作品: string, 警告: (s: string) => void = () => {}): Promise<当前母版[]> => {
  const 原 = 指定的作品();
  指定作品(作品);
  try {
    const 段们 = await 全部段();
    const 项们 = 渲染级别取值.flatMap((级别) => 段们.map((s) => ({ 级别, 键: s.键, 任务: { 段: s, 渲染设置: 渲染参数(级别) } as 指纹任务 })));
    const 批 = await 算全部段指纹(项们.map((x) => x.任务));
    return 项们.flatMap((x, i) => {
      const fp = 批[i]!;
      const 不信 = 不可信(fp);
      if (不信) {
        警告(`${作品}/${x.键}（${x.级别}）：${不信}，不转存`);
        return [];
      }
      return [{ 作品, 键: x.键, 级别: x.级别, 指纹: fp.指纹 }];
    });
  } finally {
    指定作品(原);
  }
};

/** 作品 的各段在各渲染级别下的当前指纹进保留集；算的时候临时切到这部作品，算完切回去 */
export const 加当前指纹 = async (保留: 保留集, 作品: string, 警告: (s: string) => void = () => {}, 进度: (s: string) => void = () => {}) => {
  const 原 = 指定的作品();
  指定作品(作品);
  try {
    let 段们: 段信息[];
    try {
      段们 = await 全部段();
    } catch (e) {
      警告(`${作品} 的清单读不出（${(e as Error).message.split('\n')[0]}），这部作品的母版、叠层整个留着`);
      保留.加目录(数据路径('cache', '母版', 作品), { 类: '算不出', 说明: '清单读不出' });
      保留.加目录(数据路径('cache', '叠层', 作品), { 类: '算不出', 说明: '清单读不出' });
      return;
    }
    type 项 = { 任务: 指纹任务; 目录: string; 加: (fp: 段指纹) => void; 名: string };
    const 项们: 项[] = 渲染级别取值.flatMap((级别) =>
      段们.flatMap((s): 项[] => [
        { 任务: { 段: s, 渲染设置: 渲染参数(级别) }, 目录: 母版目录(s.键), 加: (fp) => 保留.加(原母版路径(s.键, fp.指纹), { 类: '当前', 说明: 级别 }), 名: `${作品}/${s.键}（${级别}）` },
        ...(s.段.叠层 ?? []).map((l): 项 => {
          const 键 = 叠层键(s.键, l);
          return { 任务: { 段: s, 渲染设置: 叠层渲染参数(级别), 叠层: l }, 目录: 叠层目录(键), 加: (fp) => 保留.加(叠层路径(键, fp.指纹), { 类: '当前', 说明: 级别 }), 名: `${作品}/${键}（${级别}）` };
        }),
      ]),
    );
    进度(`${作品}：算 ${段们.length} 段 ${渲染级别取值.join('、')} 级的指纹`);
    // 一次打包算全部（逐段各打一次包要慢几十倍）；有一段打包失败整批会抛，再逐段算，把失败的那段单独留下
    let 批: 段指纹[] | null = null;
    try {
      批 = await 算全部段指纹(项们.map((x) => x.任务));
    } catch {
      批 = null;
    }
    for (const [i, x] of 项们.entries()) {
      const fp = 批?.[i];
      await 试(保留, x.目录, fp ? async () => fp : () => 算段指纹(x.任务.段, x.任务.渲染设置, x.任务.叠层), x.加, 警告, x.名);
    }
  } finally {
    指定作品(原);
  }
};

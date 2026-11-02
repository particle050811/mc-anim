// 一段渲完（CRF1 已改名、写好指纹）之后的收尾：派生段签 → 转存压缩母版 → 删 CRF1 → 删同段旧指纹。都是 CPU 活，只解码 CRF1 和跑 x264，不用显卡。
// 默认在后台子进程里跑（后台转存.ts）；ANIM_INLINE_TRANSCODE=1 时 渲.ts 留在渲染闸里当场调。两边同一份代码、同样的警告文本。
// 失败语义：段签没成的不转（无损抽样帧只能从 CRF1 抽，CRF1 留着等 --只派生）；转存没成的留 CRF1，用到时再转。都只警告，不让整批失败。
// 全程拿着这个指纹的占用（母版占用.ts）；放了占用才删旧。
import fs from 'node:fs';
import { 出段签 } from '../段签/段签.ts';
import { 漂移提示 } from '../段签/补.ts';
import { 删旧 } from '../缓存/钉.ts';
import { 记阶段, type 阶段记录 } from '../运行记录/阶段.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 原母版路径, 现母版 } from './母版.ts';
import { 占着 } from './母版占用.ts';
import { 存成压缩内层, 还是那份 } from './转存.ts';

export type 后处理参数 = {
  键: string;
  指纹: string;
  级别: string;
  作品: string;
  留CRF1: boolean;
  /** 阶段表里记在哪个标签下（render:<作品>/<段>:<级别>） */
  标签: string;
};
export type 后处理结局 = '压缩' | '留CRF1' | '别人转了';
export type 后处理结果 = { 母版: string | null; 结局: 后处理结局 };
export type 后处理钩子 = {
  收: 阶段记录[];
  记录: Pick<运行记录, '记'>;
};

const 首行 = (e: unknown) => (e as Error).message.split('\n')[0];

export const 后处理一段 = async (p: 后处理参数, h: 后处理钩子): Promise<后处理结果> => {
  const { 键, 指纹, 级别, 作品, 标签 } = p;
  const 原 = 原母版路径(键, 指纹, 作品);
  const 结果 = await 占着(键, 指纹, 作品, async (): Promise<后处理结果> => {
    // 等占用的这会儿 film 的 备好母版 可能已经转完删了
    if (!fs.existsSync(原)) return { 母版: 现母版(键, 指纹, 作品), 结局: '别人转了' };
    const 当时 = fs.statSync(原);
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

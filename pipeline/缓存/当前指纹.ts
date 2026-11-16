// 回收用的保留集来源里要现算的那部分：一部作品各段、各渲染级别的当前切片（画面 mp4、声音 wav），和 anim film、anim stale 同一套算法（渲/段产物.ts）。
// 算不出的（清单读不出、某段打包失败、指纹里记了缺字节）就整个目录留下：宁可少省，不删掉还要用的。
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { segmentProducts, type SegArtifact } from '../渲/段产物.ts';
import { masterDir } from '../环境/作品数据.ts';
import { dataPath } from '../环境/配置.ts';
import { setSpecifiedWork, getSpecifiedWork } from '../环境/作品.ts';
import { renderLevels, type RenderLevel } from '../../engine/段/设置值.ts';
import type { SegFingerprint } from '../指纹/指纹.ts';
import type { KeepSet } from './回收.ts';

/** 缺字节时打进包的是占位，出片会先补字节再算指纹，这里没补，算出来的和渲染时的对不上 */
const untrustedReason = (fp: SegFingerprint) => (fp.items.缺字节?.length ? `指纹里记了缺字节 ${fp.items.缺字节.length} 件（先 anim assets seed / pull）` : null);

/** 作品 的各段在各渲染级别下的当前切片进保留集；算的时候临时切到这部作品，算完切回去 */
export const addCurrentFingerprints = async (keep: KeepSet, work: string, warn: (s: string) => void = () => {}, onProgress: (s: string) => void = () => {}) => {
  const prevWork = getSpecifiedWork();
  setSpecifiedWork(work);
  try {
    let segments: SegInfo[];
    try {
      segments = await loadAllSegments();
    } catch (e) {
      warn(`${work} 的清单读不出（${(e as Error).message.split('\n')[0]}），这部作品的母版整个留着`);
      keep.addDir(dataPath('cache', '母版', work), { type: '算不出', note: '清单读不出' });
      return;
    }
    onProgress(`${work}：算 ${segments.length} 段 ${renderLevels.join('、')} 级的指纹`);
    const addOne = (r: SegArtifact, level: RenderLevel) => {
      const untrusted = untrustedReason(r.pictureFingerprint) ?? untrustedReason(r.soundFingerprint);
      if (untrusted) {
        warn(`${work}/${r.segment.key}（${level}）：${untrusted}，整个目录留着`);
        keep.addDir(masterDir(r.segment.key), { type: '算不出', note: untrusted });
        return;
      }
      keep.加(r.画面, { type: '当前', note: level });
      keep.加(r.sound, { type: '当前', note: level });
    };
    for (const level of renderLevels) {
      // 一次打包算全部（逐段各打一次包要慢几十倍）；整批抛了再逐段算，把失败的那段单独留下（排字幕要全部段，失败的多半是字幕读不出，那就整部留下）
      let products: SegArtifact[] | null = null;
      try {
        products = await segmentProducts(segments, segments, level);
      } catch {
        products = null;
      }
      if (products) {
        for (const r of products) addOne(r, level);
        continue;
      }
      for (const s of segments) {
        try {
          addOne((await segmentProducts(segments, [s], level))[0]!, level);
        } catch (e) {
          warn(`${work}/${s.key}（${level}）的当前指纹算不出（${(e as Error).message.split('\n')[0]}），整个目录留着`);
          keep.addDir(masterDir(s.key), { type: '算不出', note: '当前指纹算不出' });
        }
      }
    }
  } finally {
    setSpecifiedWork(prevWork);
  }
};

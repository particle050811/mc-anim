// 数据根下按作品分的位置：母版、段签、认可参考、逐帧校验、交付、基线，都是 <数据根>/<类…>/<作品>/<键…>。
// 不放 配置.ts：要引 作品.ts 的 workName 取默认作品，而 作品.ts 引 配置.ts，放一起成环。
import { dataPath } from './配置.ts';
import { workName } from './作品.ts';

/** 按作品分的位置：<数据根>/<类…>/<作品>/<键…> */
const workDataPath = (prefixKind: string[], work: string, pathKeys: string[]) => dataPath(...prefixKind, work, ...pathKeys);
export const masterDir = (segKey: string, work = workName()) => workDataPath(['cache', '母版'], work, [segKey]);
/** 段签：段签/<作品>/<段键>/<指纹前 16 位>/（签.json、声音.flac、历史.jsonl），渲过一个指纹就留一份，母版删了也在（pipeline/段签/） */
export const segStampDir = (segKey: string, fingerprint: string, work = workName()) => workDataPath(['段签'], work, [segKey, fingerprint.slice(0, 16)]);
/**
 * 认可参考：认可那版的抽样帧（全分辨率 FFV1，存解出来的 yuv420p 原样；从认可那版的切片抽），
 * 认可参考/<作品>/<平台>/<段键>/<指纹前 16 位>-<抽样键>.mkv，旁边 .json 是旁记（验收/参考像素.ts）；verify 比像素用，不再要认可那版的母版。
 * 抽样键见 验收/认可.ts，文件名跟着认可记录的哈希走，同一指纹重新 accept 不会撞上旧参考
 */
export const approvRefFile = (segKey: string, fingerprint: string, sampleKey: string, hostPlatform: string, work = workName()) => workDataPath(['认可参考'], work, [hostPlatform, segKey, `${fingerprint.slice(0, 16)}-${sampleKey}.mkv`]);
/** anim verify frames 存的逐帧校验值：run/逐帧校验/<作品>/<名>/<段键>.tsv */
export const frameCheckDir = (checkName: string, work = workName()) => workDataPath(['run', '逐帧校验'], work, [checkName]);
/** 交付/<作品>/，下面是 <UTC 月日-时分>-<名>/ */
export const deliveryRoot = (work = workName()) => workDataPath(['交付'], work, []);
/** 旧项目对照的基线：基线/<作品>/（只有 应力转动 有） */
export const baselineRoot = (work = workName()) => workDataPath(['基线'], work, []);

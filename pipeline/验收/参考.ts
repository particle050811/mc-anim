// 认可参考：认可那一版的抽样帧（全分辨率 FFV1，无损），存 认可参考/<作品>/<平台>/<段键>/<指纹前 16 位>-<抽样键>.mkv（数据根，不进 Git）。
// 认可那版的母版删了，verify 照样能逐像素比（设计见 预览/1030-1755-母版管线重设计/01-推荐方案.md 第四节 C）。
// 文件名带认可记录的抽样键：同一指纹重渲后再 accept，新记录对应新文件名，旧参考不会冒充新认可（只写新文件，不删旧参考）。
// 收之前逐帧核对：解出来的 rgb24 sha 要等于认可记录（进 Git 的那份）里的哈希；收下的文件名本身就绑定了这组哈希。
import fs from 'node:fs';
import path from 'node:path';
import { 认可参考文件 } from '../环境/配置.ts';
import { 视频信息 } from '../渲/探测.ts';
import { 抽样路径, 写抽样, 读段签, 读历史段签, 段签齐 } from '../段签/段签.ts';
import { 抽样帧, 抽样流, sha } from './帧流.ts';
import { 抽样键, type 认可记录 } from './认可.ts';

/** 这条认可记录在这个平台的认可参考文件 */
export const 参考文件 = (认可: 认可记录, 平台: string, 作品?: string) => 认可参考文件(认可.段, 认可.指纹, 抽样键(认可), 平台, 作品);

/** 抽样文件解出来是不是正好是认可记录的那些帧 */
export const 对得上认可 = async (文件: string, 认可: 认可记录) => {
  const 帧们 = 抽样帧(认可.帧数, 认可.间隔);
  const 记 = new Map(认可.帧.map((f) => [f.帧, f.哈希]));
  if (视频信息(文件).帧数 !== 帧们.length) return false;
  let i = 0;
  for await (const rgb of 抽样流(文件, 帧们, 帧们, 认可.宽, 认可.高)) {
    const 哈希 = 记.get(帧们[i++]!);
    if (哈希 !== undefined && 哈希 !== sha(rgb)) return false;
  }
  return i === 帧们.length;
};

/** 先写临时文件，核对过才改名；核对不过返回 false、不留文件 */
const 收 = async (出: string, 写: (tmp: string) => Promise<unknown>, 认可: 认可记录) => {
  fs.mkdirSync(path.dirname(出), { recursive: true });
  const tmp = path.join(path.dirname(出), `${path.basename(出, '.mkv')}.写入中-${process.pid}.mkv`);
  try {
    await 写(tmp);
    if (!(await 对得上认可(tmp, 认可))) return false;
    fs.renameSync(tmp, 出);
    return true;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
};

export type 参考结果 = '已有' | '从段签' | '从认可母版' | '对不上' | '没有来源';

/**
 * 给一条认可记录备好认可参考：已有就不动；认可那版指纹的段签（现在的，或重渲前挪进 历史/ 的）抽样帧和认可记录对得上就克隆它；不然从认可那版的母版抽。
 * 同一指纹重渲过、字节和认可时不一样的，抽出来对不上认可记录，返回 '对不上'（verify 退回块均值或母版）。母版传 null 只看段签
 */
export const 备参考 = async (认可: 认可记录, 母版: string | null, 平台: string): Promise<参考结果> => {
  const 出 = 参考文件(认可, 平台);
  if (fs.existsSync(出)) return '已有';
  const 签 = 读段签(认可.段, 认可.指纹);
  const 候选 = [...(段签齐(签) ? [{ 签, 抽样: 抽样路径(签) }] : []), ...读历史段签(认可.段, 认可.指纹)];
  const 要 = 认可.帧.map((f) => f.哈希).join();
  for (const c of 候选) {
    if (c.签.签名.间隔 !== 认可.间隔 || c.签.签名.帧.map((f) => f.哈希).join() !== 要) continue;
    if (await 收(出, async (tmp) => fs.copyFileSync(c.抽样, tmp, fs.constants.COPYFILE_FICLONE), 认可)) return '从段签';
  }
  if (!母版 || !fs.existsSync(母版)) return '没有来源';
  const v = 视频信息(母版);
  if (v.宽 !== 认可.宽 || v.高 !== 认可.高 || v.帧数 !== 认可.帧数) return '对不上';
  return (await 收(出, (tmp) => 写抽样(母版, 认可.帧数, 认可.间隔, tmp), 认可)) ? '从认可母版' : '对不上';
};

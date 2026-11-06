// 认可参考：认可那一版的抽样帧（全分辨率 FFV1，存解出来的 yuv420p 原样），存 认可参考/<作品>/<平台>/<段键>/<指纹前 16 位>-<抽样键>.mkv（数据根，不进 Git），
// 旁边同名 .json 是旁记（各帧 yuv sha，verify 逐帧核，见 参考像素.ts）。认可那版的母版删了，verify 照样能比像素（设计见 预览/1030-1755-母版管线重设计/01-推荐方案.md 第四节 C）。
// accept 时从认可那版的切片抽帧做（决策/0014）。CRF1 时代的认可（1440p）verify 直接报要重新认可，不再给它们找母版、补旁记（11-06 删了）。
// 文件名带认可记录的抽样键：同一指纹重渲后再 accept，新记录对应新文件名，旧参考不会冒充新认可（只写新文件，不删旧参考）。
// 抽之前核对切片就是认可那一版：认可那版指纹的段签（现在的，或重渲前挪进 历史/ 的）签名和认可记录是同一版，切片又正是那份段签记的。
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 认可参考文件 } from '../环境/配置.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 视频信息 } from '../渲/探测.ts';
import { 段画面路径 } from '../渲/段产物.ts';
import { 对得上母版, 读段签, 读历史段签, type 段签 } from '../段签/段签.ts';
import { 抽样帧, 抽样流, 抽样滤镜, sha } from './帧流.ts';
import { 旁记文件, type 旁记 } from './参考像素.ts';
import { 同一版, 抽样键, type 认可记录 } from './认可.ts';

/** 这条认可记录在这个平台的认可参考文件 */
export const 参考文件 = (认可: 认可记录, 平台: string, 作品?: string) => 认可参考文件(认可.段, 认可.指纹, 抽样键(认可), 平台, 作品);

export type 认可母版 = { 文件: string; 字节sha: string };

/** 认可那一版的切片：认可那版指纹的段签（现在的、历史/ 里的）有和认可记录同一版的，切片又对得上那份段签。不是 null */
export const 找认可母版 = async (认可: 认可记录): Promise<认可母版 | null> => {
  const 签们 = [读段签(认可.段, 认可.指纹), ...读历史段签(认可.段, 认可.指纹).map((h) => h.签)].filter((s): s is 段签 => !!s && 同一版(s.签名, 认可));
  const 切片 = 段画面路径(认可.段, 认可.指纹);
  for (const 签 of 签们) if (await 对得上母版(签, 切片)) return { 文件: 切片, 字节sha: 签.母版.字节sha };
  return null;
};

/** 把母版的抽样帧（首帧、每 间隔 帧、末帧）存成全分辨率 FFV1（无损，yuv420p 原样） */
const 写参考帧 = (母版: string, 帧数: number, 间隔: number, 出: string) =>
  跑(
    低优先级([
      配置('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', 母版, '-map', '0:v:0', '-vf', 抽样滤镜(帧数, 间隔), '-fps_mode', 'passthrough',
      '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slicecrc', '1', '-an', 出,
    ]),
    { 安静: true },
  );

/** 原子写旁记 */
const 写旁记 = (参考: string, 记: 旁记) => {
  const f = 旁记文件(参考);
  const tmp = `${f}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(记, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, f);
};

export type 参考结果 = '已有' | '从切片' | '对不上' | '没有来源';

/**
 * 给一条认可记录备好认可参考：已有就不动；不然从认可那一版的切片（找认可母版）抽。
 * 先写临时文件，帧数尺寸对、算好各帧 yuv sha 才收：先改名旁记、再改名参考（中途断了只留旁记，下次照样重抽）。
 * 同一指纹重渲过、现在的切片不是认可那版的，返回 '没有来源'（verify 退回块均值）
 */
export const 备参考 = async (认可: 认可记录, 平台: string): Promise<参考结果> => {
  const 出 = 参考文件(认可, 平台);
  if (fs.existsSync(出)) return '已有';
  const 母 = await 找认可母版(认可);
  if (!母) return '没有来源';
  fs.mkdirSync(path.dirname(出), { recursive: true });
  const tmp = path.join(path.dirname(出), `${path.basename(出, '.mkv')}.写入中-${process.pid}.mkv`);
  try {
    await 写参考帧(母.文件, 认可.帧数, 认可.间隔, tmp);
    const 帧们 = 抽样帧(认可.帧数, 认可.间隔);
    const v = 视频信息(tmp);
    if (v.帧数 !== 帧们.length || v.宽 !== 认可.宽 || v.高 !== 认可.高) return '对不上';
    const yuv: string[] = [];
    for await (const y of 抽样流(tmp, 帧们, 帧们, 认可.宽, 认可.高, 'yuv420p')) yuv.push(sha(y));
    if (yuv.length !== 帧们.length) return '对不上';
    写旁记(出, { 抽样键: 抽样键(认可), 帧: 帧们, yuv, 来源: '切片', 母版字节sha: 母.字节sha, 记于: new Date().toISOString() });
    fs.renameSync(tmp, 出);
    return '从切片';
  } finally {
    fs.rmSync(tmp, { force: true });
  }
};

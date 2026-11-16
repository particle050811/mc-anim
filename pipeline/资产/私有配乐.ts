// 私有配乐按 cue 现取（渲染那头见 engine/audio/私有配乐.ts）：段.ts 的 cue 里资产 id 以 配乐/ 开头、资产锁里在 私有 库的，打包前在
// <数据根>/cache/私有配乐/<id> 备一份：私有/ 里有字节就拷（APFS 上是克隆），缺了写一份盖得住本作品所有这条 cue 的静音 wav，并报出来。
// public 目录的 私有配乐 链到这个目录（pipeline/渲/public目录.ts）。缺了不报错（docs/架构.md：配乐缺了换静音；配音缺了照样失败，不走这里）。
// 拷而不链：Windows 上建文件符号链接要管理员权限。同一个 id 各作品、各 worktree 要的是同一份（id 换了版本另起 id，见作品资产表 配乐.toml），
// 所以这个目录各处共用；内容对不上才原子替换。
// 指纹：闭包里有 engine/audio/私有配乐.ts 的段，把本段 cue 里的私有配乐记成 sha 或「缺:静音」（指纹/指纹.ts），补上字节或换了字节就过期。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AssetCue, SegmentDef } from '../../engine/段/段定义.ts';
import { bytesPath, type AssetLock, type LockEntry } from './资产锁.ts';

export const privateMusicModule = 'engine/audio/私有配乐.ts';
export const privateMusicDir = (dataRoot: string) => path.join(dataRoot, 'cache', '私有配乐');
export const missingMarker = '缺:静音';

const silentSampleRate = 48000;

/** 这条 cue 的资产是不是按 cue 现取的私有配乐 */
export const isPrivateMusic = (id: string, assetLock: AssetLock) => id.startsWith('配乐/') && assetLock[id]?.lib === '私有';

/** 一段 cue 里的私有配乐 → sha（数据根里有字节）或 缺:静音；没有就是空表 */
export const segPrivateMusic = (segmentDef: Pick<SegmentDef, 'sound'>, assetLock: AssetLock, dataRoot: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const c of segmentDef.sound ?? []) if (c.asset !== undefined && isPrivateMusic(c.asset, assetLock)) out[c.asset] = fs.existsSync(bytesPath(assetLock[c.asset]!, dataRoot)) ? assetLock[c.asset]!.sha256 : missingMarker;
  return out;
};

/** 一条 cue 放到文件第几秒为止（静音要盖住它） */
const cueEndSec = (c: AssetCue) => (c.入点秒 ?? 0) + c.长秒 * (c.速率 ?? 1);

/** 单声道 16 位 PCM 的静音 wav（秒取整）：Remotion 混音时它是全零，和不放一样 */
export const silentWav = (durSec: number): Buffer => {
  const sampleCount = Math.ceil(durSec) * silentSampleRate;
  const dataBytes = sampleCount * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // 单声道
  b.writeUInt32LE(silentSampleRate, 24);
  b.writeUInt32LE(silentSampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataBytes, 40);
  return b;
};

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const fileShaOrNull = (f: string) => (fs.existsSync(f) ? sha(fs.readFileSync(f)) : null);

export type MissingMusic = { id: string; sec: number; expectedPath: string };

/**
 * 按这些段（一部作品的全部段）的 cue 备好 cache/私有配乐/<id>；返回缺字节、换成静音的。
 * 已经是想要的那份就不动；要换时先写临时文件再改名（别的渲染正在读也只会读到整份旧的或整份新的）。
 */
export const preparePrivateMusic = (segments: { segment: Pick<SegmentDef, 'sound'> }[], assetLock: AssetLock, dataRoot: string): MissingMusic[] => {
  const needed: Map<string, { entry: LockEntry; sec: number }> = new Map();
  for (const { segment: segmentDef } of segments) {
    for (const c of segmentDef.sound ?? []) {
      if (c.asset === undefined || !isPrivateMusic(c.asset, assetLock)) continue;
      const prevNeed = needed.get(c.asset);
      needed.set(c.asset, { entry: assetLock[c.asset]!, sec: Math.max(prevNeed?.sec ?? 0, cueEndSec(c)) });
    }
  }
  const missing: MissingMusic[] = [];
  for (const [id, { entry, sec: durSec }] of needed) {
    const targetPath = path.join(privateMusicDir(dataRoot), ...id.split('/'));
    const sourcePath = bytesPath(entry, dataRoot);
    const exists = fs.existsSync(sourcePath);
    // 静音多留 1 秒：cue 的长秒有小数，解码器读到文件尾前后可能多要几个样本
    const silence = exists ? null : silentWav(durSec + 1);
    if (!exists) missing.push({ id, sec: Math.ceil(durSec + 1), expectedPath: sourcePath });
    const wantedSha = exists ? entry.sha256 : sha(silence!);
    if (fileShaOrNull(targetPath) === wantedSha) continue;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = `${targetPath}.写入中-${process.pid}`;
    try {
      if (exists) fs.copyFileSync(sourcePath, tmp, fs.constants.COPYFILE_FICLONE);
      else fs.writeFileSync(tmp, silence!);
      // 库里的字节是只读的，拷出来的跟着只读；Windows 上改名盖不掉只读文件，这里放开
      fs.chmodSync(tmp, 0o644);
      fs.renameSync(tmp, targetPath);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return missing;
};

export const missingMusicHint = (x: MissingMusic) =>
  `私有配乐「${x.id}」的字节不在 ${x.expectedPath}，这次换成 ${x.sec} 秒静音渲（补上字节后段指纹会变，再渲就带歌；怎么补见仓库根 README.md）`;

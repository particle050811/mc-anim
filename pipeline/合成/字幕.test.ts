// 字幕表生成：断屏和排时间对旧项目基线（数据根 基线/<作品>/_表/ 的 台词落点.json、拼接表.tsv、字幕表.tsv、字幕.srt）；
// 配音从资产库取（旧台词 id 换新 id 查 作品/应力转动/旧名.tsv）。数据根不全时跳过基线那几条，合成的小例子照跑。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { baselineRoot } from '../环境/作品数据.ts';
import { dataPath } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { readAssetLock } from '../资产/资产锁.ts';
import { voicedSegments, placeSubtitles, subtitleTableTsv, srt, type LineLanding } from './字幕.ts';
import { breakScreens } from './字幕卡.ts';
import { readMono } from './音频.ts';

const tableDir = path.join(baselineRoot(), '_表');
const assetLock = readAssetLock();
const hasLibrary = (id: string) => !!assetLock[id] && fs.existsSync(dataPath(assetLock[id]!.lib, assetLock[id]!.sha256.slice(0, 2), assetLock[id]!.sha256));
const hasBaseline = fs.existsSync(path.join(tableDir, '台词落点.json')) && hasLibrary('字体/像素字');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// 旧项目基线和 store 里旧台词表的字节，键照旧是中文
type OldLanding = { id: string; 段: string; 起帧: number; 字: string; 角色: string; 位置: '下' | '思索上'; 屏们: { 字: string; 原: string; 分句: unknown[] }[]; 接上段: boolean };

const newLineId = () => {
  const m = new Map<string, string>();
  for (const line of fs.readFileSync(path.join(codeRoot(), '作品', '应力转动', '旧名.tsv'), 'utf8').split('\n')) {
    const [rowKind, oldId, newId] = line.split('\t');
    if (rowKind === '台词' && oldId && newId) m.set(oldId, newId);
  }
  return m;
};
// 6-3-2 思索里念的那句不走台词轨，配音是镜头自己的
const voiceAsset = (oldId: string, idMap: Map<string, string>) => (oldId === '6-3-2-李樱-压路机' ? '配音/镜头/6-3-2/李樱-压路机-改字' : `配音/${idMap.get(oldId)}`);
const assetFile = (id: string) => dataPath(assetLock[id]!.lib, assetLock[id]!.sha256.slice(0, 2), assetLock[id]!.sha256);

const readBaseline = () => {
  const landings = (JSON.parse(fs.readFileSync(path.join(tableDir, '台词落点.json'), 'utf8')) as OldLanding[]).filter((a) => !a.接上段);
  const concatRows = fs.readFileSync(path.join(tableDir, '拼接表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
  const startFrames = new Map(concatRows.map((r) => [r[0]!, Number(r[4])]));
  const totalFrames = concatRows.reduce((a, r) => a + Number(r[3]) - Number(r[2]), 0);
  return { landings, start: startFrames, totalFrameCount: totalFrames };
};

describe('字幕', () => {
  it('有声段：两截声音中间停 0.3 秒，算成两段；停不到 0.1 秒的并成一段', () => {
    const x = new Float32Array(48000 * 2);
    const soundSpan = (a: number, b: number) => {
      for (let i = Math.round(a * 48000); i < Math.round(b * 48000); i++) x[i] = 0.3 * Math.sin(i / 7);
    };
    soundSpan(0.1, 0.6);
    soundSpan(0.9, 1.2);
    soundSpan(1.25, 1.5);
    expect(voicedSegments(x)).toEqual([
      [0.1, 0.6],
      [0.9, 1.5],
    ]);
  });

  it.skipIf(!hasBaseline)('断屏：和旧项目 台词落点.json 的 屏们 一样', () => {
    for (const a of readBaseline().landings) expect(breakScreens(a.字), a.id).toEqual(a.屏们.map(({ 字: char, ...rest }) => ({ char, ...rest })));
  });

  it.skipIf(!hasBaseline || !hasFfmpeg)('排时间：落点按基线算，字幕表、SRT 和旧项目的一样（起止帧差不超过 1 帧）', () => {
    const { landings, start: startFrames, totalFrameCount: totalFrames } = readBaseline();
    const idMap = newLineId();
    const lineTable = JSON.parse(fs.readFileSync(assetFile('数据/配音/台词表'), 'utf8')) as Record<string, { 开口: number }>;
    const linePlacements: LineLanding[] = landings.map((a) => {
      // 新的 cue 帧是开口落在段内哪一帧（整数）；基线的 起帧 是文件头
      const mouthOpenSec = lineTable[a.id]?.开口 ?? 0;
      const cueFrame = Math.round(a.起帧 + mouthOpenSec * 24);
      return { id: a.id, segment: a.段, 段内帧: cueFrame, 文件头帧: startFrames.get(a.段)! + cueFrame - mouthOpenSec * 24, file: assetFile(voiceAsset(a.id, idMap)), voice: voiceAsset(a.id, idMap), char: a.字, character: a.角色, 位置: a.位置, 屏们: breakScreens(a.字) };
    });
    const soundByFile = new Map<string, Float32Array>();
    const readMonoCached = (f: string) => soundByFile.get(f) ?? soundByFile.set(f, readMono(f)).get(f)!;
    const { 屏们: screens } = placeSubtitles(linePlacements, totalFrames, 24, readMonoCached);
    // 旧表末尾的「接着放的后半截」行只是核对用，新管线不再记（cue 只在开口那段）
    const oldTable = fs.readFileSync(path.join(tableDir, '字幕表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).filter((r) => r[4]);
    const newTable = subtitleTableTsv(screens, 24).trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(newTable.length).toBe(oldTable.length);
    let sameCount = 0;
    newTable.forEach((r, i) => {
      const o = oldTable[i]!;
      expect(r.slice(0, 4), `第 ${i + 1} 屏`).toEqual(o.slice(0, 4));
      expect(Math.abs(Number(r[4]) - Number(o[4])), `${r[3]} 起帧`).toBeLessThanOrEqual(1);
      expect(Math.abs(Number(r[5]) - Number(o[5])), `${r[3]} 止帧`).toBeLessThanOrEqual(1);
      if (r[4] === o[4] && r[5] === o[5]) sameCount++;
    });
    console.log(`字幕表：${newTable.length} 屏里起止帧和基线完全一样的 ${sameCount} 屏`);
    // 只有基线里落点不是整数帧的几句（6-1-9b、6-4-5、6-4-6）可能差 1 帧
    expect(sameCount).toBeGreaterThanOrEqual(newTable.length - 8);
    const oldSrt = fs.readFileSync(path.join(tableDir, '字幕.srt'), 'utf8');
    expect(srt(screens, 24).split('\n\n').length).toBe(oldSrt.split('\n\n').length);
  }, 120_000);
});

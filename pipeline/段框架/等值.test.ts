// 抽到 engine/段 的通用部分和两部作品的用法对得上：清单.ts 尾部、分镜/时间.ts 的 resolveMoment、arrangeSegs（那边现在包一层调 engine/段，这里守包法：歌时刻、键↔名的换法）。
import { describe, expect, it } from 'vitest';
import { manifestTools } from '../../engine/段/清单工具.ts';
import { arrangeSegs, resolveMoment } from '../../engine/段/时间线.ts';
import { parseSongGrid, type SongMoment } from '../../engine/段/歌网格.ts';
import * as stressRotationManifest from '../../作品/应力转动/清单.ts';
import * as memoryCollageManifest from '../../作品/把回忆拼好给你/清单.ts';
import * as storyboard from '../../作品/把回忆拼好给你/分镜.ts';
import { sentences, beatGrid, originalDurSec } from '../../作品/把回忆拼好给你/配乐/网格.ts';

describe('清单工具 和两部作品 清单.ts 尾部逐键一样', () => {
  for (const [caseName, m] of [
    ['应力转动', stressRotationManifest],
    ['把回忆拼好给你', memoryCollageManifest],
  ] as const) {
    it(caseName, () => {
      const rebuilt = manifestTools(m.manifest);
      for (const t of m.manifest) {
        expect(rebuilt.segDir(t.key)).toBe(m.segDir(t.key));
        expect(rebuilt.segmentName(t)).toBe(m.segmentName(t));
        expect(rebuilt.segmentCode(t.key)).toBe(m.segmentCode(t.key));
      }
    });
  }
});

describe('时间线 + 歌网格 和 分镜.ts 的 resolveMoment、arrangeSegs 一样', () => {
  const axis = { fps: storyboard.fps, resolveTime: parseSongGrid(beatGrid, sentences) };
  it('拍、小节、句的各个点', () => {
    const times: SongMoment[] = [
      ...Array.from({ length: 131 }, (_, n) => ({ beat: n })),
      ...Array.from({ length: 33 }, (_, k) => ({ measure: k })),
      ...sentences.flatMap((s) => (['起', '止', '开口', ...(s.leadIn !== undefined ? ['前导' as const] : [])] as const).map((linePoint) => ({ 句: s.序, points: linePoint }))),
    ];
    for (const t of times) {
      const legacyTime = storyboard.resolveMoment(t, {});
      expect(resolveMoment(t, {}, axis)).toBe(legacyTime);
      expect(Math.round(resolveMoment(t, {}, axis) * storyboard.fps)).toBe(storyboard.toSongFrame(legacyTime));
    }
  });
  it('排段：同一串定义得出同样的窗口', () => {
    const defTable = { 驯服: { 在: { measure: 25 }, basis: '' }, 右键: { 在: { after: '驯服', addSec: -1 / 20 }, basis: '' } };
    const sequence = {
      name: '试',
      duration: originalDurSec,
      segments: [
        { key: '甲', start: { 句: 8, points: '起' as const }, end: { after: '右键', addSec: 0 }, basis: '' },
        { key: '乙', end: { frameCount: 30 }, basis: '' },
        { key: '丙', end: '放完' as const, basis: '' },
      ],
    };
    const legacyScheduled = storyboard.arrangeSegs(sequence, defTable);
    const scheduled = arrangeSegs({ name: sequence.name, duration: sequence.duration, segments: sequence.segments.map(({ key: segKey, ...x }) => ({ name: segKey, ...x })) }, defTable, axis);
    expect(scheduled.map(({ name: segName, ...w }) => ({ key: segName, ...w }))).toEqual(legacyScheduled);
  });
});

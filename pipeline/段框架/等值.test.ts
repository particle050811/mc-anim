// 抽到 engine/段 的通用部分和两部作品里原来那几份算出来要一样（原来的不动，新段用新的）。
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
        expect(rebuilt.segDir(t.键)).toBe(m.segDir(t.键));
        expect(rebuilt.segmentName(t)).toBe(m.segmentName(t));
        expect(rebuilt.segmentCode(t.键)).toBe(m.segmentCode(t.键));
      }
    });
  }
});

describe('时间线 + 歌网格 和 分镜.ts 的 解时刻、排段一样', () => {
  const axis = { fps: storyboard.fps, resolveTime: parseSongGrid(beatGrid, sentences) };
  it('拍、小节、句的各个点', () => {
    const times: SongMoment[] = [
      ...Array.from({ length: 131 }, (_, n) => ({ beat: n })),
      ...Array.from({ length: 33 }, (_, k) => ({ measure: k })),
      ...sentences.flatMap((s) => (['起', '止', '开口', ...(s.leadIn !== undefined ? ['前导' as const] : [])] as const).map((linePoint) => ({ 句: s.序, 点: linePoint }))),
    ];
    for (const t of times) {
      const legacyTime = storyboard.resolveMoment(t, {});
      expect(resolveMoment(t, {}, axis)).toBe(legacyTime);
      expect(Math.round(resolveMoment(t, {}, axis) * storyboard.fps)).toBe(storyboard.toSongFrame(legacyTime));
    }
  });
  it('排段：同一串定义得出同样的窗口', () => {
    const defTable = { 驯服: { 在: { measure: 25 }, 依据: '' }, 右键: { 在: { after: '驯服', addSec: -1 / 20 }, 依据: '' } };
    const sequence = {
      名: '试',
      时长: originalDurSec,
      segments: [
        { 键: '甲', 起: { 句: 8, 点: '起' as const }, 止: { after: '右键', addSec: 0 }, 依据: '' },
        { 键: '乙', 止: { 帧数: 30 }, 依据: '' },
        { 键: '丙', 止: '放完' as const, 依据: '' },
      ],
    };
    const legacyScheduled = storyboard.arrangeSegs(sequence, defTable);
    const scheduled = arrangeSegs({ 名: sequence.名, 时长: sequence.时长, segments: sequence.segments.map(({ 键: segKey, ...x }) => ({ 名: segKey, ...x })) }, defTable, axis);
    expect(scheduled.map(({ 名: segName, ...w }) => ({ 键: segName, ...w }))).toEqual(legacyScheduled);
  });
});

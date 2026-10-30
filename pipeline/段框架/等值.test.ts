// 抽到 engine/段 的通用部分和两部作品里原来那几份算出来要一样（原来的不动，新段用新的）。
import { describe, expect, it } from 'vitest';
import { 清单工具 } from '../../engine/段/清单工具.ts';
import { 排段, 解时刻 } from '../../engine/段/时间线.ts';
import { 歌网格解析, type 歌时刻 } from '../../engine/段/歌网格.ts';
import * as 应力清单 from '../../作品/应力转动/清单.ts';
import * as 回忆清单 from '../../作品/把回忆拼好给你/清单.ts';
import * as 分镜 from '../../作品/把回忆拼好给你/分镜.ts';
import { 句们, 网格, 原声时长 } from '../../作品/把回忆拼好给你/配乐/网格.ts';

describe('清单工具 和两部作品 清单.ts 尾部逐键一样', () => {
  for (const [名, m] of [
    ['应力转动', 应力清单],
    ['把回忆拼好给你', 回忆清单],
  ] as const) {
    it(名, () => {
      const 新 = 清单工具(m.清单);
      for (const t of m.清单) {
        expect(新.段目录(t.键)).toBe(m.段目录(t.键));
        expect(新.段名(t)).toBe(m.段名(t));
        expect(新.编号(t.键)).toBe(m.编号(t.键));
      }
    });
  }
});

describe('时间线 + 歌网格 和 分镜.ts 的 解时刻、排段一样', () => {
  const 轴 = { fps: 分镜.fps, 解析: 歌网格解析(网格, 句们) };
  it('拍、小节、句的各个点', () => {
    const 时刻们: 歌时刻[] = [
      ...Array.from({ length: 131 }, (_, n) => ({ 拍: n })),
      ...Array.from({ length: 33 }, (_, k) => ({ 小节: k })),
      ...句们.flatMap((s) => (['起', '止', '开口', ...(s.前导 !== undefined ? ['前导' as const] : [])] as const).map((点) => ({ 句: s.序, 点 }))),
    ];
    for (const t of 时刻们) {
      const 旧 = 分镜.解时刻(t, {});
      expect(解时刻(t, {}, 轴)).toBe(旧);
      expect(Math.round(解时刻(t, {}, 轴) * 分镜.fps)).toBe(分镜.歌曲帧(旧));
    }
  });
  it('排段：同一串定义得出同样的窗口', () => {
    const 表 = { 驯服: { 在: { 小节: 25 }, 依据: '' }, 右键: { 在: { 接: '驯服', 加秒: -1 / 20 }, 依据: '' } };
    const 串 = {
      名: '试',
      时长: 原声时长,
      段们: [
        { 键: '甲', 起: { 句: 8, 点: '起' as const }, 止: { 接: '右键', 加秒: 0 }, 依据: '' },
        { 键: '乙', 止: { 帧数: 30 }, 依据: '' },
        { 键: '丙', 止: '放完' as const, 依据: '' },
      ],
    };
    const 旧 = 分镜.排段(串, 表);
    const 新 = 排段({ 名: 串.名, 时长: 串.时长, 段们: 串.段们.map(({ 键, ...x }) => ({ 名: 键, ...x })) }, 表, 轴);
    expect(新.map(({ 名, ...w }) => ({ 键: 名, ...w }))).toEqual(旧);
  });
});

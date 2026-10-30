// 原版挥手正本：和 库/角色/挥手.ts（FigurePose）、把回忆三份部件表副本（2-祭坛、2-第一晚、2-末地）在同一批 attackTime 上对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PartPose } from '../../engine/model/实体模型.tsx';
import { 取函数, 规范, 近似相等 } from '../../pipeline/检查/副本识别.ts';
import type { FigurePose } from './骨架.tsx';
import { 加挥手 as 旧加挥手, 挥手进度 as 旧挥手进度 } from './挥手.ts';
import { 加挥手, 挥手刻数, 挥手进度, 挥手部件, 挥手量 } from './史蒂夫挥手.ts';

const 根 = path.resolve(import.meta.dirname, '../..');
const 副本 = (文件: string, 名: string, 额外?: Record<string, unknown>) => 取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名, { 允许循环: true, 额外 });
/** 末位舍入以内一样（副本把几项加法换了顺序） */
const 约 = (a: unknown, b: unknown) => expect(近似相等(规范(a), 规范(b), 1e-12), JSON.stringify(规范(a))).toBe(true);
const 时刻 = [0.01, 0.1, 0.25, 0.5, 0.75, 0.99];
const 姿: FigurePose = { loc: [0, 0, 0], pitch: 0, squash: 0, headPitch: -12, headYaw: 5, legR: 0, legL: 0, armR: 10, armRRoll: 3, armL: -5, armLRoll: 0, twist: 4 };
/** steveParts 那样的部件表（身子、外套同一个对象，手臂、袖子同一个对象） */
const 部件 = (): Record<string, PartPose> => {
  const body: PartPose = { rot: [0.1, 0, 0.02] };
  const right_arm: PartPose = { offset: [-5, 2, 0], rot: [0.3, 0.1, 0.05] };
  const left_arm: PartPose = { offset: [5, 2, 0], rot: [-0.2, 0, -0.05] };
  return { head: { rot: [-0.3, 0.2, 0] }, body, jacket: body, right_arm, right_sleeve: right_arm, left_arm, left_sleeve: left_arm };
};

describe('原版挥手正本', () => {
  it('挥手进度：6 刻挥完，不在挥时给 0', () => {
    expect(挥手刻数).toBe(6);
    expect(挥手进度(0)).toBe(0);
    expect(挥手进度(0.15)).toBeCloseTo(0.5, 12);
    expect(挥手进度(0.3)).toBe(0);
    expect(挥手进度(0.15, 10)).toBeCloseTo(0.3, 12);
    for (const s of [-0.1, 0, 0.05, 0.2, 0.29, 0.31]) expect(挥手进度(s)).toBe(旧挥手进度(s));
  });
  it('挥手量：t = 0 不动；左手出手是右手的镜像', () => {
    const 零 = 挥手量(0, 0.3);
    expect(零.身转).toBe(0);
    expect(零.右臂.map((x) => x + 0)).toEqual([0, 0, 0]);
    for (const t of 时刻) {
      const 右 = 挥手量(t, 0.2, '右');
      const 左 = 挥手量(t, 0.2, '左');
      expect(左.身转).toBeCloseTo(-右.身转, 12);
      expect(左.左臂[0]).toBeCloseTo(右.右臂[0] + 左.身转 - 0, 12);
    }
  });
  it('挥手部件 不改传进来的表，身子和外套、手臂和袖子还是同一份', () => {
    const p = 部件();
    const 前 = 规范(p);
    const r = 挥手部件(p, 0.4);
    expect(规范(p)).toEqual(前);
    expect(r.jacket).toBe(r.body);
    expect(r.right_sleeve).toBe(r.right_arm);
    expect(挥手部件(p, 0)).toEqual(p);
  });
});

describe('原版挥手正本和旧副本对得上', () => {
  it('库/角色/挥手.ts 的 加挥手（FigurePose，度）', () => {
    for (const t of [0, 1, ...时刻]) {
      const 新 = 加挥手(姿, t) as unknown as Record<string, number>;
      const 旧 = 旧加挥手(姿, t) as unknown as Record<string, number>;
      for (const k of Object.keys(旧)) if (typeof 旧[k] === 'number') expect(新[k], `${k} t=${t}`).toBeCloseTo(旧[k]!, 9);
    }
  });
  it('2-祭坛 的 挥手部件（身子 yRot 是设成 body.yRot：底子的 yRot 为 0 时一样）', () => {
    const 旧 = 副本('作品/把回忆拼好给你/场/2-祭坛/人物.tsx', '挥手部件');
    for (const t of 时刻) 约(旧(部件(), t), 挥手部件(部件(), t));
  });
  it('2-第一晚 的 挥手部件（自己调 steveParts）', () => {
    const 旧 = 副本('作品/把回忆拼好给你/场/2-第一晚/史蒂夫.tsx', '挥手部件', { steveParts: () => 部件() });
    for (const t of 时刻) 约(旧(null, t), 挥手部件(部件(), t));
  });
  it('2-末地 的 叠挥手（原地改部件表）', () => {
    const 旧 = 副本('作品/把回忆拼好给你/场/2-末地/角色.tsx', '叠挥手');
    for (const t of 时刻) {
      const p = 部件();
      旧(p, t);
      约(p, 挥手部件(部件(), t));
    }
  });
});

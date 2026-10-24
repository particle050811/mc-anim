import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 做像素字 } from '@库/界面/像素字表.ts';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { 字节路径, 读作品资产锁 } from '../../../../pipeline/资产/资产锁.ts';
import { 封面框能放, 封面能放, 封面聊天框 } from './封面.ts';
import { 她, 头转范围, 机位, 气泡字 } from './参数.ts';

// 头比身子多转的角：她脚底到你眼睛的水平方向，和她身子朝向差多少（度）。
// 忽略头心离脚底那几厘米的水平偏移（库/角色/魔法酒狐.tsx 的 head.站 约 6 厘米），差不到 2°，所以两头各留 2° 的余量
const 朝你差 = () => {
  const [dx, dy] = [机位.脚[0] - 她.脚[0], 机位.脚[1] - 她.脚[1]];
  const 朝你 = (Math.atan2(-dx, dy) * 180) / Math.PI; // 同 骨架.tsx 的 yaw：0 朝北、正往西
  const 差 = 朝你 - 她.身子朝向;
  return ((((差 + 180) % 360) + 360) % 360) - 180;
};

describe('第 15 句重逢的站位', () => {
  it('身子侧着（和朝你差 70～95°），头多转的角夹在上限以后在 45～60° 里，脸离正对你差不到 20°', () => {
    const 正对 = Math.abs(朝你差());
    const 转 = Math.min(正对, 头转范围[1]);
    expect(正对).toBeGreaterThanOrEqual(70);
    expect(正对).toBeLessThanOrEqual(95);
    expect(转).toBeGreaterThanOrEqual(头转范围[0] - 2);
    expect(转).toBeLessThanOrEqual(75);
    expect(正对 - 转).toBeLessThanOrEqual(20);
  });
  it('她抬头看你过 15°（再平帽檐就压住眼睛）', () => {
    const 头高 = 1.152; // 库/角色/魔法酒狐.tsx 的 head.站
    const 远 = Math.hypot(机位.脚[0] - 她.脚[0], 机位.脚[1] - 她.脚[1]);
    expect((Math.atan2(机位.脚[2] + 1.62 - 头高, 远) * 180) / Math.PI).toBeGreaterThanOrEqual(15);
  });
});

// 封面构图：脸、气泡、封面聊天行都在 4:3 里、躲开底边 20% 和右下角。像素字表在数据根里，没有就跳过
const 作品根 = path.resolve(import.meta.dirname, '../..');
const 字条 = 读作品资产锁(作品根)['字体/把回忆拼好给你/像素字'];
const 有表 = !!字条 && fs.existsSync(字节路径(字条));

describe.skipIf(!有表)('封面构图', () => {
  const 字 = 做像素字(JSON.parse(fs.readFileSync(字节路径(字条!), 'utf8')), '字体/把回忆拼好给你/像素字');
  const [W, H] = [1280, 720];
  const cam = 做透视相机({ 眼: Z朝上转three([机位.脚[0], 机位.脚[1], 机位.脚[2] + 1.62]), 看: Z朝上转three(机位.看), 视角: 机位.视角, 宽: W, 高: H });
  const 投 = (z: number) => 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], z]), W, H);

  it('封面聊天行在 4:3 里、底边 20% 上面，像素格是整数', () => {
    const b = 封面聊天框(字.字宽('Steve加入了游戏'));
    expect(封面框能放(W, H, b)).toBe(true);
    for (const v of [b.x0 * 2, b.y0 * 2, b.x1 * 2, b.y1 * 2]) expect(Number.isInteger(v)).toBe(true);
  });
  it('气泡整个在画面里、在 4:3 里（库/界面/女仆气泡.tsx：锚在脚底 + 2 格，宽 = 字宽 + 10、高 19、尾巴往下 8，一气泡像素 0.025 格）', () => {
    const 锚 = 投(2.0);
    const 页 = Math.round(锚.每格 * 0.025 * 2) / 2;
    const 宽 = 字.字宽(气泡字) + 10;
    const b = { x0: 锚.x - (宽 / 2) * 页, x1: 锚.x + (宽 / 2) * 页, y0: 锚.y - 19 * 页, y1: 锚.y + 8 * 页 };
    expect(b.y0).toBeGreaterThan(8);
    expect(b.x0).toBeGreaterThan(160);
    expect(b.x1).toBeLessThan(1120);
  });
  it('脸（头心上下、左右各四分之一格）在 4:3 里、躲开底边和右下角，离 4:3 两边至少 40', () => {
    const 头 = 投(1.33);
    // 下巴：脸最下沿比颈部转轴（1.152）还低一点，静帧上量的是 1.1 格上下
    const 下巴 = 投(1.1);
    const 半宽 = 0.25 * 头.每格;
    for (const [x, y] of [
      [头.x - 半宽, 头.y],
      [头.x + 半宽, 头.y],
      [下巴.x, 下巴.y],
    ])
      expect(封面能放(W, H, x!, y!)).toBe(true);
    expect(头.x - 半宽).toBeGreaterThan(160 + 40);
    expect(头.x + 半宽).toBeLessThan(1120 - 40);
    // 右下角禁区从 y 518 起，下巴离它至少 20
    expect(下巴.y).toBeLessThan(518 - 20);
  });
});

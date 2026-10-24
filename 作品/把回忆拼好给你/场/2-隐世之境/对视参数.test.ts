import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 做像素字 } from '@库/界面/像素字表.ts';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { 字节路径, 读作品资产锁 } from '../../../../pipeline/资产/资产锁.ts';
import { 主厅门们 } from '../../地点/隐世之境主厅门数据.ts';
import { 封面框能放, 封面能放, 封面聊天框 } from './封面.ts';
import { 她, 头转范围, 气泡字 } from './参数.ts';
import { 对视取景, 对视气泡, 对视脚, 对视视角, 封面大字, 片里聊天宽, 聊天年龄刻, type 对视版 } from './对视参数.ts';
import { 笑 } from './重逢参数.ts';
import { 视图们 as 合照视图们 } from '../../核对/合照/视图.ts';

const 眼: [number, number, number] = [对视脚[0], 对视脚[1], 对视脚[2] + 1.62];

describe('49.96 对视的站位', () => {
  it('还在西门门洞那一格里（x 6～7、y −11～−10），碰撞箱（0.6 宽）碰不到开着的西门门扇', () => {
    expect(对视脚[0]).toBeGreaterThan(6);
    expect(对视脚[0]).toBeLessThan(7);
    expect(对视脚[1]).toBeGreaterThan(-11);
    // 门扇开到底：关着时的盒（取到 1/16 格就是门扇本身）绕转轴转 开角
    const { 盒, 轴, 开角 } = 主厅门们.西门.扇们[0]!;
    const 十六 = (v: number) => Math.round(v * 16) / 16;
    const [c, s] = [Math.cos((开角 * Math.PI) / 180), Math.sin((开角 * Math.PI) / 180)];
    const 角们 = [
      [十六(盒[0]), 十六(盒[1])],
      [十六(盒[3]), 十六(盒[4])],
    ].map(([x, y]) => [轴[0] + c * (x! - 轴[0]) - s * (y! - 轴[1]), 轴[1] + s * (x! - 轴[0]) + c * (y! - 轴[1])]);
    const 扇 = {
      x0: Math.min(...角们.map((p) => p[0]!)),
      x1: Math.max(...角们.map((p) => p[0]!)),
      y0: Math.min(...角们.map((p) => p[1]!)),
      y1: Math.max(...角们.map((p) => p[1]!)),
    };
    expect(扇.y0).toBeCloseTo(-10.1875);
    const 箱 = { x0: 对视脚[0] - 0.3, x1: 对视脚[0] + 0.3, y0: 对视脚[1] - 0.3, y1: 对视脚[1] + 0.3 };
    const 重叠 = 箱.x0 < 扇.x1 && 扇.x0 < 箱.x1 && 箱.y0 < 扇.y1 && 扇.y0 < 箱.y1;
    expect(重叠).toBe(false);
  });
  it('她身子侧着（和朝你差 65～95°），头转到上限以后脸离正对你差不到 20°，抬头看你过 15°', () => {
    const [dx, dy] = [眼[0] - 她.脚[0], 眼[1] - 她.脚[1]];
    const 朝你 = (Math.atan2(-dx, dy) * 180) / Math.PI;
    const 差 = Math.abs(朝你 - 她.身子朝向);
    expect(差).toBeGreaterThanOrEqual(65);
    expect(差).toBeLessThanOrEqual(95);
    expect(差 - Math.min(差, 头转范围[1])).toBeLessThanOrEqual(20);
    expect((Math.atan2(眼[2] - 1.152, Math.hypot(dx, dy)) * 180) / Math.PI).toBeGreaterThanOrEqual(15);
  });
  it('视角在原版视角设置能拉到的范围里（30～110）', () => {
    expect(对视视角).toBeGreaterThanOrEqual(30);
    expect(对视视角).toBeLessThanOrEqual(110);
  });
  it('聊天栏那行到这一帧约 27 刻，还没开始淡（原版 180 刻后才淡）', () => {
    expect(聊天年龄刻).toBeGreaterThan(25);
    expect(聊天年龄刻).toBeLessThan(180);
  });
  it('气泡缩放都是偶数、一个气泡像素都是画幅高的 1/90（三个画幅里气泡和她的头一样大）；封面大字也是偶数倍', () => {
    for (const 版 of ['片', 'B站封面', '竖版'] as const) {
      expect(对视气泡.缩放[版] % 2).toBe(0);
      expect(对视气泡.缩放[版] * 90).toBe(对视取景[版].高 * 2);
    }
    for (const 版 of ['B站封面', '竖版'] as const) expect(封面大字[版].缩放 % 2).toBe(0);
  });
  it('片里聊天栏的宽是原版设置「聊天栏宽度」调得出的（floor(设置 × 280 + 40)，设置 0～1）', () => {
    const 设置 = (片里聊天宽 - 40) / 280;
    expect(设置).toBeGreaterThanOrEqual(0);
    expect(设置).toBeLessThanOrEqual(1);
    expect(Math.floor(设置 * 280 + 40)).toBe(片里聊天宽);
  });
});

// 构图：气泡、脸、封面大字的落点。像素字表在数据根里，没有就跳过
const 作品根 = path.resolve(import.meta.dirname, '../..');
const 字条 = 读作品资产锁(作品根)['字体/把回忆拼好给你/像素字'];
const 有表 = !!字条 && fs.existsSync(字节路径(字条));

describe.skipIf(!有表)('49.96 对视的构图', () => {
  const 字 = 做像素字(JSON.parse(fs.readFileSync(字节路径(字条!), 'utf8')), '字体/把回忆拼好给你/像素字');
  const 投 = (版: 对视版, z: number) => {
    const { 宽, 高, 看 } = 对视取景[版];
    const cam = 做透视相机({ 眼: Z朝上转three(眼), 看: Z朝上转three(看), 视角: 对视视角, 宽, 高 });
    return 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], z]), 宽, 高);
  };
  // 气泡（库/界面/女仆气泡.tsx）：底边在锚点上，宽 = 字宽 + 10、高 19、尾巴往下 8；页面上一个气泡像素 = 缩放 / 2
  const 气泡框 = (版: 对视版, 文字 = 气泡字) => {
    const 锚 = 投(版, 对视气泡.锚高);
    const 页 = 对视气泡.缩放[版] / 2;
    const 宽 = 字.字宽(文字) + 10;
    return { x0: 锚.x - (宽 / 2) * 页, x1: 锚.x + (宽 / 2) * 页, y0: 锚.y - 19 * 页, y1: 锚.y + 8 * 页 };
  };

  it('片、B站封面：气泡整个在画里（离上沿至少 8）、在 4:3 里', () => {
    for (const 版 of ['片', 'B站封面'] as const) {
      const { 宽: W } = 对视取景[版];
      const b = 气泡框(版);
      expect(b.y0).toBeGreaterThan(8 * (W / 1280));
      expect(b.x0).toBeGreaterThan((W * 240) / 1920);
      expect(b.x1).toBeLessThan((W * 1680) / 1920);
    }
  });
  it('B 站多封面第三张（核对-合照 最后一帧）：用封面「片」那一版的机位，笑的气泡整个在画里（离上沿至少 8）、在 4:3 里', () => {
    const v = 合照视图们[合照视图们.length - 1]!;
    expect(v.封面机位).toBe(true);
    expect(v.气泡字).toBe(笑.气泡字);
    const b = 气泡框('片', 笑.气泡字);
    expect(b.y0).toBeGreaterThan(8);
    expect(b.x0).toBeGreaterThan((1280 * 240) / 1920);
    expect(b.x1).toBeLessThan((1280 * 1680) / 1920);
  });
  // 脸连两边头发宽 0.416 格（模型 x −4.42～5.82，按 0.65/16 缩）
  const 脸宽 = (10.24 * 0.65) / 16;
  it('B站封面：脸连头发至少占 16:9 卡片宽的 20%（主会话 10-24 美术定稿）', () => {
    expect(投('B站封面', 1.33).每格 * 脸宽).toBeGreaterThanOrEqual(对视取景.B站封面.宽 * 0.2);
  });
  it('B站封面：脸在 4:3 里、躲开底边和右下角；大字在 4:3 里、离 4:3 左沿至少 60 像素（1920 宽计）、不碰气泡、在底边 20% 上面，像素格是整数', () => {
    const [W, H] = [对视取景.B站封面.宽, 对视取景.B站封面.高];
    const 头 = 投('B站封面', 1.33);
    const 下巴 = 投('B站封面', 1.1);
    const 半宽 = (脸宽 / 2) * 头.每格;
    for (const [x, y] of [
      [头.x - 半宽, 头.y],
      [头.x + 半宽, 头.y],
      [下巴.x, 下巴.y],
    ])
      expect(封面能放(W, H, x!, y!)).toBe(true);
    const b = 封面聊天框(字.字宽('Steve加入了游戏'), 封面大字.B站封面);
    expect(封面框能放(W, H, b)).toBe(true);
    expect(b.x0 - (W * 240) / 1920).toBeGreaterThanOrEqual((60 * W) / 1920);
    // 气泡盒子（不含尾巴）在锚点以上；尾巴只在锚点左右几个气泡像素宽
    const g = 气泡框('B站封面');
    const 锚 = 投('B站封面', 对视气泡.锚高);
    expect(b.x1 <= g.x0 || b.y0 >= 锚.y).toBe(true);
    expect(b.x1).toBeLessThan(锚.x - 8 * (对视气泡.缩放.B站封面 / 2));
    for (const v of [b.x0 * 2, b.y0 * 2, b.x1 * 2, b.y1 * 2]) expect(Number.isInteger(v)).toBe(true);
  });
  it('竖版：气泡、大字都在画里，大字左右居中、在下巴底下', () => {
    const { 宽: W, 高: H } = 对视取景.竖版;
    const g = 气泡框('竖版');
    expect(g.x0).toBeGreaterThan(0);
    expect(g.x1).toBeLessThan(W);
    expect(g.y0).toBeGreaterThan(8);
    const b = 封面聊天框(字.字宽('Steve加入了游戏'), 封面大字.竖版);
    expect(Math.abs(b.x0 - (W - b.x1))).toBeLessThanOrEqual(1);
    expect(b.y1).toBeLessThan(H);
    expect(b.y0).toBeGreaterThan(投('竖版', 1.1).y);
  });
});

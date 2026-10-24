import { describe, expect, it, vi } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { heartStateAt, tamingHearts } from '@库/特效/爱心粒子.tsx';
import 段 from './段/2-祭坛召唤/段.ts';
import { 正片事件, 段内正片事件帧, 段窗口, 第几句, fps } from './分镜.ts';
import * as 参 from './场/2-祭坛/参数.ts';
import { 事, 刻, 你眼, 关键机位, 她编排, 手里, 挥手进度, 末帧, 末机位, 盒态, 盒生帧, 窗口, 镜头态, 浮物态们, 光柱 } from './场/2-祭坛/编排.ts';

// 爱心粒子.tsx 顶上就解码贴图（打包时才有 asset:），这里只要它的出生和运动，换成一张 1×1 的 RGBA
vi.mock('asset:贴图/特效/爱心粒子', () => ({
  default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
}));

type 点 = [number, number, number];
const 距 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 点到轴对齐盒子的最近距离 */
const 到盒 = (p: readonly number[], lo: 点, hi: 点) => Math.hypot(...[0, 1, 2].map((i) => Math.max(lo[i]! - p[i]!, 0, p[i]! - hi[i]!)));
const 减 = (a: readonly number[], b: readonly number[]): 点 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const 点乘 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const 叉 = (a: readonly number[], b: readonly number[]): 点 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const 单位 = (a: readonly number[]): 点 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

// 她两眼中点在最后一帧的位置（人物.tsx 的 她眼中(末帧)，要骨骼数据；这里抄一份实测值，只给镜头路线的测试用，差几厘米不影响）
const 眼中: 点 = [0.0108, -0.0341, 1.2391];
const 末 = (() => {
  const d = [你眼[0] - 眼中[0], 你眼[1] - 眼中[1], 你眼[2] - 眼中[2]];
  const l = Math.hypot(...d);
  return 末机位(眼中, [d[0]! / l, d[1]! / l, d[2]! / l]);
})();

describe('2-祭坛召唤：第 3 句整句一个镜头', () => {
  it('窗口从第 3 句首字到第 4 句首字（歌曲帧 201～283）', () => {
    const w = 段窗口('2-祭坛召唤');
    expect([w.起帧, w.止帧]).toEqual([201, 283]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(3).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(第几句(4).起, 1);
    expect(段.帧数).toBe(82);
    expect(段.场窗口).toEqual({ 起帧: 201, 止帧: 283 });
    expect(末帧).toBe(282);
  });

  it('三稿的拍：点祭坛 8.63，拆盒 9.06、9.48、9.91，光 10.33，递蛋糕 10.76，推眼睛 11.19（差不到半帧）', () => {
    const 对 = [
      [正片事件.第3句点祭坛, 8.63], [正片事件.第3句拆盒一, 9.06], [正片事件.第3句拆盒二, 9.48], [正片事件.第3句拆盒三, 9.91],
      [正片事件.第3句光, 10.33], [正片事件.第3句递蛋糕, 10.76], [正片事件.第3句推眼睛, 11.19],
    ] as const;
    for (const [e, 秒] of 对) expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
    const 序 = [事.点祭坛, 事.拆一, 事.拆二, 事.拆三, 事.光, 事.递, 事.照片, 事.推];
    expect([...序].sort((a, b) => a - b)).toEqual(序);
    expect(事.点祭坛).toBeGreaterThanOrEqual(窗口.起帧);
    expect(事.推).toBeLessThan(末帧);
  });

  it('照片那一帧：在递蛋糕和推眼睛之间，手里的蛋糕还在、她已经笑了', () => {
    expect(事.照片).toBeGreaterThan(事.递);
    expect(事.照片).toBeLessThan(事.推);
    expect(手里(事.照片)).toBe('蛋糕');
    expect(她编排(事.照片)).toMatchObject({ 抬: 1, 表情: '微笑' });
  });

  it('材料、盒子、她依次出来：点祭坛前材料在柱顶，盒子在拆一前带盖、拆二起墙往外倒、拆三起没了，她拆三起站着', () => {
    expect(浮物态们(事.点祭坛 - 1).every((s) => s.样 === '物')).toBe(true);
    expect(浮物态们(事.点祭坛).every((s) => s.样 === '亮')).toBe(true);
    expect(浮物态们(盒生帧)).toEqual([]);
    expect(盒态(盒生帧 - 1)).toBeNull();
    expect(盒态(盒生帧)).toMatchObject({ 盖: true, 墙: 0 });
    expect(盒态(事.拆一)).toMatchObject({ 盖: false, 墙: 0 });
    expect(盒态(事.拆二 + 1)!.墙).toBeGreaterThan(0);
    expect(盒态(事.拆三 - 1)!.墙).toBeLessThan(Math.PI / 6);
    expect(盒态(事.拆三)).toBeNull();
    expect(盒生帧).toBeLessThan(事.拆一);
    expect(她编排(事.拆三 - 1)).toBeNull();
    expect(她编排(事.拆三)).toMatchObject({ 抬: 0, 表情: '无' });
    expect(她编排(末帧)).toMatchObject({ 抬: 1, 表情: '微笑' });
  });

  it('你：先拿御币，「光」以后换蛋糕，递出去几刻后手空；五下右键各挥一次手', () => {
    expect(手里(窗口.起帧)).toBe('御币');
    expect(手里(事.光)).toBe('御币');
    expect(手里(事.递)).toBe('蛋糕');
    expect(手里(末帧)).toBeNull();
    for (const c of [事.点祭坛, 事.拆一, 事.拆二, 事.拆三, 事.递]) {
      expect(挥手进度(c - 1)).toBeNull();
      expect(挥手进度(c)).toBe(0);
    }
  });

  it('够得着：你的眼睛离蛋糕盒、她的碰撞箱都在 3 格内（原版生存模式实体交互距离）', () => {
    const [x, y] = 参.盒.位;
    expect(到盒(你眼, [x - 1, y - 1, 0], [x + 1, y + 1, 2])).toBeLessThan(3);
    const [hx, hy] = 参.她.脚;
    const w = 参.爱心.宽 / 2;
    expect(到盒(你眼, [hx - w, hy - w, 0], [hx + w, hy + w, 参.爱心.高])).toBeLessThan(3);
  });

  it('镜头：各关键机位按拍落定，末帧落在她两眼中点前 末距 格，一路不穿过你的脑袋', () => {
    const 键 = 关键机位(末);
    expect(键.map((k) => k.帧)).toEqual([窗口.起帧, 事.拆一, 事.拆三, 事.光 + 参.低头.抬头帧, 事.推, 末帧]);
    for (const k of 键) {
      const c = 镜头态(k.帧, 末);
      expect(距(c.眼, k.眼)).toBeLessThan(1e-9);
      expect(距(c.看, k.看)).toBeLessThan(1e-9);
    }
    expect(距(镜头态(末帧, 末).眼, 眼中)).toBeCloseTo(参.镜头.末距, 6);
    // 史蒂夫的头（脚上 1.5～2.0 格、8 像素见方，转头也在这块里），留 0.15 格
    const [px, py] = 参.你.脚;
    const lo: 点 = [px - 0.45, py - 0.45, 1.35];
    const hi: 点 = [px + 0.45, py + 0.45, 2.15];
    for (let g = 窗口.起帧; g <= 末帧; g += 0.1) expect(到盒(镜头态(g, 末).眼, lo, hi)).toBeGreaterThan(0);
  });

  it('镜头：整段越推越近（离她两眼中点只减不增），速度处处连续（推眼睛那一拍不一帧起速，核查 10-24），末帧停稳', () => {
    const 眼 = (g: number) => 镜头态(g, 末).眼;
    let 前 = Infinity;
    for (let g = 窗口.起帧; g <= 末帧; g += 0.25) {
      const d = 距(眼(g), 眼中);
      expect(d).toBeLessThanOrEqual(前 + 1e-12);
      前 = d;
    }
    // 关键机位两边的速度（格/帧）一样
    const ε = 1e-4;
    const 速 = (a: number, b: number) => [0, 1, 2].map((i) => (眼(b)[i]! - 眼(a)[i]!) / (b - a));
    for (const k of 关键机位(末).slice(1, -1)) expect(距(速(k.帧 - ε, k.帧), 速(k.帧, k.帧 + ε))).toBeLessThan(1e-3);
    // 逐帧：每帧走的距离、离她眼睛距离的对数每帧变的量，前后两帧差得不多（原来推眼睛那一帧一下多走 1.46 格）
    for (let g = 窗口.起帧; g + 2 <= 末帧; g++) {
      expect(Math.abs(距(眼(g + 2), 眼(g + 1)) - 距(眼(g + 1), 眼(g)))).toBeLessThan(0.25);
      const L = (x: number) => Math.log(距(眼(x), 眼中));
      expect(Math.abs(L(g + 2) - 2 * L(g + 1) + L(g))).toBeLessThan(0.1);
    }
    expect(距(眼(末帧 - 0.01), 眼(末帧)) / 0.01).toBeLessThan(0.01);
  });

  it('第三下之前她坐在盒子里看不见：镜头看她头顶的视线被朝你那面墙挡住（拆二以后墙往外倒的那十来度也算上）', () => {
    // cake_box.json：底厚 1 像素，四面墙各高 30 像素、离中心 15 像素；她乘骑放 chair 动作，头顶离盒底不到 1 格
    for (let g = 盒生帧; g < 事.拆三; g += 0.25) {
      const 盒 = 盒态(g)!;
      const c = 镜头态(g, 末);
      const 墙顶: [number, number] = [-15 / 16 - (30 / 16) * Math.sin(盒.墙), 盒.z + 1 / 16 + (30 / 16) * Math.cos(盒.墙)];
      const 头顶 = 盒.z + 1;
      const k = (墙顶[0] - c.眼[1]) / (0 - c.眼[1]);
      expect(c.眼[2] + (头顶 - c.眼[2]) * k).toBeLessThan(墙顶[1]);
    }
  });

  it('驯服爱心（种子 参.爱心.种子）：照片那一帧 7 颗都在画里，到末帧不从她脸前压过去，推眼睛时画里的爱心半边不过 45 像素（390 宽的手机）', () => {
    const 宽 = 390;
    const 高 = (宽 * 9) / 16;
    const 投 = (g: number, p: readonly number[]) => {
      const c = 镜头态(g, 末);
      const f = 单位(减(c.看, c.眼));
      const r = 单位(叉(f, [0, 0, 1]));
      const u = 叉(r, f);
      const d = 减(p, c.眼);
      const z = 点乘(d, f);
      const 半高 = Math.tan(((c.视角 / 2) * Math.PI) / 180);
      const 像素 = 高 / 2 / (z * 半高); // 这个深度上一格多少像素
      return { x: 宽 / 2 + 点乘(d, r) * 像素, y: 高 / 2 - 点乘(d, u) * 像素, z, 像素 };
    };
    const 心们 = tamingHearts(参.她.脚, 参.爱心.宽, 参.爱心.高, 刻(事.递), 参.爱心.种子);
    let 照片里 = 0;
    for (let g = 事.递; g <= 末帧; g++) {
      const 脸 = 投(g, 眼中);
      // 她的脸：推眼睛前算 0.56 × 0.5 格（连头发），推眼睛以后只算眼睛、鼻子那一条 0.44 × 0.24 格
      const 脸半 = g < 事.推 ? [0.28, 0.25] : [0.22, 0.12];
      for (const h of 心们) {
        const s = heartStateAt(h, 刻(g));
        if (!s || s.half === 0) continue;
        const p = 投(g, s.p);
        if (p.z <= 0.05) continue;
        const 半 = s.half * p.像素;
        if (p.x + 半 < 0 || p.x - 半 > 宽 || p.y + 半 < 0 || p.y - 半 > 高) continue;
        if (g === 事.照片 && p.x > 0 && p.x < 宽 && p.y > 0 && p.y < 高) 照片里++;
        if (g >= 事.推) expect(半).toBeLessThanOrEqual(45);
        const 在脸前 = p.z < 脸.z - 0.2;
        const 压脸 = Math.abs(p.x - 脸.x) < 脸半[0]! * 脸.像素 + 半 && Math.abs(p.y - 脸.y) < 脸半[1]! * 脸.像素 + 半;
        expect(在脸前 && 压脸).toBe(false);
      }
    }
    expect(照片里).toBe(7);
  });

  it('光柱在推眼睛之前退完；驯服爱心（活 17 刻）在末帧前没了，最后一帧干净', () => {
    expect(光柱(事.推)).toEqual([]);
    expect(光柱(事.光)).toHaveLength(参.光.光柱.宽.length);
    expect(刻(末帧) - 刻(事.递)).toBeGreaterThan(17);
  });

  it('cue：原声铺满整段；祭坛合成声文件头对着点祭坛，三下拆盒声最响那一下对着拍、峰值配到同一档；都不过段尾', () => {
    const 内 = 段内正片事件帧('2-祭坛召唤');
    const 声 = 段.声音 as 资产cue[];
    expect(声.find((c) => c.名 === '原声')).toMatchObject({ 帧: 0, 帧数: 82, 入点秒: 201 / 24, 增益: 参.原声增益 });
    const 合 = 声.find((c) => c.名 === '祭坛合成')!;
    expect(合.帧).toBe(内.第3句点祭坛);
    expect(20 * Math.log10(合.增益 as number) + 参.音效.祭坛.峰值).toBeCloseTo(参.音效.峰值, 3);
    const 拆 = 声.filter((c) => c.名.startsWith('拆盒'));
    expect(拆.map((c) => c.帧 + 参.音效.拆盒.峰帧)).toEqual([内.第3句拆盒一, 内.第3句拆盒二, 内.第3句拆盒三]);
    for (const c of 拆) expect(20 * Math.log10(c.增益 as number) + 参.音效.拆盒.峰值).toBeCloseTo(参.音效.峰值, 3);
    for (const c of 声) {
      expect(c.帧).toBeGreaterThanOrEqual(0);
      expect(c.帧 + (c.帧数 as number)).toBeLessThanOrEqual(段.帧数);
    }
  });
});

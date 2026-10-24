import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-祭坛召唤/段.ts';
import { 正片事件, 段内正片事件帧, 段窗口, 第几句, fps } from './分镜.ts';
import * as 参 from './场/2-祭坛/参数.ts';
import { 事, 刻, 你眼, 她编排, 手里, 挥手进度, 末帧, 末机位, 盒态, 盒生帧, 窗口, 镜头态, 浮物态们, 光柱 } from './场/2-祭坛/编排.ts';

type 点 = [number, number, number];
const 距 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 点到轴对齐盒子的最近距离 */
const 到盒 = (p: readonly number[], lo: 点, hi: 点) => Math.hypot(...[0, 1, 2].map((i) => Math.max(lo[i]! - p[i]!, 0, p[i]! - hi[i]!)));

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

  it('镜头：段首在起点，推眼睛那一拍到慢推止，末帧落在她两眼中点前 末距 格，一路不穿过你的脑袋', () => {
    expect(镜头态(窗口.起帧, 末).眼).toEqual(参.镜头.起.眼);
    expect(镜头态(事.推, 末).眼).toEqual(参.镜头.慢推止.眼);
    const 终 = 镜头态(末帧, 末);
    expect(距(终.眼, 末.眼)).toBeLessThan(1e-9);
    expect(距(终.看, 末.看)).toBeLessThan(1e-9);
    expect(距(终.眼, 眼中)).toBeCloseTo(参.镜头.末距, 6);
    // 史蒂夫的头（脚上 1.5～2.0 格、8 像素见方，转头也在这块里），留 0.15 格
    const [px, py] = 参.你.脚;
    const lo: 点 = [px - 0.45, py - 0.45, 1.35];
    const hi: 点 = [px + 0.45, py + 0.45, 2.15];
    for (let g = 窗口.起帧; g <= 末帧; g += 0.1) expect(到盒(镜头态(g, 末).眼, lo, hi)).toBeGreaterThan(0);
    // 越推越近
    let 前 = Infinity;
    for (let g = 事.推; g <= 末帧; g++) {
      const d = 距(镜头态(g, 末).眼, 眼中);
      expect(d).toBeLessThanOrEqual(前);
      前 = d;
    }
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

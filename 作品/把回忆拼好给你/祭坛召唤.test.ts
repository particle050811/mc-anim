import { describe, expect, it, vi } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { heartStateAt, tamingHearts } from '@库/特效/爱心粒子.tsx';
import 段 from './段/2-祭坛召唤/段.ts';
import { 正片事件, 段窗口, 第几句, fps } from './分镜.ts';
import * as 参 from './场/2-祭坛/参数.ts';
import { 事, 刻, 你眼, 关键机位, 她编排, 手里, 挥手进度, 末帧, 窗口, 镜头态, 浮物态们, 光柱 } from './场/2-祭坛/编排.ts';
import { 地面高 } from './场/2-祭坛/地形.ts';
import { 末她, 末机, 末距, 末速, 眼珠 } from './场/2-祭坛/末态.ts';

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

/** 页面（1280×720）上的投影：x、y、深度、这个深度上一格多少页面像素 */
const 页宽 = 1280;
const 页高 = 720;
const 投 = (g: number, p: readonly number[]) => {
  const c = 镜头态(g);
  const f = 单位(减(c.看, c.眼));
  const r = 单位(叉(f, [0, 0, 1]));
  const u = 叉(r, f);
  const d = 减(p, c.眼);
  const z = 点乘(d, f);
  const 像素 = 页高 / 2 / (z * Math.tan(((c.视角 / 2) * Math.PI) / 180));
  return { x: 页宽 / 2 + 点乘(d, r) * 像素, y: 页高 / 2 - 点乘(d, u) * 像素, z, 像素 };
};
const 在画里 = (p: { x: number; y: number; z: number }) => p.z > 0.05 && p.x >= 0 && p.x <= 页宽 && p.y >= 0 && p.y <= 页高;
/** 离她右眼眼珠多远的对数 */
const L = (g: number) => Math.log(距(镜头态(g).眼, 眼珠.右));
const 歌曲帧们 = (a: number, b: number, 步 = 1) => Array.from({ length: Math.floor((b - a) / 步) + 1 }, (_, i) => a + i * 步);

describe('2-祭坛召唤：第 3 句（远景立住地方，她现身时切近景，推到右眼）', () => {
  it('窗口从第 3 句首字到第 4 句首字（歌曲帧 201～283）', () => {
    const w = 段窗口('2-祭坛召唤');
    expect([w.起帧, w.止帧]).toEqual([201, 283]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(3).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(第几句(4).起, 1);
    expect(段.帧数).toBe(82);
    expect(段.场窗口).toEqual({ 起帧: 201, 止帧: 283 });
    expect(末帧).toBe(282);
  });

  it('拍：点祭坛 9.48，现身 9.91，光 10.33，递蛋糕 10.76，推眼睛 11.19（差不到半帧）；远景先立住地方一秒多，每个动作至少隔 0.4 秒', () => {
    const 对 = [
      [正片事件.第3句点祭坛, 9.48], [正片事件.第3句现身, 9.91], [正片事件.第3句光, 10.33], [正片事件.第3句递蛋糕, 10.76], [正片事件.第3句推眼睛, 11.19],
    ] as const;
    for (const [e, 秒] of 对) expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
    const 序 = [窗口.起帧, 事.点祭坛, 事.现身, 事.光, 事.递, 事.照片, 事.推, 末帧];
    expect([...序].sort((a, b) => a - b)).toEqual(序);
    expect((事.点祭坛 - 窗口.起帧) / fps).toBeGreaterThan(1);
    for (const [a, b] of [[事.点祭坛, 事.现身], [事.现身, 事.光], [事.光, 事.递], [事.递, 事.推], [事.推, 末帧]] as const) expect((b - a) / fps).toBeGreaterThan(0.4);
  });

  it('照片那一帧：在递蛋糕和推眼睛之间，手里的蛋糕还在、她已经笑了', () => {
    expect(事.照片).toBeGreaterThan(事.递);
    expect(事.照片).toBeLessThan(事.推);
    expect(手里(事.照片)).toBe('蛋糕');
    expect(她编排(事.照片)).toMatchObject({ 抬: 1, 表情: '微笑' });
  });

  it('没有蛋糕盒（用户 10-24「这里拆盒过程就多余了」）：材料在柱顶 → 点祭坛变白 → 化光飞到圈心，她现身那一帧光汇齐、她直接站在光里', () => {
    expect(浮物态们(事.点祭坛 - 1).every((s) => s.样 === '物')).toBe(true);
    expect(浮物态们(事.点祭坛).every((s) => s.样 === '亮')).toBe(true);
    expect(浮物态们(事.点祭坛 + 参.化光.亮帧).every((s) => s.样 === '光')).toBe(true);
    expect(浮物态们(事.现身)).toEqual([]);
    expect(她编排(事.现身 - 1)).toBeNull();
    expect(她编排(事.现身)).toMatchObject({ 抬: 0, 转: 0, 表情: '无' });
    expect(她编排(末帧)).toEqual({ 抬: 1, 转: 1, 表情: 末她.表情 });
    expect(参.她.脚).toEqual(末她.脚);
    expect(参.她.朝向).toBe(末她.朝向);
  });

  it('你：先拿御币，「光」以后换蛋糕，递出去几刻后手空；点祭坛、递蛋糕两下右键各挥一次手', () => {
    expect(手里(窗口.起帧)).toBe('御币');
    expect(手里(事.光)).toBe('御币');
    expect(手里(事.递)).toBe('蛋糕');
    expect(手里(末帧)).toBeNull();
    for (const c of [事.点祭坛, 事.递]) {
      expect(挥手进度(c - 1)).toBeNull();
      expect(挥手进度(c)).toBe(0);
    }
    expect(挥手进度(事.现身)).toBeNull();
  });

  it('够得着：你的眼睛离她的碰撞箱在 3 格内（原版生存模式实体交互距离）', () => {
    const [hx, hy] = 参.她.脚;
    const w = 参.爱心.宽 / 2;
    expect(到盒(你眼, [hx - w, hy - w, 0], [hx + w, hy + w, 参.爱心.高])).toBeLessThan(3);
  });

  it('背景不是超平坦：远景看得到的那片地（祭坛北边、东西两边）高低差好几格；祭坛脚下压平', () => {
    let 低 = Infinity;
    let 高 = -Infinity;
    for (let x = -40; x <= 40; x += 2)
      for (let y = 8; y <= 70; y += 2) {
        const h = 地面高(x, y);
        低 = Math.min(低, h);
        高 = Math.max(高, h);
      }
    expect(高 - 低).toBeGreaterThanOrEqual(6);
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) expect(Math.abs(地面高(x, y))).toBe(0);
  });

  it('镜头：各关键机位按拍落定；现身那一帧切（远景 → 近景），末帧落在 末态.ts 的 末机', () => {
    const 键 = 关键机位();
    expect(键.远.map((k) => k.帧)).toEqual([窗口.起帧, 事.点祭坛, 事.现身 - 1]);
    expect(键.近.map((k) => k.帧)).toEqual([事.现身, 事.光, 事.递, 事.推, 末帧]);
    for (const k of [...键.远, ...键.近]) {
      const c = 镜头态(k.帧);
      expect(距(c.眼, k.眼)).toBeLessThan(1e-9);
      expect(距(c.看, k.看)).toBeLessThan(1e-9);
      expect(c.视角).toBeCloseTo(k.视角, 9);
    }
    const 末 = 镜头态(末帧);
    expect(距(末.眼, 末机.眼)).toBeLessThan(1e-9);
    expect(距(末.看, 末机.看)).toBeLessThan(1e-9);
    expect(末.视角).toBeCloseTo(末机.视角, 9);
    expect(距(末.眼, 眼珠.右)).toBeCloseTo(末距, 9);
    // 切：两个镜头隔着好几格（是切，不是一帧里甩过去）
    expect(距(镜头态(事.现身 - 1).眼, 镜头态(事.现身).眼)).toBeGreaterThan(5);
  });

  it('镜头不赶（规矩 看得懂的速度）：远景、近景各自一共走不到 4 格，每帧不过 0.12 格；视角只收不放', () => {
    const 走 = (a: number, b: number) => {
      let 共 = 0;
      for (let g = a; g < b; g++) {
        const d = 距(镜头态(g + 1).眼, 镜头态(g).眼);
        expect(d, `歌曲帧 ${g}`).toBeLessThan(0.12);
        expect(镜头态(g + 1).视角).toBeLessThanOrEqual(镜头态(g).视角 + 1e-9);
        共 += d;
      }
      return 共;
    };
    expect(走(窗口.起帧, 事.现身 - 1)).toBeLessThan(4);
    expect(走(事.现身, 末帧)).toBeLessThan(4);
  });

  it('近景一路越推越近（离右眼眼珠只减不增），各关键机位两边速度连续；末帧推的速度正是 末速（第 4 句从这个速度接着推）', () => {
    for (let g = 事.现身; g < 末帧; g += 0.25) expect(L(g + 0.25)).toBeLessThanOrEqual(L(g) + 1e-12);
    const ε = 1e-4;
    const 速 = (a: number, b: number) => 减(镜头态(b).眼, 镜头态(a).眼).map((v) => v / (b - a));
    for (const k of 关键机位().近.slice(1, -1)) expect(距(速(k.帧 - ε, k.帧), 速(k.帧, k.帧 + ε))).toBeLessThan(1e-3);
    for (const k of 关键机位().远.slice(1, -1)) expect(距(速(k.帧 - ε, k.帧), 速(k.帧, k.帧 + ε))).toBeLessThan(1e-3);
    expect((L(末帧) - L(末帧 - ε)) / ε).toBeCloseTo(末速, 3);
    expect(末速).toBeLessThan(0);
  });

  it('近景在柱子圈里：镜头一直在前面两根柱子北面里边，不穿过你的脑袋，前柱进不了画（核查：长焦一镜到底时左前柱和你的背占了半个画面）', () => {
    // 前柱：中心 (±1.5, −3.5)，截面 17 像素见方（半边 0.53 格），高 3 格
    const 半 = 17 / 32;
    const [px, py] = 参.你.脚;
    for (let g = 事.现身; g <= 末帧; g += 0.25) {
      const c = 镜头态(g);
      expect(c.眼[1]).toBeGreaterThan(-3.5 + 半);
      expect(到盒(c.眼, [px - 0.45, py - 0.45, 1.35], [px + 0.45, py + 0.45, 2.15])).toBeGreaterThan(0);
    }
    for (const g of 歌曲帧们(事.现身, 末帧))
      for (const s of [-1, 1])
        for (let a = -半; a <= 半; a += 半 / 4)
          for (let z = 0; z <= 3; z += 0.25)
            for (const p of [[s * 1.5 + a, -3.5 + 半, z], [s * 1.5 + 半 * Math.sign(-s), -3.5 + a, z]] as 点[])
              expect(在画里(投(g, p)), `歌曲帧 ${g} 前柱 ${p.map((v) => v.toFixed(2))}`).toBe(false);
  });

  it(`驯服爱心（种子 ${参.爱心.种子}）：照片那一帧 7 颗都整个在画里，照片前后不顶到歌词那一条，到末帧不从她脸前压过去，推眼睛时在 390 宽的手机上半边不过 40 像素`, () => {
    const 心们 = tamingHearts(参.她.脚, 参.爱心.宽, 参.爱心.高, 刻(事.递), 参.爱心.种子);
    /** 她两眼中间（抬起头以后，模型实测） */
    const 头: 点 = [0, -0.03, 1.24];
    let 照片里 = 0;
    for (const g of 歌曲帧们(事.递, 末帧)) {
      const 脸 = 投(g, 头);
      for (const h of 心们) {
        const s = heartStateAt(h, 刻(g));
        if (!s || s.half === 0) continue;
        const p = 投(g, s.p);
        if (p.z <= 0.05) continue;
        const 半 = s.half * p.像素;
        if (p.x + 半 < 0 || p.x - 半 > 页宽 || p.y + 半 < 0 || p.y - 半 > 页高) continue;
        if (g === 事.照片 && p.x - 半 > 0 && p.x + 半 < 页宽 && p.y - 半 > 0 && p.y + 半 < 页高) 照片里++;
        // 一行歌词占画面上面 14%（界面/符文排版.ts），递蛋糕到照片后两帧爱心刚冒出来，要整颗看得见
        if (g <= 事.照片 + 2) expect(p.y - 半, `歌曲帧 ${g}`).toBeGreaterThan(0.14 * 页高);
        if (g >= 事.推) expect((半 * 390) / 页宽).toBeLessThanOrEqual(40);
        // 她的眼睛、鼻子那一条（两眼连眉 0.44 × 0.24 格）
        const 在脸前 = p.z < 脸.z - 0.2;
        const 压脸 = Math.abs(p.x - 脸.x) < 0.22 * 脸.像素 + 半 && Math.abs(p.y - 脸.y) < 0.12 * 脸.像素 + 半;
        expect(在脸前 && 压脸, `歌曲帧 ${g}`).toBe(false);
      }
    }
    expect(照片里).toBe(7);
  });

  it('光柱在推眼睛之前退完；驯服爱心（活 17 刻）在末帧前没了，最后一帧干净', () => {
    expect(光柱(事.推)).toEqual([]);
    expect(光柱(事.现身)).toHaveLength(参.光.光柱.宽.length);
    expect(刻(末帧) - 刻(事.递)).toBeGreaterThan(17);
  });

  it('cue：只有原声和祭坛合成声（拆盒声跟盒子一起删了）；原声铺满整段，合成声文件头对着点祭坛、峰值配到同一档，不过段尾', () => {
    const 声 = 段.声音 as 资产cue[];
    expect(声.map((c) => c.名)).toEqual(['原声', '祭坛合成']);
    expect(声[0]).toMatchObject({ 帧: 0, 帧数: 82, 入点秒: 201 / 24, 增益: 参.原声增益 });
    const 合 = 声[1]!;
    expect(合.帧).toBe(事.点祭坛 - 窗口.起帧);
    expect(20 * Math.log10(合.增益 as number) + 参.音效.祭坛.峰值).toBeCloseTo(参.音效.峰值, 3);
    for (const c of 声) {
      expect(c.帧).toBeGreaterThanOrEqual(0);
      expect(c.帧 + (c.帧数 as number)).toBeLessThanOrEqual(段.帧数);
    }
  });
});

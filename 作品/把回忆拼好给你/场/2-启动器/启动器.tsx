// 启动器画面：一张成片分辨率的 2D 画布（同 库/界面/像素聊天栏.tsx：预览级由浏览器缩一半），画 画启动器.ts 的启动器，片尾再在上面画飞着的碎片。
// 钻进图标时图标里透掉的照片像素是透明的，段把新世界垫在这张画布下面，就从图标框里露出来。
import React, { useLayoutEffect, useRef } from 'react';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 行高 } from '@库/界面/像素字表.ts';
import { 启动器字 } from '../../界面/启动器字.ts';
import { 图标边 } from '../../界面/实例图标.ts';
import { 碎片, 署名, 色 } from './参数.ts';
import { 碎块们, 碎块在, 阈 } from './编排.ts';
import { 方块图标, 投, 画启动器, type 启动器状态, type 投影 } from './画启动器.ts';

const 块 = 碎片.碎块边;

/** 片尾第 f 帧（段内）的图标：旧图标上，已经飞到的碎块换成新图标那一块 */
export const 拼到一半 = (旧: Uint8Array, 新: Uint8Array, f: number): Uint8Array => {
  const out = new Uint8Array(旧);
  for (const b of 碎块们) {
    if (!碎块在(b, f).到) continue;
    for (let y = 0; y < 块; y++) {
      const o = ((b.j * 块 + y) * 图标边 + b.i * 块) * 4;
      out.set(新.subarray(o, o + 块 * 4), o);
    }
  }
  return out;
};

/** 还在飞的碎块：每块 块×块 个照片像素，按 换 的比例一个像素一个像素地（Bayer）从方块贴图换成新图标那一块 */
const 画飞块 = (ctx: CanvasRenderingContext2D, P: 投影, 新: Uint8Array, f: number) => {
  for (const b of 碎块们) {
    const s = 碎块在(b, f);
    if (s.到) continue;
    const 料 = 方块图标(b.料);
    const 步 = s.边 / 块;
    for (let y = 0; y < 块; y++)
      for (let x = 0; x < 块; x++) {
        let r: number, g: number, bl: number;
        if (阈(x, y) < s.换) {
          const o = ((b.j * 块 + y) * 图标边 + b.i * 块 + x) * 4;
          [r, g, bl] = [新[o]!, 新[o + 1]!, 新[o + 2]!];
        } else {
          // 16×16 的贴图隔一个取一个，缩成 块×块
          const o = ((y * 16) / 块) * 16 * 4 + ((x * 16) / 块) * 4;
          // 樱花树叶这类镂空贴图：透明的像素不画
          if (料[o + 3]! < 128) continue;
          [r, g, bl] = [料[o]!, 料[o + 1]!, 料[o + 2]!];
        }
        const x0 = P.x(s.x + x * 步), y0 = P.y(s.y + y * 步);
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        ctx.fillRect(x0, y0, P.x(s.x + (x + 1) * 步) - x0, P.y(s.y + (y + 1) * 步) - y0);
      }
  }
};

export type 启动器属性 = {
  状态: 启动器状态;
  /** 片尾：飞着的碎片（段内帧、新图标）；不给 = 没有 */
  碎片?: { f: number; 新: Uint8Array };
  /** 页面尺寸，默认 1280×720 */
  宽?: number;
  高?: number;
};

/** 铺满画面，放在 position 不是 static 的容器里 */
export const 启动器: React.FC<启动器属性> = ({ 状态, 碎片: 碎, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    画启动器(ctx, W, H, 状态);
    if (碎) 画飞块(ctx, 投(状态.取景, W, H), 碎.新, 碎.f);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

/** 片尾署名（措辞未定，参数.ts 的 署名.字 是占位）：右下角一行灰色小字，单独一张画布，段把它放在白光上面（不过整片后期、不被白光盖住） */
export const 署名层: React.FC<{ 宽?: number; 高?: number }> = ({ 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const s = 署名.尺;
    const 字宽 = 启动器字.字宽(署名.字);
    启动器字.画(ctx, 署名.字, { x: W - 署名.边距 - 字宽 * s, y: H - 署名.边距 - 行高 * s }, 0, 0, 色.署名, s);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

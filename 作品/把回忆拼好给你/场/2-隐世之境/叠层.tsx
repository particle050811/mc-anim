// 第 15 句重逢这一场叠在 3D 画布上面的 2D：她头顶的车万女仆气泡、封面版聊天行。都放在铺满画面、position 不是 static 的容器里（AbsoluteFill）。
// 气泡照游戏挂在名牌点上、按游戏里的大小（一个气泡像素 0.025 格）取整数缩放，所以跟着机位算：机位要和画 3D 的那台同一组参数。
// 封面版聊天行只在封面上用（片里是原版位置的 库/界面/像素聊天栏），位置、缩放见 参数.ts 的 封面聊天。
import React, { useLayoutEffect, useRef } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { 女仆气泡, 女仆气泡锚高, 气泡像素格 } from '@库/界面/女仆气泡.tsx';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { 聊天行不透明度 } from '@库/界面/像素聊天栏.tsx';
import { 成片倍数 } from '@库/界面/像素字表.ts';
import { 画幅 } from '../../分镜.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 她, 气泡字, 封面聊天 } from './参数.ts';
import { 门口机位 } from './布景.tsx';
import { 封面聊天框, type 框 } from './封面.ts';

type 透视机位 = { 眼: V3; 看: V3; 视角: number };

/** 气泡挂在哪、多大：锚 = 名牌点（脚底 + 女仆气泡锚高）投到页面上的位置（页面像素）；缩放 = 一个气泡像素在锚点处几个成片像素，四舍五入 */
export const 气泡摆法 = (机: 透视机位 = 门口机位, 脚: V3 = 她.脚, 宽: number = 画幅.宽, 高: number = 画幅.高) => {
  const cam = 做透视相机({ 眼: Z朝上转three(机.眼), 看: Z朝上转three(机.看), 视角: 机.视角, 宽, 高 });
  const p = 投影到页面(cam, Z朝上转three([脚[0], 脚[1], 脚[2] + 女仆气泡锚高()]), 宽, 高);
  return { 锚: { x: p.x, y: p.y }, 缩放: Math.max(1, Math.round(p.每格 * 气泡像素格 * 成片倍数)), 在前: p.在前 };
};

/** 她头顶的气泡。文字默认 参数 的 气泡字；弹出见 库/界面/女仆气泡.tsx */
export const 重逢气泡: React.FC<{ 文字?: string; 机位?: 透视机位; 脚?: V3; 弹出?: number }> = ({ 文字 = 气泡字, 机位 = 门口机位, 脚 = 她.脚, 弹出 }) => {
  const { 锚, 缩放, 在前 } = 气泡摆法(机位, 脚);
  if (!在前) return null;
  return <女仆气泡 锚={锚} 缩放={缩放} 文字={文字} 字体={像素字} 弹出={弹出} />;
};

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const 系统竖条 = [208, 208, 208]; // #D0D0D0，GuiMessageTag.system()

/** 封面版聊天行的黑条（页面像素），按 像素字 量字宽 */
export const 封面聊天行框 = (文字 = 'Steve加入了游戏', 布局 = 封面聊天): 框 => 封面聊天框(像素字.字宽(文字), 布局);

/** 封面版聊天行：一行原版聊天（黑条半透明、左边系统竖条、字带原版阴影），刚出来那一刻的不透明度。
 *  竖条 = false 不画左边那根灰竖条（第 15 句封面，主会话 10-24 美术定稿：去掉 B 站封面左边那根灰竖条），黑条照旧从 0 起 */
export const 封面聊天行: React.FC<{ 文字?: string; 色?: string; 布局?: typeof 封面聊天; 竖条?: boolean }> = ({
  文字 = 'Steve加入了游戏',
  色 = 黄,
  布局 = 封面聊天,
  竖条 = true,
}) => {
  const s = 布局.缩放;
  if (!Number.isInteger(s) || s < 1) throw new Error(`封面聊天行的缩放要是正整数（成片像素），给的是 ${s}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const 宽 = 像素字.字宽(文字) + 8;
  const a = 聊天行不透明度(0)!;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = `rgba(0,0,0,${a.底 / 255})`;
    ctx.fillRect(0, 0, 宽 * s, 9 * s);
    if (竖条) {
      ctx.fillStyle = `rgba(${系统竖条.join(',')},${a.字 / 255})`;
      ctx.fillRect(0, 0, 2 * s, 9 * s);
    }
    像素字.画(ctx, 文字, { x: 0, y: 0 }, 4, 1, 色, s, { 阴影: true, 不透明度: a.字 });
  });
  const b = 封面聊天框(像素字.字宽(文字), 布局);
  // 画布往下多 1 个界面像素，给字的阴影
  return (
    <canvas
      ref={ref}
      width={宽 * s}
      height={10 * s}
      style={{ position: 'absolute', left: b.x0, top: b.y0, width: (宽 * s) / 成片倍数, height: (10 * s) / 成片倍数 }}
    />
  );
};

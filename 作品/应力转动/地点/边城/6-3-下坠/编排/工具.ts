// 6-3 下坠编排共用的插值、向量小工具。
import type { V3 } from '@engine/model/parts.tsx';
import { smoothstep01, lerp, lerpV } from '@engine/core/数学.ts';
export const add = (a: number[], b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const D2R = Math.PI / 180;

// anim still、bench 的 --光影：打包时把 engine/三渲二/画布.tsx 整个换成 engine/三渲二/光影/试看画布.tsx（带光影层的同名组件），每份光影配置从页面环境变量取。
// 用户 11-02 要先出光影静帧给他挑：现有段的代码、指纹一点不动，只在这两个不留母版、不算指纹的命令里换。render 不认 --光影，母版不会混进光影画面。
// 一份配置是 JSON 或预设名（engine/三渲二/光影/预设.ts），「关」= 换上去的画布不开光影（核对替身和原画布逐像素一样）。
import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';
import type { Compiler } from 'webpack';
import { 代码根 } from '../环境/路径.ts';

/** 页面读的环境变量名（engine/三渲二/光影/试看画布.tsx 里同一个名字）。REMOTION_ 开头 Studio 才转给页面 */
export const 光影环境名 = 'REMOTION_ANIM_LIGHTING';

const 原画布 = () => path.join(代码根(), 'engine', '三渲二', '画布.tsx');
const 试看画布 = () => path.join(代码根(), 'engine', '三渲二', '光影', '试看画布.tsx');

type 解析数据 = { createData: { resource?: string; request?: string; userRequest?: string; rawRequest?: string; context?: string } };

/** 解析到原画布的 import 一律改指试看画布 */
export class 光影试看插件 {
  readonly 原: string;
  readonly 替: string;
  constructor(原: string, 替: string) {
    this.原 = 原;
    this.替 = 替;
  }
  apply(compiler: Compiler) {
    compiler.hooks.normalModuleFactory.tap('anim-光影试看', (nmf) => {
      nmf.hooks.afterResolve.tap('anim-光影试看', (r) => {
        const d = (r as unknown as 解析数据).createData;
        if (d.resource !== this.原) return;
        for (const k of ['resource', 'request', 'userRequest', 'rawRequest'] as const) if (d[k]) d[k] = d[k]!.split(this.原).join(this.替);
        // 模块的 context 是解析时按原文件定的，不跟着改，试看画布里的相对 import 会按原画布的目录解析（./画布.tsx 解析回自己）
        d.context = path.dirname(this.替);
      });
    });
  }
  toJSON() {
    return { 插件: 'anim-光影试看' };
  }
}

/** 套在 webpack改写 外面 */
export const 套光影试看 =
  (改写: WebpackOverrideFn): WebpackOverrideFn =>
  async (config) => {
    const c = await 改写(config);
    return { ...c, plugins: [...(c.plugins ?? []), new 光影试看插件(原画布(), 试看画布())] };
  };

export type 光影配置 = { 名: string; 值: string };

/** --光影 的值：分号隔开的几份，每份是预设名或 JSON（JSON 里写 名 当文件名后缀，没写用 预设） */
export const 解析光影 = (v: string): 光影配置[] =>
  v
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!s.startsWith('{')) return { 名: s, 值: JSON.stringify({ 预设: s }) };
      const o = JSON.parse(s) as { 名?: string; 预设?: string };
      const 名 = o.名 ?? o.预设 ?? '关';
      if (/[<>:"/\\|?*]/.test(名)) throw new Error(`光影配置的名字要能当文件名：${名}`);
      return { 名, 值: s };
    });

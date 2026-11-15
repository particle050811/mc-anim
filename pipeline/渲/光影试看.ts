// anim still、bench 的 --shading：打包时把段里引的 engine/三渲二/画布.tsx 换成 engine/三渲二/光影/试看画布.tsx（包一层原画布，光影的样式改从页面环境变量取），
// 没在作品默认值里开光影的段也能先出光影静帧给用户挑（用户 11-02），不用为试看改默认值、动指纹。只在这两个不留母版、不算指纹的命令里换，
// film 不认 --shading，切片不会混进试看的画面。一份配置是 JSON 或预设名（engine/三渲二/光影/预设.ts），「关」= 强制不开（段在默认值里开了也关）。
import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';
import type { Compiler } from 'webpack';
import { codeRoot } from '../环境/路径.ts';

/** 页面读的环境变量名（engine/三渲二/光影/试看画布.tsx 里同一个名字）。REMOTION_ 开头 Studio 才转给页面 */
export const shadingEnvName = 'REMOTION_ANIM_LIGHTING';

const baseCanvasPath = () => path.join(codeRoot(), 'engine', '三渲二', '画布.tsx');
const trialCanvasPath = () => path.join(codeRoot(), 'engine', '三渲二', '光影', '试看画布.tsx');

type ParsedData = {
  contextInfo?: { issuer?: string };
  createData: { resource?: string; request?: string; userRequest?: string; rawRequest?: string; context?: string };
};

/** 解析到原画布的 import 改指试看画布，试看画布自己引原画布的那一处不改 */
export class ShadingPreviewPlugin {
  readonly 原: string;
  readonly replacement: string;
  constructor(original: string, replacement: string) {
    this.原 = original;
    this.replacement = replacement;
  }
  apply(compiler: Compiler) {
    compiler.hooks.normalModuleFactory.tap('anim-光影试看', (nmf) => {
      nmf.hooks.afterResolve.tap('anim-光影试看', (r) => {
        const { contextInfo, createData: d } = r as unknown as ParsedData;
        if (d.resource !== this.原 || contextInfo?.issuer === this.replacement) return;
        for (const k of ['resource', 'request', 'userRequest', 'rawRequest'] as const) if (d[k]) d[k] = d[k]!.split(this.原).join(this.replacement);
        // 模块的 context 是解析时按原文件定的，不跟着改，试看画布里的相对 import 会按原画布的目录解析（./画布.tsx 解析回自己）
        d.context = path.dirname(this.replacement);
      });
    });
  }
  toJSON() {
    return { 插件: 'anim-光影试看' };
  }
}

/** 套在 webpack改写 外面 */
export const applyShadingTrial =
  (rewrite: WebpackOverrideFn): WebpackOverrideFn =>
  async (config) => {
    const c = await rewrite(config);
    return { ...c, plugins: [...(c.plugins ?? []), new ShadingPreviewPlugin(baseCanvasPath(), trialCanvasPath())] };
  };

export type ShadingConfig = { 名: string; 值: string };

/** --shading 的值：分号隔开的几份，每份是预设名或 JSON（JSON 里写 名 当文件名后缀，没写用 预设 的名字） */
export const parseShading = (v: string): ShadingConfig[] =>
  v
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!s.startsWith('{')) return { 名: s, 值: JSON.stringify({ preset: s }) };
      const o = JSON.parse(s) as { 名?: string; preset?: string | { 名?: string } };
      const shadingPresetName = o.名 ?? (typeof o.preset === 'string' ? o.preset : o.preset?.名) ?? '关';
      if (/[<>:"/\\|?*]/.test(shadingPresetName)) throw new Error(`光影配置的名字要能当文件名：${shadingPresetName}`);
      return { 名: shadingPresetName, 值: s };
    });

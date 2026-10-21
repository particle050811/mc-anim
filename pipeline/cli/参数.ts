// 命令行参数：位置参数 + --开关 + --键 值（也认 --键=值）；不认识的 -- 选项直接报错，不悄悄忽略。
export type 参数规格 = { 值?: readonly string[]; 开关?: readonly string[]; 多值?: readonly string[] };
export type 已解析 = { 位置: string[]; 值: Record<string, string>; 开关: Set<string>; 多值: Record<string, string[]> };

export class 用法错误 extends Error {}

export const 解析参数 = (args: readonly string[], 规格: 参数规格): 已解析 => {
  const r: 已解析 = { 位置: [], 值: {}, 开关: new Set(), 多值: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) {
      r.位置.push(a);
      continue;
    }
    const [名, 等号值] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (规格.开关?.includes(名)) {
      if (等号值 !== undefined) throw new 用法错误(`${名} 是开关，不带值`);
      r.开关.add(名);
    } else if (规格.值?.includes(名) || 规格.多值?.includes(名)) {
      const v = 等号值 ?? args[++i];
      if (v === undefined || (等号值 === undefined && v.startsWith('--'))) throw new 用法错误(`${名} 要带值`);
      if (规格.多值?.includes(名)) (r.多值[名] ??= []).push(v);
      else r.值[名] = v;
    } else {
      throw new 用法错误(`不认识的选项 ${名}`);
    }
  }
  return r;
};

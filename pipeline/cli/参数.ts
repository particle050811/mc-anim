// 命令行参数：位置参数 + --开关 + --键 值（也认 --键=值）；不认识的 -- 选项直接报错，不悄悄忽略。
export type ArgSpec = { 值?: readonly string[]; toggles?: readonly string[]; multiValue?: readonly string[] };
export type ParsedArgs = { 位置: string[]; 值: Record<string, string>; toggles: Set<string>; multiValue: Record<string, string[]> };

export class UsageError extends Error {}

export const parseArgs = (args: readonly string[], spec: ArgSpec): ParsedArgs => {
  const r: ParsedArgs = { 位置: [], 值: {}, toggles: new Set(), multiValue: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) {
      r.位置.push(a);
      continue;
    }
    const [flagName, inlineValue] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (spec.toggles?.includes(flagName)) {
      if (inlineValue !== undefined) throw new UsageError(`${flagName} 是开关，不带值`);
      r.toggles.add(flagName);
    } else if (spec.值?.includes(flagName) || spec.multiValue?.includes(flagName)) {
      const v = inlineValue ?? args[++i];
      if (v === undefined || (inlineValue === undefined && v.startsWith('--'))) throw new UsageError(`${flagName} 要带值`);
      if (spec.multiValue?.includes(flagName)) (r.multiValue[flagName] ??= []).push(v);
      else r.值[flagName] = v;
    } else {
      throw new UsageError(`不认识的选项 ${flagName}`);
    }
  }
  return r;
};

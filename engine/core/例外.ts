// 规矩例外：段或场里不照全片默认值的地方，写 exception('规矩id', 值, { segment, cause }) 拿值（场里写 scene），同时在作品的 规矩.toml 那条规矩的 exceptions 里登记。
// anim check 双向核对（代码里的都登记了、登记了的代码里都有），所以三个参数的规矩 id、段/场、原因都要写字面量。
// 场里被别的场的段借用的代码（如 6-3-下坠/画面.tsx），segment 可以写成几个段键的数组，表里每段登记一条。
export type RuleExceptionBasis = { segment: string | readonly string[]; scene?: never; cause: string } | { scene: string; segment?: never; cause: string };

export const exception = <T>(ruleId: string, value: T, basis: RuleExceptionBasis): T => {
  if (!ruleId || !basis.cause) throw new Error('例外 要写规矩 id 和原因');
  return value;
};

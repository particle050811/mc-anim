// 规矩例外：段或场里不照全片默认值的地方，写 例外('规矩id', 值, { 段, 原因 }) 拿值，同时在 rules/规矩.toml 那条规矩的 例外 里登记。
// sr check 双向核对（代码里的都登记了、登记了的代码里都有），所以三个参数的规矩 id、段/场、原因都要写字面量。
export type 例外依据 = { 段: string; 场?: never; 原因: string } | { 场: string; 段?: never; 原因: string };

export const 例外 = <T>(规矩id: string, 值: T, 依据: 例外依据): T => {
  if (!规矩id || !依据.原因) throw new Error('例外 要写规矩 id 和原因');
  return 值;
};

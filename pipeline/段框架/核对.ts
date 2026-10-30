// anim check 的 加载 规则调这里：段框架的段，生成的声音表、声音地址要和 段.ts 现在的 cue 对得上（不量音频，数取锁里的、缓存的或盘上表里的）。
import type { 报告, 检查上下文 } from '../检查/上下文.ts';
import type { 段项 } from '../检查/内容.ts';
import { 是框架段 } from '../../engine/段/窗口段.ts';
import { 核对一段, type 台词行 } from './生成.ts';
import { 已知音频数 } from './音频数.ts';

export const 查段框架 = async (c: 检查上下文, 报: 报告, 段们: readonly 段项[]) => {
  const 框架段 = 段们.filter((s) => s.定义 && 是框架段(s.定义));
  if (!框架段.length) return;
  const 两锁 = c.资产锁();
  const 锁 = { ...两锁.共用, ...两锁.作品 };
  let 台词表: 台词行[] = [];
  try {
    台词表 = ((c.读toml(c.作品路径('台词.toml'))?.['台词'] ?? []) as 台词行[]);
  } catch {
    // 台词.toml 解析失败由 台词 规则报
  }
  const 片 = 段们.filter((s) => s.章 !== '核对');
  for (const s of 框架段) {
    const i = 片.indexOf(s);
    const 上一段 = async () => (i > 0 ? 片[i - 1]!.定义 : undefined);
    const 问题 = await 核对一段(s.定义!, c.绝对(s.目录), c.根, { 锁, 台词表, 取数: (id) => 已知音频数(锁[id], c.数据根), 上一段 });
    for (const x of 问题) 报.错(`${s.键}：${x}`, s.段文件);
  }
  报.信息.push(`段框架的段 ${框架段.length} 个，生成的声音表、声音地址都核对过`);
};

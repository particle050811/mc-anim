// 加载不变量：在 Node 里执行全部纯模块（清单、段定义、设置值、各段 段.ts、各场 时间线.ts 和 末态.ts），
// 模块里写的 throw 断言（帧数对不上、事件顺序反了……）在这里就会炸，不用等到渲染。
// 段框架的段（窗口段）另核对 anim cues 生成的声音表、声音地址和 段.ts 的 cue 对得上（段框架/生成.ts 的 核对一段）。
import { 读内容 } from '../内容.ts';
import { 是纯模块, type 报告, type 检查上下文 } from '../上下文.ts';
import { 查段框架 } from '../../段框架/核对.ts';

export const 加载 = async (c: 检查上下文, 报: 报告) => {
  const 纯们 = c.本作品文件().filter(是纯模块);
  for (const p of 纯们) {
    const r = await c.加载(p);
    if (r.错误) 报.错(`执行出错：${r.错误}`, p);
  }
  const 内容 = await 读内容(c);
  if ('错误' in 内容) return; // 清单本身执行出错，上面已报
  for (const s of 内容.段们) if (s.错误 && !s.错误.includes('执行出错')) 报.错(s.错误, s.段文件);
  报.信息.push(`执行了 ${纯们.length} 个纯模块`);
  await 查段框架(c, 报, 内容.段们);
};

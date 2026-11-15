// 加载不变量：在 Node 里执行全部纯模块（清单、段定义、设置值、各段 段.ts、各场 时间线.ts 和 末态.ts），
// 模块里写的 throw 断言（帧数对不上、事件顺序反了……）在这里就会炸，不用等到渲染。
// 段框架的段（窗口段）另核对 anim cues 生成的声音表、声音地址和 段.ts 的 cue 对得上（段框架/生成.ts 的 核对一段）。
// 段、场、核对目录下的 环境.ts 另查声明（环境声明.ts：描述合法、画法有模块、关键帧在段里）。
// 作品的 地点/地形改动.ts 另核挖框、整平都落在世界声明的保真范围里（地形改动.ts）。
import { readContent } from '../内容.ts';
import { isPureModule, type CheckReport, type CheckContext } from '../上下文.ts';
import { checkSegFramework } from '../../段框架/核对.ts';
import { checkEnvDecl } from '../环境声明.ts';
import { checkTerrainChanges } from '../地形改动.ts';

export const checkLoad = async (c: CheckContext, report: CheckReport) => {
  const pureFiles = c.workFiles().filter(isPureModule);
  for (const p of pureFiles) {
    const r = await c.loadModule(p);
    if (r.错误) report.错(`执行出错：${r.错误}`, p);
  }
  const parsedContent = await readContent(c);
  if ('错误' in parsedContent) return; // 清单本身执行出错，上面已报
  for (const s of parsedContent.segments) if (s.错误 && !s.错误.includes('执行出错')) report.错(s.错误, s.段文件);
  report.infoLines.push(`执行了 ${pureFiles.length} 个纯模块`);
  await checkSegFramework(c, report, parsedContent.segments);
  await checkEnvDecl(c, report, parsedContent.segments);
  await checkTerrainChanges(c, report);
};

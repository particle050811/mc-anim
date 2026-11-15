// anim check 的十一类规则（方案三-6，副本是 10-30 整体优化方案 0.6 加的，时间是 11-06 原生 60 帧加的，标识符是 11-15 代码名改英文加的）：类型、结构、清单、加载、台词、资产、规矩、平台、副本、时间、标识符。没有白名单：违规就改代码或改表。
// 一次查一部作品（选项 作品；不给且只有一部就查它）；漫剧专属的表（台词、旧名、规矩）作品里没有、也没用到就跳过。
// 「待迁移」不算违规：落点、例外还在旧项目、对应的段或场没搬进来的，列出来提醒，搬完自然消失。
import { CheckReport, CheckContext, ruleNames, type RuleKind } from './上下文.ts';
import { typeCheck } from './规则/类型.ts';
import { checkStructure } from './规则/结构.ts';
import { checkManifest } from './规则/清单.ts';
import { checkLoad } from './规则/加载.ts';
import { checkLines } from './规则/台词.ts';
import { checkAssets } from './规则/资产.ts';
import { ruleCheck } from './规则/规矩.ts';
import { checkPlatform } from './规则/平台.ts';
import { copyRule } from './规则/副本.ts';
import { time } from './规则/时间.ts';
import { hanIdentifierRule } from './规则/标识符.ts';

export const ruleTable: Record<RuleKind, { 说明: string; 跑: (c: CheckContext, report: CheckReport) => Promise<void> | void }> = {
  types: { 说明: 'tsc strict；Python 的 ruff、pyright；改到 mod 时编译 mod、跑暮色网格核对和游戏导表出表核对（test/twilight-grid-test.sh、game-data-test.sh）', 跑: typeCheck },
  structure: { 说明: '分层、作品不互引、段不互引、不引核对、纯模块闭包、getInputProps、渲染代码的确定性、pipeline 渲染器统一入口与测试 mock', 跑: checkStructure },
  manifest: { 说明: '段目录和清单一一对应、段键段名合规唯一、不撞旧名、连续段接帧', 跑: checkManifest },
  load: { 说明: '在 Node 里执行全部纯模块，断言都跑到；环境.ts 的声明（时刻、天气、档位、画法、关键帧）合法；作品的地形改动落在世界声明的保真范围里', 跑: checkLoad },
  lines: { 说明: 'cue 的台词都登记、每句恰好开口一次（接上段的接在开口后面）、开口和字幕位置、文本哈希和成品 sha、口型绑定成品、句模块跟得上', 跑: checkLines },
  assets: { 说明: '引用的 id 都登记、共用和作品两侧的表锁对得上、许可来源可见性齐全、公开构建无私有资产、角色包；--deep 逐个核 sha', 跑: checkAssets },
  rules: { 说明: '例外 和 作品的 规矩.toml 双向对得上、默认值落点在、出处引用的记忆在', 跑: ruleCheck },
  platform: { 说明: 'Windows 合法文件名、结构层 ASCII、不开 shell、不用 fcntl', 跑: checkPlatform },
  dupes: { 说明: 'lerp、toThree、Cam 这类共用函数不许新写副本（import engine/core、库 的正本）；旧副本冻在 docs/副本表.tsv，只许减少', 跑: copyRule },
  time: { 说明: '段、场、库的画面按秒写，不直接调 useCurrentFrame()（用 engine/段/时间.tsx），没有例外', 跑: time },
  idents: { 说明: '代码里不新增中文标识符（字符串、注释、文件名不算）；现有的冻在 pipeline/检查/中文标识符基线.txt，只许减少', 跑: hanIdentifierRule },
};

export type CheckOptions = { 只?: readonly RuleKind[]; 快?: boolean; depthCheck?: boolean; dataRoot?: string; 作品?: string };

export const runChecks = async (root: string, options: CheckOptions = {}): Promise<Map<RuleKind, CheckReport>> => {
  const c = new CheckContext(root, { depthCheck: options.depthCheck, dataRoot: options.dataRoot, 作品: options.作品 });
  const reports = new Map<RuleKind, CheckReport>();
  try {
    for (const ruleName of ruleNames) {
      if (options.只?.length && !options.只.includes(ruleName)) continue;
      const report = new CheckReport();
      if (options.快 && ruleName === 'types') report.跳过.push('--fast：不跑 tsc、ruff、pyright、gradle');
      else {
        try {
          await ruleTable[ruleName].跑(c, report);
        } catch (e) {
          report.错(`检查本身出错：${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        }
      }
      reports.set(ruleName, report);
    }
  } finally {
    c.finalize();
  }
  return reports;
};

export const violationCount = (reports: Map<RuleKind, CheckReport>) => [...reports.values()].reduce((n, r) => n + r.violations.length, 0);

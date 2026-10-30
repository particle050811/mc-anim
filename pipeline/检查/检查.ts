// anim check 的八类规则（方案三-6）：类型、结构、清单、加载、台词、资产、规矩、平台。没有白名单：违规就改代码或改表。
// 一次查一部作品（选项 作品；不给且只有一部就查它）；漫剧专属的表（台词、旧名、规矩）作品里没有、也没用到就跳过。
// 「待迁移」不算违规：落点、例外还在旧项目、对应的段或场没搬进来的，列出来提醒，搬完自然消失。
import { 报告, 检查上下文, 规则名, type 规则类 } from './上下文.ts';
import { 类型 } from './规则/类型.ts';
import { 结构 } from './规则/结构.ts';
import { 清单 } from './规则/清单.ts';
import { 加载 } from './规则/加载.ts';
import { 台词 } from './规则/台词.ts';
import { 资产 } from './规则/资产.ts';
import { 规矩 } from './规则/规矩.ts';
import { 平台 } from './规则/平台.ts';

export const 规则表: Record<规则类, { 说明: string; 跑: (c: 检查上下文, 报: 报告) => Promise<void> | void }> = {
  类型: { 说明: 'tsc strict；Python 的 ruff、pyright；改到 mod 时编译 mod、跑暮色网格核对和游戏导表出表核对（test/twilight-grid-test.sh、game-data-test.sh）', 跑: 类型 },
  结构: { 说明: '分层、作品不互引、段不互引、不引核对、纯模块闭包、getInputProps、渲染代码的确定性', 跑: 结构 },
  清单: { 说明: '段目录和清单一一对应、段键段名合规唯一、不撞旧名、连续段接帧', 跑: 清单 },
  加载: { 说明: '在 Node 里执行全部纯模块，断言都跑到', 跑: 加载 },
  台词: { 说明: 'cue 的台词都登记、每句恰好开口一次（接上段的接在开口后面）、开口和字幕位置、文本哈希和成品 sha、口型绑定成品', 跑: 台词 },
  资产: { 说明: '引用的 id 都登记、共用和作品两侧的表锁对得上、许可来源可见性齐全、公开构建无私有资产、角色包；--深 逐个核 sha', 跑: 资产 },
  规矩: { 说明: '例外 和 作品的 规矩.toml 双向对得上、默认值落点在、出处引用的记忆在', 跑: 规矩 },
  平台: { 说明: 'Windows 合法文件名、结构层 ASCII、不开 shell、不用 fcntl', 跑: 平台 },
};

export type 检查选项 = { 只?: readonly 规则类[]; 快?: boolean; 深?: boolean; 数据根?: string; 作品?: string };

export const 跑检查 = async (根: string, 选项: 检查选项 = {}): Promise<Map<规则类, 报告>> => {
  const c = new 检查上下文(根, { 深: 选项.深, 数据根: 选项.数据根, 作品: 选项.作品 });
  const 结果 = new Map<规则类, 报告>();
  try {
    for (const 名 of 规则名) {
      if (选项.只?.length && !选项.只.includes(名)) continue;
      const 报 = new 报告();
      if (选项.快 && 名 === '类型') 报.跳过.push('--快：不跑 tsc、ruff、pyright、gradle');
      else {
        try {
          await 规则表[名].跑(c, 报);
        } catch (e) {
          报.错(`检查本身出错：${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        }
      }
      结果.set(名, 报);
    }
  } finally {
    c.收尾();
  }
  return 结果;
};

export const 违规数 = (结果: Map<规则类, 报告>) => [...结果.values()].reduce((n, r) => n + r.违规.length, 0);

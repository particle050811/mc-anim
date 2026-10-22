// anim 平台 导入 <json> | anim 平台 分析：B 站、抖音创作者中心数据（浏览器里跑各自 取数.js 下载的包）收进数据根，
// 对本地交付出一份报告：每个平台一节（各看各的关键指标），最后两平台对照。anim bili 是旧名，同一条命令。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../../cli/命令.ts';
import { 用法错误, 解析参数 } from '../../cli/参数.ts';
import { 交付根 } from '../../环境/配置.ts';
import { 新建预览目录 } from '../../预览/预览.ts';
import { 导入, 最新数据, 解析, type 稿件 } from '../bili/数据.ts';
import { B站建议, B站节 } from '../bili/报告.ts';
import { 对交付, 按段统计, 段区间们, 读交付们, 默认开头窗, 默认结尾窗 } from '../bili/时间轴.ts';
import { 导入抖音, 最新抖音, 解析抖音, type 抖音作品 } from '../抖音/数据.ts';
import { 抖音建议, 抖音节 } from '../抖音/报告.ts';
import { 图页, type 曲线稿, type 对上 } from './图与排名.ts';
import { 对照图页, 对照节 } from './对照.ts';

const 秒数 = (v: string | undefined, 名: string) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new 用法错误(`${名} 要给非负的秒数`);
  return n;
};

const 跑: 命令['跑'] = async (args, 记录) => {
  const p = 解析参数(args, { 值: ['--开头窗', '--结尾窗'] });
  const [动作, 文件] = p.位置;
  if (动作 === '导入') {
    if (p.位置.length !== 2) throw new 用法错误('要给浏览器下载的 bili-数据-*.json 或 抖音-数据-*.json');
    const f = path.resolve(文件!);
    const 是抖音 = (JSON.parse(fs.readFileSync(f, 'utf8')) as { 平台?: string }).平台 === '抖音';
    const { 目标, 包 } = 是抖音 ? 导入抖音(f) : 导入(f);
    记录.产物.push(目标);
    const 数 = '作品' in 包 ? `${包.作品.length} 个作品` : `${包.稿件.length} 个稿件`;
    console.log(`${目标}（${数}，${包.请求数} 次请求${包.停于风控 ? `，取数中途遇风控停了：${包.停于风控}` : ''}）`);
    return;
  }
  if (动作 !== '分析' || p.位置.length !== 1) throw new 用法错误('平台 导入 <json> 或 平台 分析 [--开头窗 <秒>] [--结尾窗 <秒>]');
  const 开头 = 秒数(p.值['--开头窗'], '--开头窗') ?? 默认开头窗;
  const 结尾 = 秒数(p.值['--结尾窗'], '--结尾窗');
  const 交付们 = 读交付们(交付根());
  const 对齐 = <T extends 曲线稿>(们: T[]) =>
    们.flatMap((稿): 对上<T>[] => {
      const 交 = 对交付(稿, 交付们);
      if (!交) return [];
      const 区 = 段区间们(交.m);
      const 窗 = { 开头, 结尾: 结尾 ?? 默认结尾窗(区) };
      return [{ 稿, 交付名: path.basename(交.目录), 交付完成: 交.m.完成, 窗, 段: 按段统计(区, 稿.留存, 稿.弹幕秒, 窗) }];
    });

  const b = 最新数据();
  const 稿们 = 解析(b.包);
  const b对 = 对齐<稿件>(稿们);
  const d = 最新抖音();
  const 作们 = d ? 解析抖音(d.包) : [];
  const d对 = 对齐<抖音作品>(作们);

  const dir = 新建预览目录('平台数据分析');
  const 写图 = (前缀: string, 们: 对上[], 平台: string, 同类图例?: string) => {
    const 图 = new Map<string, string>();
    们.forEach((x, i) => {
      const 名 = `${前缀}${String(i + 1).padStart(2, '0')}-${x.稿.标识}-留存.html`;
      fs.writeFileSync(path.join(dir, 名), 图页(x, 平台, 同类图例), 'utf8');
      图.set(x.稿.标识, 名);
    });
    return 图;
  };
  const b图 = 写图('B站-', b对, 'B 站');
  const d图 = 写图('抖音-', d对, '抖音', '平台给的同类作者参考线（非本作观众）');
  const 名: [string, string] = ['B 站', '抖音'];
  const 对照们 = b对.flatMap((x) => d对.filter((y) => y.交付名 === x.交付名).map((y) => [x, y] as const));
  const 对照文 = 对照们.map(([x, y], i) => {
    const 图名 = `对照-${String(i + 1).padStart(2, '0')}-${x.交付名}.html`;
    fs.writeFileSync(path.join(dir, 图名), 对照图页(x, y, 名), 'utf8');
    return 对照节(x, y, 名, 图名);
  });
  const 抖音文 = d ? 抖音节(作们, d对, { 取于: d.包.取于, 请求数: d.包.请求数, 文件: d.f, 说明: d.包.说明 }, d图) : '## 抖音\n\n数据根里还没有抖音数据：在浏览器里跑 pipeline/适配器/抖音/取数.js，再 anim 平台 导入 <json>。';
  const 说明 = `# 平台数据分析

两个平台分发机制不同，分开解读：抖音刷到即播，先看前 5 秒；B 站点进来才播，先看封面标题点击率。各段的判断都用本平台自己的「开头窗、结尾窗之外在场观众每 10 秒流失」，最后一节才对照。

${抖音文}

${B站节(稿们, b对, { 取于: b.包.取于, 请求数: b.包.请求数, 文件: b.f }, b图)}

## 两平台都掉人 / 都留得住的段

${对照文.join('\n\n') || '没有两个平台都对上同一份交付的作品。'}

## 建议

### 抖音（改开头几秒）

${抖音建议(d对).map((s, i) => `${i + 1}. ${s}`).join('\n') || '—'}

### B 站（改封面标题，开头兑现封面）

${B站建议(稿们, b对).map((s, i) => `${i + 1}. ${s}`).join('\n') || '—'}

## 口径

- 「在场每 10 秒流失」= 1 −（出留存 / 进留存）^(10 / 时长)，按当时还在看的人算，不同位置的段可比；越往后在场的越是铁粉，后段天然偏低。
- 开头窗（默认 ${默认开头窗} 秒，\`--开头窗\`）：推荐流「刷到就走」集中在开头，窗内的流失不记到段上，跨窗的段只算窗后；窗长是假设，B 站一节用同账号其他稿件同一时段检验。
- 结尾窗（默认最后一个段和最后 30 秒取较长的，\`--结尾窗\`）：看出要结束就走是正常的，窗内不记到段上。
- 拖沓段 / 留得住的段：窗后、高于 / 低于本平台同一范围平均的段；短于半档的段数值只是所在档的平均，和相邻短段合成一组。
- 平台给的同类参考线（B 站同类稿件是拟合的平滑线，会外推出负数；抖音是同类作者）只画在图上，不参与计算。
- 段边界取交付 manifest 的全片起帧和帧率；作品发布早于交付完成时，上传的是更早的剪辑，段位置可能有偏差。
`;
  fs.writeFileSync(path.join(dir, '00-说明.md'), 说明, 'utf8');
  记录.产物.push(dir);
  const 列 = (们: 对上[]) => 们.map((x) => `${x.稿.标题} ↔ ${x.交付名}`).join('；') || '无';
  console.log(`${dir}\nB 站 ${稿们.length} 个稿件，对上 ${列(b对)}\n抖音 ${作们.length} 个作品，对上 ${列(d对)}`);
};

const 平台: 命令 = {
  用法: '平台 导入 <json> | 平台 分析 [--开头窗 <秒>] [--结尾窗 <秒>]',
  说明: '导入：把浏览器里 pipeline/适配器/bili/取数.js 或 抖音/取数.js 下载的包挪进数据根 平台/<bilibili|抖音>/<UTC>/；分析：读各平台最新一份，对到本作品的交付，出 预览/<UTC>-平台数据分析/（抖音前 5 秒、B 站封标、各平台窗后按段的在场流失、两平台对照、分平台建议）',
  跑,
};

export const 平台命令: Record<string, 命令> = { 平台, bili: { ...平台, 用法: 'bili …（同 平台，旧名）', 说明: '同 anim 平台' } };

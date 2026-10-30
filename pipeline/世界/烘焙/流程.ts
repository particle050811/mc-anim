// anim world bake 的流程：世界声明 → 读存档（列段缓存）→ 套编辑 → 烘焙 → 发布版本 → 登记。命令.ts 外面套资源闸。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 数据路径 } from '../../环境/配置.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 读编辑, type 编辑集 } from '../编辑/编辑文件.ts';
import { 编辑套用器 } from '../编辑/套用.ts';
import { 区域源 } from '../区域源.ts';
import { 世界种子 } from '../存档.ts';
import { 区域目录, 存档目录, 选包, 编辑文件, type 包声明, type 世界声明 } from '../声明.ts';
import { 载入体素库 } from '../体素库.ts';
import { 发布, 新暂存, 登记, 登记条目, 读地形表, type 地形登记 } from '../版本.ts';
import { 烘焙 } from './烘焙.ts';

export const 列段缓存目录 = () => 数据路径('cache', '列段');
export const 默认线程 = () => Math.max(1, os.availableParallelism() - 2);

export type 烘焙选项 = { 包?: string; 存档?: string; 不套编辑?: boolean; 不登记?: boolean; 线程?: number; 日志: (s: string) => void };
export type 包结果 = { 包: string; 版本: string; 目录: string; 原登记?: string; 条目: 地形登记; 已登记: boolean; 编辑步数: number; 编辑警告: string[]; 缺状态: number; 缺群系: number };

/** 包在存档里要读的区域文件 */
export const 包的区域 = (源: 区域源, b: 包声明): [number, number][] => 源.区域文件().filter(([rx, rz]) => !b.区域 || (rx >= b.区域.RX[0] && rx <= b.区域.RX[1] && rz >= b.区域.RZ[0] && rz <= b.区域.RZ[1]));

/** 世界的编辑层（没有编辑文件返回 null）；方块状态按方块表校验 */
export const 载入编辑 = async (w: 世界声明): Promise<编辑集 | null> => {
  const f = 编辑文件(w.名称);
  if (!fs.existsSync(f)) return null;
  const 库 = await 载入体素库();
  return 读编辑(f, 库.知识);
};

export const 烘焙世界 = async (w: 世界声明, o: 烘焙选项): Promise<包结果[]> => {
  const 目录 = 存档目录(w, o.存档);
  const 种子 = 世界种子(目录);
  if (w.种子 !== undefined && w.种子 !== 种子) o.日志(`注意：存档 level.dat 的种子是 ${种子}，声明写的是 ${w.种子}`);
  const 库 = await 载入体素库();
  const 编辑 = o.不套编辑 ? null : await 载入编辑(w);
  const 结果: 包结果[] = [];
  for (const b of 选包(w, o.包)) {
    const 套 = 编辑 && b.套编辑 ? 编辑 : null;
    // 编辑里 clone、摆结构要读别处的方块：读原样的区域（不套编辑），套用时按步骤先后自己算
    const 器 = 套 ? new 编辑套用器(套, new 区域源(区域目录(w, o.存档), 种子, 列段缓存目录())) : null;
    const 源 = new 区域源(区域目录(w, o.存档), 种子, 列段缓存目录(), 器 ? (r) => 器.套(r) : null);
    const 文件们 = 包的区域(源, b);
    if (!文件们.length) throw new Error(`包 ${b.名}：${源.区域目录} 里没有范围内的区域文件`);
    const 区域们 = await 源.预读(文件们, o.线程 ?? 默认线程(), o.日志);
    if (!区域们.length) throw new Error(`包 ${b.名}：范围内 ${文件们.length} 个区域文件里没有生成完的区块`);
    if (套) o.日志(`套编辑 ${path.relative(代码根(), 套.文件)}：${套.步.length} 条命令`);
    const 暂存 = 新暂存(b.名);
    let 版本: string, dir: string;
    let r: Awaited<ReturnType<typeof 烘焙>>;
    try {
      const t0 = performance.now();
      r = await 烘焙({ 区域们, 取区域: (rx, rz) => 源.区域(rx, rz), 维度: w.包维度, 原点: b.原点, 输出: 暂存.dir, 库, 日志: o.日志 });
      o.日志(`烘焙完，${((performance.now() - t0) / 1000).toFixed(1)} 秒；${r.块文件数} 个块文件，${r.包.状态.length} 种状态、${r.包.群系.length} 种群系、${r.条目数} 种条目；缺状态 ${r.缺状态.size} 种、群系 ${r.缺群系.size} 种（见 缺失.tsv）`);
      ({ 版本, 目录: dir } = 发布(b.名, 暂存.dir));
    } finally {
      暂存.放();
    }
    const 原 = 读地形表().包[b.名];
    const 来源 = `${b.来源 ?? `${w.服务端} ${w.存档} 存档，anim world bake ${w.名称} 烘焙`}${套 ? `，套编辑 ${path.relative(代码根(), 套.文件).split(path.sep).join('/')}（${套.步.length} 条命令，sha256 ${套.sha256.slice(0, 12)}）` : ''}`;
    const 条目 = await 登记条目(b.名, 版本, { 来源, 许可: 'LicenseRef-Minecraft-Derived', 可见性: '发布' });
    const 一样 = 原?.版本 === 版本;
    const 要登记 = !一样 && !o.不登记 && b.登记;
    if (要登记) 登记(b.名, 条目);
    o.日志(
      `地形包 ${b.名}：版本 ${版本}（${dir}）` +
        (一样 ? '，和 assets/地形版本.json 登记的一样' : 要登记 ? `，已登记进 assets/地形版本.json（原来是 ${原?.版本 ?? '没有'}），要随代码提交；用这个包的段都会过期` : `，没登记（${b.登记 ? '--不登记' : '声明里 登记 = false'}；登记的是 ${原?.版本 ?? '没有'}）`),
    );
    for (const x of 器?.警告 ?? []) o.日志(`  编辑：${x}`);
    提醒冻结粗高度(b.名, r.包, 库, o.日志);
    结果.push({ 包: b.名, 版本, 目录: dir, 原登记: 原?.版本, 条目, 已登记: 一样 || 要登记, 编辑步数: 套?.步.length ?? 0, 编辑警告: [...(器?.警告 ?? [])], 缺状态: r.缺状态.size, 缺群系: r.缺群系.size });
  }
  return 结果;
};

// 编排用的是冻结的粗高度（engine/voxel/冻结粗高度.ts、assets/冻结粗高度/）：这个包冻结过、粗高度又变了，提醒一下
const 提醒冻结粗高度 = (包: string, info: Parameters<Awaited<ReturnType<typeof 载入体素库>>['区段包']['decodeCoarseHeight']>[0], 库: Awaited<ReturnType<typeof 载入体素库>>, 日志: (s: string) => void) => {
  const f = path.join(代码根(), 'assets', '冻结粗高度', `${包}.json`);
  if (!fs.existsSync(f)) return;
  const 冻 = JSON.parse(fs.readFileSync(f, 'utf8')).指纹 as string;
  const 新 = 库.区段包.coarseHeightFingerprint(库.区段包.decodeCoarseHeight(info));
  if (冻 !== 新) 日志(`  粗高度变了（冻结的 ${冻} → ${新}），编排还按冻结的那份排；要跟上新地形得重新冻结（anim world freeze --写）并核对航线`);
};

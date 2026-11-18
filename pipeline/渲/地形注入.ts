// 把本段声明的地形包和版本传给页面（engine/voxel/区段包位置.ts 的唯一来源）：renderMedia、renderStill、renderFrames 都传 envVariables: 段渲染环境(键, 地形)。
// anim film、still、bench、verify --render 走这一处。用环境变量不用 inputProps：inputProps 整份进指纹、规范化设置 拒收不认识的键、每段 getCompositions 也得跟着传，
// 而版本已经单独进指纹的地形项。读 Composition 列表的页面不传：列表阶段不该读任何包，读了就报错。
import { terrainVersionEnv, terrainReadModeEnv, terrainUsageSegEnv, lightCacheFilesEnv } from '../../engine/段/地形环境.ts';
import fs from 'node:fs';
import path from 'node:path';
import { trialKey, findSwitch } from '../../engine/core/调试开关.ts';
import { parseTrialJson, type TrialTable } from './试看表.ts';
// 和 engine/core/试看.ts 的 trialEnvName 同一个名字（pipeline 不 import 渲染代码）
export const trialEnvName = 'REMOTION_ANIM_TRIAL';
import { workName } from '../环境/作品.ts';
import { lightCacheFiles } from './光体缓存收集.ts';
import { segTerrainVersion, readTerrainVersionTable, readTerrainEntries } from '../指纹/指纹.ts';
import { terrainRoot } from '../环境/配置.ts';
import type { SegInfo } from '../清单/清单.ts';

/**
 * 键是段键（段指纹的 段 字段就是）。出切片的渲染，地形一定传指纹的地形项（r.指纹.项.地形），不重读表：
 * 指纹在批次开头算，闸按段放，中途 anim world bake 或合并提交改了表，页面要是拿到新版，切片就是名字说 v1、画面是 v2，还查不出来。旧版本目录只增不改，照样读得到
 */
export const segRenderEnv = (segKey: string, terrainFiles: Record<string, string>, mode: TerrainReadMode = '正式'): Record<string, string> => ({
  ...terrainOnlyEnv(terrainFiles, mode),
  [terrainUsageSegEnv]: `${workName()}/${segKey}`,
  [lightCacheFilesEnv]: lightCacheFiles(workName()),
});

/**
 * 页面读哪一版（docs/世界.md「裁级」）：正式出片（film、still、bench、reuse、verify）读裁过的包，各机器出图一致；往细里看的（试看里会挑到别的区段的项、
 * still --tele 的细一级和真值、Studio）读完整包。段签的地形项一律是完整包的版本，这里按登记表把它换成要读的目录：
 * 完整包版本和登记的一样、又登记了裁过的，正式就读裁过的；不一样（表在批次中途改了）照旧读完整包那一版（只增不改，还在）。
 */
export type TerrainReadMode = '正式' | '完整' | '完整优先';
const readVersions = (fullVersions: Record<string, string>, mode: TerrainReadMode): Record<string, string> => {
  const entries = readTerrainEntries();
  return Object.fromEntries(
    Object.entries(fullVersions).map(([pack, version]) => {
      const entry = entries[pack];
      if (mode === '正式' && entry?.trimmed && entry.version === version) return [pack, entry.trimmed.version];
      // 完整优先：地形覆盖用，光体冷缓存会取区段，读完整包才不被旧留表卡住；本机只有裁过的就读裁过的
      if (mode === '完整优先' && entry?.trimmed && entry.version === version && !fs.existsSync(path.join(terrainRoot(), pack, version))) return [pack, entry.trimmed.version];
      if (mode === '完整' && entry?.trimmed && !fs.existsSync(path.join(terrainRoot(), pack, version)))
        throw new Error(`往细里看要读完整地形包 ${pack}/${version}，本机没有（只有裁过的 ${entry.trimmed.version}）：anim assets pull --full 从 Release 取备份，或从生成它的机器（笔记本）拷到 <数据根>/terrain/${pack}/${version}/`);
      return [pack, version];
    }),
  );
};
const pageTerrainEnv = (versions: Record<string, string>, mode: TerrainReadMode) => ({ [terrainVersionEnv]: JSON.stringify(versions), [terrainReadModeEnv]: mode });
/** 只传地形版本和读法（试看 film 不记用量） */
export const terrainOnlyEnv = (fullVersions: Record<string, string>, mode: TerrainReadMode): Record<string, string> => pageTerrainEnv(readVersions(fullVersions, mode), mode);
/** shell 里的试看参数要不要读完整包 */
export const shellTrialMode = (): TerrainReadMode => (trialReadsFullTerrain(shellTrialTable()) ? '完整' : '正式');
/** 段声明的包现登记的完整包版本（覆盖、still 用；切片走指纹里记的那份） */
export const terrainReadVersions = (segKey: string, decls: readonly string[]) => segTerrainVersion(segKey, decls, readTerrainVersionTable());
/** 这组试看参数会不会挑到正式画面不用的区段（调试开关表里标了 fullTerrain 的项，或「关」里标了的） */
export const trialReadsFullTerrain = (table: TrialTable): boolean =>
  Object.keys(table).some((k) => findSwitch('trial', k)?.fullTerrain) || (Array.isArray(table[trialKey('关')]) && (table[trialKey('关')] as unknown[]).some((x) => typeof x === 'string' && findSwitch('off', x)?.fullTerrain));

/** still、bench 不算指纹、不出切片，当场读表；多读：试看要多读的包（`试看地形`） */
export const segTerrainNow = (s: Pick<SegInfo, 'key' | 'segment'>, extraReads: readonly string[] = []): Record<string, string> => segTerrainVersion(s.key, [...new Set([...s.segment.terrain, ...extraReads])], readTerrainVersionTable());

/** shell 里设了试看参数（engine/core/试看.ts）没有：anim film 设了就只出试看片（出片/试看.ts） */
export const trialActive = (): boolean => Boolean(process.env[trialEnvName]);
/**
 * anim still、bench、试看的 film 把试看参数原样转给页面（bench 转是为了比试看的耗时，用户 11-16 要比不同视距省多少）。
 * 正式出片的路（出片/渲段.ts）不调它：切片、段签都不能混进试看的画面
 */
export const trialEnv = (): Record<string, string> => {
  const raw = process.env[trialEnvName];
  if (!raw) return {};
  parseTrialJson(raw, trialEnvName);
  return { [trialEnvName]: raw };
};
/** shell 里设的试看表（核对过）；没设是空表 */
export const shellTrialTable = (): TrialTable => (process.env[trialEnvName] ? parseTrialJson(process.env[trialEnvName]!, trialEnvName) : {});
/** 试看参数里「地形」列的包：按现登记的版本并进这一页的地形版本表。键是中文「地形」，和页面认的试看名（暮色远景、雾曲线）一样是人写的 JSON，不是盘上文件的键 */
export const trialTerrain = (table: TrialTable | undefined = undefined): string[] => {
  if (!table) {
    const raw = process.env[trialEnvName];
    if (!raw) return [];
    table = JSON.parse(raw) as TrialTable;
  }
  // 盘上文件的键都是英文，容易照着写成 terrain：报错，不让多读的包悄悄不生效
  if ('terrain' in table) throw new Error(`${trialEnvName} 里要多读的地形包写在「地形」下，不是 terrain`);
  const terrainNames = table[trialKey('地形')];
  if (terrainNames !== undefined && !(Array.isArray(terrainNames) && terrainNames.every((x) => typeof x === 'string'))) throw new Error(`${trialEnvName} 的 地形 要是包名数组`);
  return (terrainNames as string[] | undefined) ?? [];
};

/** Studio 一个页面看全部段，传全表（开着时登记了新版本要重开才拿到） */
/** 完整包不在本机（笔记本生成的世界只传回裁过的）的包读裁过的，并打一行提示：Studio 开着看全部段，不为一个包整个起不来 */
export const fullTableEnv = (): Record<string, string> => {
  const entries = readTerrainEntries();
  const table = Object.fromEntries(
    Object.entries(entries).map(([pack, v]) => {
      if (v.trimmed && !fs.existsSync(path.join(terrainRoot(), pack, v.version)) && fs.existsSync(path.join(terrainRoot(), pack, v.trimmed.version))) {
        console.error(`!! 完整地形包 ${pack}/${v.version} 不在本机，Studio 读裁过的 ${v.trimmed.version}（只有全片用到的级，往细里看会缺）：anim assets pull --full 取完整包`);
        return [pack, v.trimmed.version];
      }
      return [pack, v.version];
    }),
  );
  return pageTerrainEnv(table, '完整优先');
};

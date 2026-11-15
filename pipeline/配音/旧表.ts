// 第 6、7 章旧段的 台词轨.tsx、配音/口型.ts 还从两份整表（资产 数据/配音/台词表、数据/配音/口型，旧 id 为键）取数据，按 旧名.tsv 换成新台词 id：
// anim voice use 拿它挡住换这些句子的成品（旧段不跟着变），句口型.test、台词句轨.test 拿它核对句模块和整表一样。旧段都改走句模块后和整表一起删（docs/待办.md）。
// 11-06 从 pipeline/适配器/旧项目/配音表.ts 挪来；生成句模块的 lip --从旧表、核对的 check --对旧表 一次性用完，删了。
import fs from 'node:fs';
import path from 'node:path';
import { bytesPath, type AssetLock } from '../资产/资产锁.ts';

export type OldLineRow = { 角色: string; 字: string; 合成?: string; 文件: string | null; 副本?: string; 时长: number; 开口: number; 有声长: number; 内心?: boolean };
export type OldLipRow = { 文: string; 时长: number; 字: [string, number, number][]; 嘴: [number, string][] };
export type OldVoice = { oldId: string; 台词: OldLineRow; 口型?: OldLipRow };

export const oldTableAssets = { lineTable: '数据/配音/台词表', 口型: '数据/配音/口型' } as const;

/** 旧名.tsv 的 台词 行：旧 id → 新 id（旧表就是这些句子的） */
export const oldLineRenames = (workRoot: string): Map<string, string> => {
  const renamedIds = new Map<string, string>();
  const oldNameFile = path.join(workRoot, '旧名.tsv');
  if (!fs.existsSync(oldNameFile)) return renamedIds;
  for (const l of fs.readFileSync(oldNameFile, 'utf8').split('\n')) {
    const [category, oldId, newId] = l.split('\t');
    if (category === '台词' && oldId && newId) renamedIds.set(oldId, newId);
  }
  return renamedIds;
};

export const readOldVoiceTable = (workRoot: string, assetLock: AssetLock, dataRoot?: string): Map<string, OldVoice> => {
  const readAsset = (id: string) => {
    const e = assetLock[id];
    if (!e) throw new Error(`资产锁里没有 ${id}（旧段用的配音整表）`);
    return JSON.parse(fs.readFileSync(bytesPath(e, dataRoot), 'utf8')) as Record<string, unknown>;
  };
  const legacyLineTable = readAsset(oldTableAssets.lineTable) as Record<string, OldLineRow>;
  const lip = readAsset(oldTableAssets.口型) as Record<string, OldLipRow>;
  const renamedIds = oldLineRenames(workRoot);
  const r = new Map<string, OldVoice>();
  for (const [oldId, line] of Object.entries(legacyLineTable)) r.set(renamedIds.get(oldId) ?? oldId, { oldId, 台词: line, ...(lip[oldId] ? { 口型: lip[oldId] } : {}) });
  return r;
};

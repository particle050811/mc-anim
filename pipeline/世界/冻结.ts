// 冻结粗高度（anim world freeze）：把登记的那版地形包的 包.json 里的原点和粗高度图拷进 assets/冻结粗高度/<包>.json（为什么冻结见 engine/voxel/冻结粗高度.ts）。
// 旧项目 工具/导入/更新冻结粗高度.ts 搬来。冻结文件被编排 import，写了就让用它的段过期，所以：内容（版本、粗高度指纹、原点）一样时一个字节都不写；
// 不一样时默认只报告，加 --write 才写。粗高度变了，航线、巡航高度跟着变，写完要用静帧核对航线、重看配乐卡点。
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot } from '../环境/路径.ts';
import { loadVoxelLib } from './体素库.ts';
import { versionDir, readTerrainTable } from './版本.ts';

export const freezeDir = () => path.join(codeRoot(), 'assets', '冻结粗高度');
export const frozenPacks = () => (fs.existsSync(freezeDir()) ? fs.readdirSync(freezeDir()).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length)).sort() : []);

export type FreezeResult = { 包: string; 版本: string; 指纹: string; 原: { 版本: string; 指纹: string } | null; same: boolean; written: boolean; 文件: string };

export const freeze = async (packs: string[], o: { write: boolean }): Promise<FreezeResult[]> => {
  const voxelLib = await loadVoxelLib();
  const terrainTable = readTerrainTable().包;
  const out: FreezeResult[] = [];
  for (const pack of packs.length ? packs : frozenPacks()) {
    const version = terrainTable[pack]?.版本;
    if (!version) throw new Error(`assets/地形版本.json 没登记包 ${pack}`);
    const packJsonPath = path.join(versionDir(pack, version), '包.json');
    if (!fs.existsSync(packJsonPath)) throw new Error(`没有 ${packJsonPath}：anim assets pull 拉地形包，或 anim world bake 烘`);
    const info = JSON.parse(fs.readFileSync(packJsonPath, 'utf8'));
    const fingerprint = voxelLib.sectionPack.coarseHeightFingerprint(voxelLib.sectionPack.decodeCoarseHeight(info));
    const file = path.join(freezeDir(), `${pack}.json`);
    const previous = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { 版本: string; 指纹: string; 原点: number[] }) : null;
    const same = !!previous && previous.版本 === version && previous.指纹 === fingerprint && JSON.stringify(previous.原点) === JSON.stringify(info.原点);
    let written = false;
    if (!same && o.write) {
      const frozenDoc = { 说明: 'anim world freeze 从登记的那版区段包的 包.json 拷的原点和粗高度图，别手改', 包: pack, 版本: version, 指纹: fingerprint, 维度: info.维度, 原点: info.原点, 粗高度: info.粗高度 };
      fs.mkdirSync(freezeDir(), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(frozenDoc) + '\n');
      written = true;
    }
    out.push({ 包: pack, 版本: version, 指纹: fingerprint, 原: previous && { 版本: previous.版本, 指纹: previous.指纹 }, same, written, 文件: file });
  }
  return out;
};

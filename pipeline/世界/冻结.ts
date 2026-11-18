// 冻结粗高度（anim world freeze）：把登记的那版地形包的原点和粗高度图（包.json、粗图.bin.gz）拷进 assets/冻结粗高度/<包>.json（为什么冻结见 engine/voxel/冻结粗高度.ts）。
// 旧项目 工具/导入/更新冻结粗高度.ts 搬来。冻结文件被编排 import，写了就让用它的段过期，所以：内容（版本、粗高度指纹、原点）一样时一个字节都不写；
// 不一样时默认只报告，加 --write 才写。粗高度变了，航线、巡航高度跟着变，写完要用静帧核对航线、重看配乐卡点。
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot } from '../环境/路径.ts';
import { loadVoxelLib } from './体素库.ts';
import { versionDir, readTerrainTable } from './版本.ts';
import { readPackDoc } from './烘焙/包信息.ts';

export const freezeDir = () => path.join(codeRoot(), 'assets', '冻结粗高度');
export const frozenPacks = () => (fs.existsSync(freezeDir()) ? fs.readdirSync(freezeDir()).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length)).sort() : []);

export type FreezeResult = { pack: string; version: string; fingerprint: string; 原: { version: string; fingerprint: string } | null; same: boolean; written: boolean; file: string };

export const freeze = async (packs: string[], o: { write: boolean }): Promise<FreezeResult[]> => {
  const voxelLib = await loadVoxelLib();
  const terrainTable = readTerrainTable().pack;
  const out: FreezeResult[] = [];
  for (const pack of packs.length ? packs : frozenPacks()) {
    const version = terrainTable[pack]?.version;
    if (!version) throw new Error(`assets/地形版本.json 没登记包 ${pack}`);
    const packJsonPath = path.join(versionDir(pack, version), '包.json');
    if (!fs.existsSync(packJsonPath)) throw new Error(`没有 ${packJsonPath}：anim assets pull 拉地形包，或 anim world bake 烘`);
    const info = readPackDoc(voxelLib, versionDir(pack, version)), coarse = info.maps.coarse;
    const fingerprint = voxelLib.sectionPack.coarseHeightFingerprint(coarse);
    const file = path.join(freezeDir(), `${pack}.json`);
    const previous = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string; fingerprint: string; origin: number[] }) : null;
    const same = !!previous && previous.version === version && previous.fingerprint === fingerprint && JSON.stringify(previous.origin) === JSON.stringify(info.origin);
    let written = false;
    if (!same && o.write) {
      const frozenDoc = { note: 'anim world freeze 从登记的那版区段包的 包.json 拷的原点和粗高度图，别手改', pack: pack, version: version, fingerprint: fingerprint, dimension: info.dimension, origin: info.origin, coarseHeight: { cell: coarse.cell, x0: coarse.x0, y0: coarse.y0, nx: coarse.nx, ny: coarse.ny, height: Buffer.from(coarse.height.buffer, coarse.height.byteOffset, coarse.height.byteLength).toString('base64') } };
      fs.mkdirSync(freezeDir(), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(frozenDoc) + '\n');
      written = true;
    }
    out.push({ pack: pack, version: version, fingerprint: fingerprint, 原: previous && { version: previous.version, fingerprint: previous.fingerprint }, same, written, file: file });
  }
  return out;
};

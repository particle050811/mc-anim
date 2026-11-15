// 烘焙用的条目表：方块状态、群系各编号，(状态, 群系) 并成条目，记下每个条目透不透明、算不算地表，和查不到的状态、群系。照旧项目 工具/导入/烘焙/条目.ts。
// 条目 = (状态, 群系)；不染色的方块不记群系（石头在哪个群系都一样，并成一个，段也少切）。烘焙时一律用条目号，写区段时换成区段自己的色板。
// 编号按第一次遇到的先后：包.json 的状态表、群系表的顺序由烘焙遍历的顺序定，和旧工具逐字节一样靠的就是这个。
import type { BlockKnowledge } from '../体素库.ts';

export const noBiome = 65535; // = engine/voxel/区段包.ts 的 noBiome
export const entryLimit = 65536;
// 黑暗森林的林冠（整格实心树叶）不算地表：它连成一片顶棚，林下比 长空当 矮，算地表的话林下不存，从林边斜看会露出虚空（用户 10-09 指出）。
const canopyLeafRe = /^[a-z_]+:(hardened_)?dark_leaves(\[|$)/;

export class EntryTable {
  stateList: string[] = ['minecraft:air'];
  private stateIdByName = new Map([['minecraft:air', 0]]);
  biomeList: string[] = [];
  private biomeIdByName = new Map<string, number>();
  entryState: number[] = [0];
  entryBiome: number[] = [noBiome];
  private entryIdByKey = new Map([[noBiome, 0]]); // 键 = 状态号·65536 + 群系号；条目 0 = 空气
  entryOpaque = new Uint8Array(entryLimit);
  /** 合并时当空气：空气、方块表里查不到的 */
  entryAsAir = new Uint8Array(entryLimit);
  /** 整格不透明（算地表） */
  entryFullCube = new Uint8Array(entryLimit);
  stateVoxel: number[] = [0];
  /** 群系号 → 1 = 群系色表里有 */
  biomeKnown: number[] = [];
  /** 查不到的方块状态 → 第 0 级格数 */
  missingStates = new Map<string, number>();
  missingBiomes = new Map<string, number>();
  private knownBiomeNames: Set<string>;
  private knowledge: BlockKnowledge;

  constructor(knowledge: BlockKnowledge) {
    this.knowledge = knowledge;
    this.entryAsAir[0] = 1;
    this.knownBiomeNames = new Set(knowledge.群系名);
  }

  internState(stateName: string) {
    let k = this.stateIdByName.get(stateName);
    if (k === undefined) {
      k = this.stateList.push(stateName) - 1;
      this.stateIdByName.set(stateName, k);
      this.stateVoxel.push(this.knowledge.voxelValue(stateName));
    }
    return k;
  }

  internBiome(biomeName: string) {
    let k = this.biomeIdByName.get(biomeName);
    if (k === undefined) {
      k = this.biomeList.push(biomeName) - 1;
      this.biomeIdByName.set(biomeName, k);
      this.biomeKnown.push(this.knownBiomeNames.has(biomeName) ? 1 : 0);
    }
    return k;
  }

  internEntry(st: number, bi: number) {
    if (!st) return 0;
    const voxel = this.stateVoxel[st]!;
    const { tint: TINT, opaque: OPAQ, full: FULL } = this.knowledge;
    const biomeId = voxel && !TINT[voxel] ? noBiome : bi; // 查不到的方块不知道染不染，群系留着
    const key = st * 65536 + biomeId;
    let entry = this.entryIdByKey.get(key);
    if (entry === undefined) {
      entry = this.entryState.length;
      if (entry >= entryLimit) throw new Error('条目超过 65536 种，放不进 u16');
      this.entryState.push(st);
      this.entryBiome.push(biomeId);
      this.entryIdByKey.set(key, entry);
      this.entryOpaque[entry] = OPAQ[voxel]!;
      this.entryAsAir[entry] = voxel ? 0 : 1;
      this.entryFullCube[entry] = FULL[voxel] && !canopyLeafRe.test(this.stateList[st]!) ? 1 : 0;
    }
    return entry;
  }
}

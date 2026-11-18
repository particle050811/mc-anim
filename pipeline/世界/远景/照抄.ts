import { hash2 } from '../../../engine/core/噪声.ts';
import { distantPoint } from '../../../engine/voxel/远景网格.ts';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { DistantGrid } from '../../../engine/voxel/远景.ts';
import type { FarVoxelLib } from '../体素库.ts';
import type { EntryTable } from '../烘焙/条目.ts';
import { fromColumnMajor, toColumnMajor } from '../烘焙/区段编码.ts';

type Origin = [number, number, number];
export type Box = readonly [number, number, number, number];
type Row = { id: SectionId; 取: () => SectionData };
type Patch = { columns: (Uint16Array | undefined)[]; valid: number[] };
const side = 66, span = 64, patch = 16;
const ground = /:(?:grass_block|mycelium|podzol|(?:coarse_|rooted_)?dirt|stone|gravel|clay|sand(?:stone)?|mud|snow_block|ice|(?:weathered_|cracked_)?deadrock)(?:\[|$)/;
const structure = /(?:castle_(?:brick|door|rune)|towerwood|naga_stone|mazestone|underbrick|stronghold_shield|boss_spawner|trophy_pedestal|aurora_(?:block|pillar)|spawner(?:\[|$))/;
export const intersects = ({ L, i, j }: SectionId, [ox,,oz]: Origin, boxes: readonly Box[]) => {
  const width = span * 2 ** L;
  const x = ox + i * width, z = oz - (j + 1) * width;
  return boxes.some(([x0,z0,x1,z1]) => x <= x1 && x + width > x0 && z <= z1 && z + width > z0);
};
export const transformColumn = (x: number, y: number, pose: number) => {
  if (pose & 4) x = patch - 1 - x;
  for (let turn = 0; turn < (pose & 3); turn++) [x,y] = [patch - 1 - y,x];
  return y * patch + x;
};

export function copyTerrain(lib: FarVoxelLib, table: EntryTable, grid: DistantGrid, origin: Origin, rows: Iterable<Row>, exclude: readonly Box[]) {
  const [ox,oy,oz] = origin, pools = new Map<string, Patch[]>();
  const key = (level: number, biome: string) => `${level}:${biome}`;
  const ordered = [...rows].filter(row => row.id.L <= 3 && !intersects(row.id, origin, exclude));
  ordered.sort((a,b) => hash2(a.id.i,a.id.j) - hash2(b.id.i,b.id.j));
  const water = table.internState('minecraft:water'), ice = table.internState('minecraft:ice');
  const stone = table.internState('minecraft:stone');
  for (const { id, 取: read } of ordered) {
    const cell = 2 ** id.L, bx = ox + id.i * span * cell, bz = oz - id.j * span * cell;
    let data: SectionData | undefined, dense: Uint16Array | undefined;
    for (let py = 0; py < span; py += patch) for (let px = 0; px < span; px += patch) {
      const biome = lib.distant.distantBiome(grid,bx+(px+patch/2)*cell,bz-(py+patch/2)*cell);
      const poolKey = key(id.L,biome), pool = pools.get(poolKey) ?? [];
      if (pool.length >= 12) continue;
      if (!data) {
        data = read();
        if (Array.from(data.palette).some((state,n) => !(n&1) && structure.test(table.stateList[state]!))) break;
        dense = toColumnMajor(data);
      }
      if (!dense) break;
      const columns: Patch['columns'] = [], valid: number[] = [];
      for (let off = 0; off < patch*patch; off++) {
        const x = px + off%patch, y = py + (off>>4), gx = bx+x*cell, gz = bz-(y+1)*cell;
        if (lib.distant.distantBiome(grid,gx+cell/2,gz+cell/2) !== biome) continue;
        const start = ((y+1)*side+x+1)*data.nz;
        const stateAt = (k: number) => data!.palette[2*dense![start+k]!]!;
        let top = data.nz-1;
        while (top >= 0 && !stateAt(top)) top--;
        if (top < 0) continue;
        let base = top;
        while (base >= 0 && !ground.test(table.stateList[stateAt(base)]!)) base--;
        // 粗格的地面可能已经被同格的树干或叶占了；此时用来源网格定位，不把树顶当作地面。
        if (base < 0) base = Math.min(top, Math.max(0, Math.floor((Math.round(lib.distant.distantAreaTop(grid,gx,gz,gx+cell,gz+cell))-oy)/cell)-data.kBottom));
        columns[off] = Uint16Array.from({length:top-base+1},(_,k) => stateAt(base+k));
        valid.push(off);
      }
      if (valid.length >= patch) { pool.push({columns,valid}); pools.set(poolKey,pool); }
    }
  }
  const missing = new Set<string>();
  return (id: SectionId): SectionData => {
    const cell = 2 ** id.L, cols = side*side, bases = new Int16Array(cols), profiles: (Uint16Array | undefined)[] = [], biomes = new Uint16Array(cols), waters = new Uint16Array(cols);
    const surfaces = new Uint16Array(cols), sea = Math.floor((grid.seaLevel-1-oy)/cell);
    let bottom = Infinity, top = -Infinity;
    for (let col = 0; col < cols; col++) {
      const x = id.i*span+col%side-1, y = id.j*span+Math.floor(col/side)-1;
      const gx = ox+x*cell, gz = oz-(y+1)*cell, biome = lib.distant.distantBiome(grid,gx+cell/2,gz+cell/2);
      const height = Math.round(lib.distant.distantAreaTop(grid,gx,gz,gx+cell,gz+cell));
      const base = bases[col] = Math.floor((height-oy)/cell), bi = biomes[col] = table.internBiome(biome);
      const tileX = Math.floor(gx/(patch*cell)), tileY = Math.floor((-gz-cell)/(patch*cell));
      const poolKey = key(id.L,biome), pool = pools.get(poolKey);
      if (pool) {
        const sample = pool[Math.floor(hash2(tileX,tileY,bi)*pool.length)]!;
        const off = transformColumn(x&15,y&15,Math.floor(hash2(tileX,tileY,37)*8));
        profiles[col] = sample.columns[off] ?? sample.columns[sample.valid[off%sample.valid.length]!];
      } else {
        const point = distantPoint(grid,gx+cell/2,gz+cell/2);
        surfaces[col] = point >= 0 ? table.internState(grid.surfaceNames![grid.surface![point]!]!) : stone;
        if (!missing.has(poolKey)) {
          console.warn(`照抄 L${id.L} ${biome} 无同群系来源：只保留网格地表与水位`); missing.add(poolKey);
        }
      }
      if (height <= grid.seaLevel-2) waters[col] = lib.distant.waterFreezes(grid,biome,gx+cell-1,gz+cell-1) ? ice : water;
      bottom = Math.min(bottom,base-1); top = Math.max(top,base+(profiles[col]?.length ?? 1)-1,waters[col] ? sea : -Infinity);
    }
    const nz = top-bottom+1, cm = new Uint16Array(cols*nz);
    for (let col = 0; col < cols; col++) {
      const base = bases[col]!, profile = profiles[col], bi = biomes[col]!;
      cm.fill(table.internEntry(stone,bi),col*nz,col*nz+base-bottom);
      for (let k = base; k <= Math.max(base+(profile?.length??1)-1,waters[col] ? sea : -Infinity); k++) {
        let st = profile?.[k-base] ?? (k === base ? surfaces[col]! || stone : 0);
        if (waters[col] && k <= sea && (k>base || k===sea)) st = k===sea ? waters[col]! : water;
        else if (table.stateList[st]!.startsWith('minecraft:water')) st = k===base ? stone : 0;
        cm[col*nz+k-bottom] = table.internEntry(st,bi);
      }
    }
    return encodeEntries(id,bottom,nz,cm,table);
  };
}

const encodeEntries = (id: SectionId, bottom: number, nz: number, cm: Uint16Array, table: EntryTable) =>
  fromColumnMajor(id,bottom,nz,cm,table.entryState.flatMap((st,n)=>[st,table.entryBiome[n]!]),side*side);

/** 父块连围边按世界坐标找真实子列；不能把一个子块的最外列复制成两列。 */
export function parentTerrain(lib: FarVoxelLib, table: EntryTable, id: SectionId, read: (id: SectionId) => SectionData) {
  const children = new Map<number,{data:SectionData; dense:Uint16Array; entries:Uint16Array}>();
  let bottom = Infinity, top = -Infinity;
  for (let yy=-1; yy<=2; yy++) for (let xx=-1; xx<=2; xx++) {
    const data = read({ L:id.L-1,i:id.i*2+xx,j:id.j*2+yy });
    const entries = Uint16Array.from({length:data.palette.length/2},(_,n)=>table.internEntry(data.palette[n*2]!,data.palette[n*2+1]!));
    children.set((yy+1)*4+xx+1,{data,dense:toColumnMajor(data),entries});
    bottom = Math.min(bottom,data.kBottom>>1); top=Math.max(top,(data.kBottom+data.nz-1)>>1);
  }
  const nz=top-bottom+1, cm=new Uint16Array(side*side*nz), stone=table.internEntry(table.internState('minecraft:stone'),65535);
  for (let col=0; col<side*side; col++) {
    const x=2*(col%side-1), y=2*(Math.floor(col/side)-1);
    const {data,dense,entries}=children.get(((y>>6)+1)*4+(x>>6)+1)!;
    for (let k=bottom; k<=top; k++) {
      let best=0, chosen=0;
      for (let dy=0; dy<2; dy++) for (let dx=0; dx<2; dx++) for (let dz=0; dz<2; dz++) {
        const h=2*k+dz-data.kBottom;
        const entry=h<0 ? stone : h>=data.nz ? 0 : entries[dense[(((y&63)+dy+1)*side+(x&63)+dx+1)*data.nz+h]!]!;
        if (!table.entryAsAir[entry]) {
          const rank=lib.knowledge.mergeKey(table.entryOpaque[entry]!,1,dx,dy,dz,0);
          if (rank>best) { best=rank; chosen=entry; }
        }
      }
      cm[col*nz+k-bottom]=chosen;
    }
  }
  return encodeEntries(id,bottom,nz,cm,table);
}

// 方块自己发光（自发光）的强度表：体素地形里这些方块的贴图按 原色 × 强度 × 发光倍数（材质.ts 的 blockGlow，世界自己设，默认 0 不发光）画，
// 远处粗级合并时它们露在外面的格优先（pipeline/世界/烘焙/合并.ts，世界声明 [bake] glowFirst 开）。纯数据，烘焙和渲染共用。
// 亮度照原版 1.20.1 Blocks.java 的 lightLevel（手抄：取材服务端没导过带 附加.发光 的游戏方块表，见 docs/游戏导表.md），只收 10 级以上的，
// 再加岩浆块（光照 3，但原版 emissiveRendering 恒真、画成全亮）。10 级以下（紫水晶簇、棕色蘑菇、发光地衣……）算不发光。
// 用户 11-16：「我们可以做更真实的光影，没有必要一定要照着游戏的那个东西来发光」——强度 = 光照级 / 15，只用来分亮暗，不照原版光照图。

type GlowRule = { level: number; when?: Record<string, string> };
const rules: Record<string, GlowRule[]> = {};
const add = (level: number, ids: string[], when?: Record<string, string>) => {
  for (const id of ids) (rules[id.includes(':') ? id : `minecraft:${id}`] ??= []).push({ level, when });
};
add(15, ['lava', 'lava_cauldron', 'fire', 'glowstone', 'jack_o_lantern', 'sea_lantern', 'shroomlight', 'lantern', 'beacon', 'conduit', 'end_gateway', 'end_portal', 'ochre_froglight', 'verdant_froglight', 'pearlescent_froglight']);
add(15, ['magma_block']); // 原版光照 3，emissiveRendering 画成全亮
add(15, ['quark:blaze_lantern']); // 夸克 烈焰灯笼：照原版萤石的 15
add(15, ['redstone_lamp', 'campfire'], { lit: 'true' });
add(15, ['respawn_anchor'], { charges: '4' });
add(11, ['respawn_anchor'], { charges: '3' });
add(14, ['torch', 'wall_torch', 'end_rod']);
add(14, ['cave_vines', 'cave_vines_plant'], { berries: 'true' });
add(13, ['furnace', 'blast_furnace', 'smoker'], { lit: 'true' });
add(11, ['nether_portal']);
add(10, ['soul_fire', 'soul_torch', 'soul_wall_torch', 'soul_lantern', 'crying_obsidian']);
add(10, ['soul_campfire'], { lit: 'true' });

const parseProps = (s: string) => new Map(s.includes('[') ? s.slice(s.indexOf('[') + 1, -1).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]) : []);

/** 方块状态（"minecraft:fire[age=0,…]"）自己发多亮：0～1（光照级 / 15），不发光 0。规则写了属性的要属性对上 */
export const blockGlow = (state: string): number => {
  const list = rules[state.split('[')[0]!];
  if (!list) return 0;
  const props = parseProps(state);
  const hit = list.find((r) => !r.when || Object.entries(r.when).every(([k, v]) => props.get(k) === v));
  return hit ? hit.level / 15 : 0;
};

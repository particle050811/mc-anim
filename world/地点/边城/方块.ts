// 边城的方块：贴图图集（方块贴图.png，工具/游戏取材/边城贴图.py 从 1.20.1 客户端 jar 取），方块的六个面各贴哪张，方块的形状。
// 体素.ts 用「方块 + 形状」的编号（1～255）记每一格，合并成长方体后交给 渲染.ts 画。
import raw资产 from 'asset:数据/场景/边城/方块贴图';
// 贴图名照 方块贴图.json 的键
export type TextureName =
  '石砖' | '裂纹石砖' | '苔石砖' | '錾制石砖' | '平滑石头' | '平滑石台阶侧' | '石头' | '圆石' | '苔石' | '磨制安山岩' | '安山岩' | '橡木木板' | '云杉木板' | '深色橡木木板' | '白桦木板' | '橡木原木' | '橡木原木顶'
  | '云杉原木' | '云杉原木顶' | '深色橡木原木' | '深色橡木原木顶' | '去皮云杉原木' | '去皮云杉原木顶' | '去皮橡木原木' | '去皮橡木原木顶' | '砖块' | '深板岩瓦' | '深板岩砖' | '黑色混凝土' | '磨制黑石' | '泥土' | '砂砾'
  | '土径顶' | '干草块侧' | '干草块顶' | '木桶侧' | '木桶顶' | '白色羊毛' | '红色羊毛' | '蓝色羊毛' | '黄色羊毛' | '绿色羊毛' | '橙色羊毛' | '白色陶瓦' | '方解石' | '云杉活板门' | '水' | '草方块顶' | '草方块侧'
  | '橡树叶' | '窗' | '铁闸' | '橡木门上' | '橡木门下' | '云杉门上' | '云杉门下' | '深色橡木门上' | '深色橡木门下' | '暗';
const raw = raw资产 as unknown as { 列: number; 行: number; 贴图: Record<TextureName, { 序号: number; 来源: string; 平均色: number[] }> };

export const ATLAS = { cols: raw.列, rows: raw.行 };
export const textureIndex = (n: TextureName) => raw.贴图[n].序号;

// 方块：X / Y 是朝东西 / 南北的侧面，顶 / 底；换：这几个朝向的面把贴图转 90°（横放的原木），位 1 = X 面、2 = Y 面、4 = 顶底；
// 变体：同一种方块里按格子随机换成别的贴图（石砖里混裂纹石砖、苔石砖，和游戏里建城墙的做法一样），[贴图, 比例] 最多两种
export type BlockDef = { X: number; Y: number; 顶: number; 底: number; 换: number; 变: [number, number, number, number] };
const uniformBlock = (n: TextureName, variants: [TextureName, number][] = []): BlockDef => facesBlock(n, n, n, n, 0, variants);
const facesBlock = (x: TextureName, y: TextureName, topTex: TextureName, bottomTex: TextureName, rotateMask = 0, variants: [TextureName, number][] = []): BlockDef => ({
  X: textureIndex(x),
  Y: textureIndex(y),
  顶: textureIndex(topTex),
  底: textureIndex(bottomTex),
  换: rotateMask,
  变: [variants[0] ? textureIndex(variants[0][0]) : -1, variants[1] ? textureIndex(variants[1][0]) : -1, variants[0]?.[1] ?? 0, variants[1]?.[1] ?? 0],
});
// 原木：竖着放（顶底是年轮），沿 X 横放（东西两面是年轮，其余的面贴图转 90°，纹理顺着原木），沿 Y 横放
const logBlock = (sideTex: TextureName, endTex: TextureName) => ({
  upright: facesBlock(sideTex, sideTex, endTex, endTex),
  X: facesBlock(endTex, sideTex, sideTex, sideTex, 2 | 4),
  Y: facesBlock(sideTex, endTex, sideTex, sideTex, 1),
});
const oakLog = logBlock('橡木原木', '橡木原木顶');
const spruceLog = logBlock('云杉原木', '云杉原木顶');
const darkOakLog = logBlock('深色橡木原木', '深色橡木原木顶');
const strippedSpruce = logBlock('去皮云杉原木', '去皮云杉原木顶');
const strippedOak = logBlock('去皮橡木原木', '去皮橡木原木顶');

export const blockTable = {
  // 城墙、塔楼的石砖：一成多换成裂纹石砖、苔石砖
  石砖: uniformBlock('石砖', [['裂纹石砖', 0.07], ['苔石砖', 0.06]]),
  净石砖: uniformBlock('石砖'),
  錾制石砖: uniformBlock('錾制石砖'),
  圆石: uniformBlock('圆石', [['苔石', 0.18]]),
  磨制安山岩: uniformBlock('磨制安山岩'),
  安山岩: uniformBlock('安山岩'),
  // 石半砖（平滑石台阶）：顶面平滑石头，侧面是台阶侧面的贴图
  平滑石台阶: facesBlock('平滑石台阶侧', '平滑石台阶侧', '平滑石头', '平滑石头'),
  平滑石头: uniformBlock('平滑石头'),
  橡木木板: uniformBlock('橡木木板'),
  云杉木板: uniformBlock('云杉木板'),
  深色橡木木板: uniformBlock('深色橡木木板'),
  白桦木板: uniformBlock('白桦木板'),
  橡木原木: oakLog.upright,
  橡木原木X: oakLog.X,
  橡木原木Y: oakLog.Y,
  云杉原木: spruceLog.upright,
  云杉原木X: spruceLog.X,
  云杉原木Y: spruceLog.Y,
  深色橡木原木: darkOakLog.upright,
  深色橡木原木X: darkOakLog.X,
  深色橡木原木Y: darkOakLog.Y,
  去皮云杉原木: strippedSpruce.upright,
  去皮云杉原木X: strippedSpruce.X,
  去皮云杉原木Y: strippedSpruce.Y,
  去皮橡木原木: strippedOak.upright,
  去皮橡木原木X: strippedOak.X,
  去皮橡木原木Y: strippedOak.Y,
  砖块: uniformBlock('砖块'),
  深板岩瓦: uniformBlock('深板岩瓦'),
  深板岩砖: uniformBlock('深板岩砖'),
  黑色混凝土: uniformBlock('黑色混凝土'),
  磨制黑石: uniformBlock('磨制黑石'),
  方解石: uniformBlock('方解石'),
  白色陶瓦: uniformBlock('白色陶瓦'),
  草方块: facesBlock('草方块侧', '草方块侧', '草方块顶', '泥土'),
  泥土: uniformBlock('泥土'),
  砂砾: uniformBlock('砂砾'),
  橡树叶: uniformBlock('橡树叶'),
  窗: uniformBlock('窗'),
  铁闸: uniformBlock('铁闸'),
  橡木门上: uniformBlock('橡木门上'),
  橡木门下: uniformBlock('橡木门下'),
  云杉门上: uniformBlock('云杉门上'),
  云杉门下: uniformBlock('云杉门下'),
  深色橡木门上: uniformBlock('深色橡木门上'),
  深色橡木门下: uniformBlock('深色橡木门下'),
  暗: uniformBlock('暗'),
  干草块: facesBlock('干草块侧', '干草块侧', '干草块顶', '干草块顶'),
  木桶: facesBlock('木桶侧', '木桶侧', '木桶顶', '木桶顶'),
  白色羊毛: uniformBlock('白色羊毛'),
  红色羊毛: uniformBlock('红色羊毛'),
  蓝色羊毛: uniformBlock('蓝色羊毛'),
  黄色羊毛: uniformBlock('黄色羊毛'),
  绿色羊毛: uniformBlock('绿色羊毛'),
  橙色羊毛: uniformBlock('橙色羊毛'),
  水: uniformBlock('水'),
} satisfies Record<string, BlockDef>;
export type BlockName = keyof typeof blockTable;

// 形状：整块；下半 / 上半砖（台阶）；楼梯（梯 + 朝向：高的那半在哪边，北 = +Y、东 = +X）；倒梯（上下颠倒的楼梯，檐口、托座用）
export const shapeList = ['全', '下半', '上半', '梯北', '梯南', '梯东', '梯西', '倒梯北', '倒梯南', '倒梯东', '倒梯西'] as const;
export type Shape = (typeof shapeList)[number];

// 格子编号：0 = 空气，1～255 = 第几种「方块 + 形状」（用到才登记）
const registry: { blocks: BlockName; shape: Shape }[] = [{ blocks: '石砖', shape: '全' }];
const idByKey = new Map<string, number>();
export const idOf = (block: BlockName, shape: Shape = '全'): number => {
  const k = `${block}|${shape}`;
  let id = idByKey.get(k);
  if (id === undefined) {
    id = registry.length;
    if (id > 255) throw new Error('边城的方块种类超过 255 种');
    registry.push({ blocks: block, shape: shape });
    idByKey.set(k, id);
  }
  return id;
};
export const entryOf = (n: number) => registry[n];

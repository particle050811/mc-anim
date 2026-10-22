// 6-2-1 拿起两件战利品时弹出的两页匠魂（Tinkers' Construct 3.12.1.231）JEI：毛皮弹「部件制造台」的链甲基底页，血弹「冶炼炉燃料」页。
//
// 用户 10-03 要求体现原文两个核心内容（资料/小说原文/6.md 开头）：雪怪首领皮肤作为锁链基底（三级材料、许多免伤机制数值微乎其微、比四级远古兽皮性价比高），
// 炽热眼泪与炽热血液作为匠魂炉子的高温燃料。整合包现装的匠魂、暮色森林里都没有这两样，1.20.1 的匠魂附属 Cloudertinker
// （CurseForge 1342191，cloudertinker-1.20.1-forge-1.2.11.jar，在 game/缓存/mods/）两样都有，两页照它的 data 做，故事里的整合包算装了它（用户 10-03）：
// - 雪怪首领毛皮是材料 cloudertinker:alpha_fur（一张毛皮 = 1 个单位），tier 3，能做链甲基底（tconstruct:maille）；
//   链甲基底词条（traits/alpha_fur.json）：暮光、凛寒气场 III、鞣制。对照远古兽皮 tier 4、不能在部件制造台做，词条「加强」多一个防御槽。
// - 燃料：recipes/fuel/fireblood.json 把「炽热的液体」（tconstruct:fiery_liquid）注册成冶炼炉燃料：25 mB、持续 500、速率 40、2000°C；炽热的血液、炽热之泪熔成 250 mB（1500°C）。
//   另一个附属 Twilight Construct（twilight_construct-1.0.7.jar）也加了燃料，但液体是它自己的「炽热精华」（10 mB、持续 400、速率 17、1700°C），它没有雪怪首领毛皮。
//   `fuelData` 两份都留着，用 `fuelSource` 切换。
//
// 排版照匠魂 JEI 类别（cfr 反编译 slimeknights.tconstruct.plugin.jei）：
// - 冶炼炉燃料（melting.FuelCategory）132×40：液体槽 (4,4) 12×32、容量按 100 mB 画，槽底是 melting.png (3,3) 那块 14×34 凹槽；
//   (21,0) 白字带阴影写液体名；(21,11) 灰字温度；(21,21) 灰字「速度倍率：%sx」（速率 / 10）；(21,31) 宽 105 一行：左「持续：」、右对齐「%s 秒 / %s mB」（持续 / 5、每次耗的量）。灰是 #808080。
//   fuel 三个键匠魂的 zh_cn.json 里没有，游戏里退回英文，画面上译成中文（用户 10-03），措辞照同类键。类别图标是烈焰血桶。
//   催化剂（JEIPlugin.registerRecipeCatalysts 注册给 FUEL 的，按注册顺序）：焦黑熔化炉、焦黑加热器、冶炼炉控制器、焦褐合金炉、熔铸炉控制器。这一类只有这一条，页码 1/1。
// - 部件制造台（partbuilder.PartBuilderCategory）121×36：(3,2) 材料名（材料颜色、带阴影）；(4,16) 模具；(25,16) 材料物品；(46,16) 图案按钮（tinker_station.png 45,132 的 18×18 凸起按钮）；箭头 (66,15)；成品 (96,15) 大槽。
//   材料格显示够做一个部件的数量：链甲基底 cost 2，毛皮 1 个单位 → ×2。能用这种材料的部件配方按配方 id 排（Mantle RecipeHelper.getJEIRecipes），链甲基底是第 5 条，页码 5/9。
//   鼠标停在成品上按住 Ctrl：ToolPartItem.appendHoverText 列出部件词条名，每个下面一行灰字说明；最后 JEI 写模组名（部件的 getCreatorModId 取材料命名空间，即 cloudertinker）。
//   部件名照 MaterialItem.getName：没有专门的键时用 item.tconstruct.tool.format「%s%s」= 材料名 + 「链甲基底」。
//   颜色取 assets/*/mantle/colors.json：材料 alpha_fur #4764AC、暮光 #298900、凛寒气场 #AAE6F1、鞣制 #C65C35。等级：暮光不写，鞣制不写，凛寒气场写罗马数字「III」。
// 文字取各 jar 的 zh_cn（匠魂、Cloudertinker 的 material.* 与 modifier.*、Twilight Construct 的 fluid.*）。
import React from 'react';
import { png, type Png } from '../../engine/model/贴图.ts';
import type { BlockModelData } from '../../engine/model/方块模型.tsx';
import { PixelSprite, BlockIcon, Tooltip, UiText, chatColors, type TooltipLine } from './基础.tsx';
import { JeiRecipeWindow, InsetSlot, LargeSlot, ItemSlot, RecipeArrow } from './JEI.tsx';
import blockModelJson from 'asset:模型/界面/方块图标';
import blockAtlasPng from 'asset:贴图/界面/方块图标';
import fieryLiquidPng from 'asset:贴图/界面/炽热的液体';
import stewPng from 'asset:贴图/界面/炖汤';
import blazingBloodPng from 'asset:贴图/界面/烈焰血';
import bucketPng from 'asset:贴图/界面/桶';
import bucketFluidMaskPng from 'asset:贴图/界面/桶液体遮罩';
import alphaFurPng from 'asset:贴图/界面/雪怪首领毛皮';
import patternPng from 'asset:贴图/界面/模具';
import mailleIconPng from 'asset:贴图/界面/链甲基底';
import maillePartPng from 'asset:贴图/界面/链甲基底部件';

const blockModel = blockModelJson as unknown as BlockModelData;
export const UiBlockIcon: React.FC<{ part: string; size: number }> = ({ part, size: sizePx }) => <BlockIcon data={blockModel} atlas={png(blockAtlasPng)} part={part} size={sizePx} />;

const jeiGray = '#808080'; // java.awt.Color.GRAY：匠魂 JEI 里温度、倍率、持续时间的字

// ---------- 贴图加工（游戏运行时做的事，这里照做一遍） ----------
// 部件贴图：Cloudertinker 没带链甲基底的现成贴图，匠魂游戏里按 assets/cloudertinker/tinkering/materials/alpha_fur.json 的 generator（recolor_sprite + grey_to_color）现生成：
// 把部件灰度图（tconstruct:item/tool/parts/maille）的灰度按下面这张表映射成颜色（表中间线性插值）。
const alphaFurPalette: [number, number][] = [
  [0, 0x252233],
  [63, 0x264470],
  [102, 0x4764ac],
  [140, 0x71aada],
  [178, 0x71aada],
  [216, 0xaae6f1],
  [255, 0xf7f7f7],
];
const recolorGrayscale = (tex: Png, palette: [number, number][]): Png => {
  const px = new Uint8Array(tex.px);
  for (let i = 0; i < tex.w * tex.h; i++) {
    if (!px[i * 4 + 3]) continue;
    const grayLevel = px[i * 4];
    let k = 0;
    while (k < palette.length - 2 && grayLevel > palette[k + 1][0]) k++;
    const [g0, c0] = palette[k];
    const [g1, c1] = palette[k + 1];
    const t = Math.max(0, Math.min(1, (grayLevel - g0) / (g1 - g0)));
    for (let ch = 0; ch < 3; ch++) {
      const sh = 16 - ch * 8;
      px[i * 4 + ch] = Math.round(((c0 >> sh) & 255) * (1 - t) + ((c1 >> sh) & 255) * t);
    }
  }
  return { w: tex.w, h: tex.h, px };
};
// 液体桶：烈焰血桶的物品模型是 forge:item/bucket_drip + tconstruct:fluid_container，即原版空桶上按 forge:item/mask/bucket_fluid_drip 不透明的像素贴液体静止贴图（第一帧；烈焰血不染色）
const bucketWithFluid = (fluidTex: Png): Png => {
  const bucketTex = png(bucketPng);
  const maskTex = png(bucketFluidMaskPng);
  const px = new Uint8Array(bucketTex.px);
  for (let i = 0; i < 16 * 16; i++) {
    if (!maskTex.px[i * 4 + 3]) continue;
    for (let ch = 0; ch < 4; ch++) px[i * 4 + ch] = fluidTex.px[i * 4 + ch];
  }
  return { w: 16, h: 16, px };
};
let textureCache: { maille: Png; blazingBloodBucket: Png } | null = null;
const processTextures = () => (textureCache ??= { maille: recolorGrayscale(png(maillePartPng), alphaFurPalette), blazingBloodBucket: bucketWithFluid(png(blazingBloodPng)) });

// ---------- 冶炼炉燃料 ----------
type SmelteryFuel = { fluidName: string; 贴图: string; ticksPerFrame: number; 染色?: string; 温度: number; rate: number; 持续: number; 量: number; sourceMod: string };
export const fuelData: Record<'Cloudertinker' | 'Twilight Construct', SmelteryFuel> = {
  // cloudertinker-1.20.1-forge-1.2.11.jar data/cloudertinker/recipes/fuel/fireblood.json；液体贴图 tconstruct:fluid/slime/fiery/still（32 帧、每帧 3 刻）
  Cloudertinker: { fluidName: '炽热的液体', 贴图: fieryLiquidPng, ticksPerFrame: 3, 温度: 2000, rate: 40, 持续: 500, 量: 25, sourceMod: 'cloudertinker' },
  // twilight_construct-1.0.7.jar data/twilight_construct/recipes/smeltery/fuel/fiery.json；
  // 液体贴图借匠魂的 tconstruct:fluid/food/stew/still（每帧 2 刻），染成 FF4F1010（assets/twilight_construct/mantle/fluid_texture/fiery_blood.json）
  'Twilight Construct': { fluidName: '炽热精华', 贴图: stewPng, ticksPerFrame: 2, 染色: '#4F1010', 温度: 1700, rate: 17, 持续: 400, 量: 10, sourceMod: 'twilight_construct' },
};
// 画面上用哪一份：Cloudertinker 同时有雪怪首领毛皮材料，一个附属把两件战利品都讲通，先用它
export const fuelSource: keyof typeof fuelData = 'Cloudertinker';

export const fuelRecipeSize = { width: 132, height: 40 };
export const FuelRecipe: React.FC<{ s: number; t: number }> = ({ s: scale, t }) => {
  const fuel = fuelData[fuelSource];
  const fluidHeight = (32 * fuel.量) / 100; // JEI 液体槽按 100 mB 的容量画
  const frame = Math.floor((t * 20) / fuel.ticksPerFrame);
  const tex = png(fuel.贴图);
  const textRow = (y: number, text: string, c = jeiGray, shadow = false) => (
    <div style={{ position: 'absolute', left: 21 * scale, top: y * scale }}>
      <UiText fontSize={8.6 * scale} color={c} shadow={shadow}>
        {text}
      </UiText>
    </div>
  );
  return (
    <>
      <InsetSlot x={3} y={3} w={14} h={34} s={scale} />
      {/* 液体从槽底往上画，贴图按 16 像素平铺（JEI 的液体渲染），宽 12 */}
      <div style={{ position: 'absolute', left: 4 * scale, top: (36 - fluidHeight) * scale, width: 12 * scale, height: fluidHeight * scale, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0 }}>
          <PixelSprite tex={tex} size={16 * scale} frame={frame} />
        </div>
        {fuel.染色 && <div style={{ position: 'absolute', inset: 0, background: fuel.染色, mixBlendMode: 'multiply' }} />}
      </div>
      {textRow(0, fuel.fluidName, chatColors.white, true)}
      {textRow(11, `${fuel.温度}°C`)}
      {textRow(21, `速度倍率：${(fuel.rate / 10).toFixed(1)}x`)}
      {textRow(31, '持续：')}
      <div style={{ position: 'absolute', left: 21 * scale, top: 31 * scale, width: 105 * scale, textAlign: 'right' }}>
        <UiText fontSize={8.6 * scale} color={jeiGray} shadow={false}>
          {`${fuel.持续 / 5} 秒 / ${fuel.量} mB`}
        </UiText>
      </div>
    </>
  );
};

// ---------- 部件制造台：模具 + 雪怪首领毛皮 ×2 → 雪怪首领毛皮链甲基底 ----------
export const mailleRecipeSize = { width: 121, height: 36 };
const alphaFurColor = '#4764AC';
export const mailleTooltip: TooltipLine[] = [
  { text: '雪怪首领毛皮链甲基底' },
  { text: '暮光', color: '#298900' },
  { text: '每件位于暮色森林时盔甲韧性+1，位于其他维度时护甲值+1' },
  { text: '凛寒气场 III', color: '#AAE6F1' },
  { text: '受击时会冰冻你的敌人，如果对方已经冰冻则会每级以霜冻伤害反射5%的伤害' },
  { text: '鞣制', color: '#C65C35' },
  { text: '工具不再因某些操作而损失双倍或更多耐久度了' },
  { text: 'cloudertinker', color: chatColors.blue, italic: true },
];
export const MailleRecipe: React.FC<{ s: number }> = ({ s: scale }) => {
  const processed = processTextures();
  return (
    <>
      <div style={{ position: 'absolute', left: 3 * scale, top: 3 * scale }}>
        <UiText fontSize={8.6 * scale} color={alphaFurColor}>
          雪怪首领毛皮
        </UiText>
      </div>
      <ItemSlot x={4} y={16} s={scale}>
        <PixelSprite tex={png(patternPng)} size={16 * scale} />
      </ItemSlot>
      <ItemSlot x={25} y={16} s={scale} count={2}>
        <PixelSprite tex={png(alphaFurPng)} size={16 * scale} />
      </ItemSlot>
      {/* 图案按钮（tinker_station.png 45,132 那个凸起的按钮）上画「链甲基底」的图案 */}
      <div
        style={{
          position: 'absolute',
          left: 45 * scale,
          top: 15 * scale,
          width: 18 * scale,
          height: 18 * scale,
          borderRadius: 1 * scale,
          background: '#B8B8B8',
          boxShadow: `0 0 0 ${0.6 * scale}px #3A3A3A, inset ${scale}px ${scale}px 0 #F0F0F0, inset ${-scale}px ${-scale}px 0 #6A6A6A`,
        }}
      />
      <div style={{ position: 'absolute', left: 46 * scale, top: 16 * scale }}>
        <PixelSprite tex={png(mailleIconPng)} size={16 * scale} />
      </div>
      <RecipeArrow x={66} y={15} s={scale} />
      <LargeSlot x={96} y={15} s={scale} />
      <ItemSlot x={96} y={15} s={scale} withSlot={false}>
        <PixelSprite tex={processed.maille} size={16 * scale} />
      </ItemSlot>
    </>
  );
};

// ---------- 两个完整的 JEI 窗口 ----------
type WindowProps = { s: number; x: number; y: number; windowVisibility: number; t: number };
export const FuelWindow: React.FC<WindowProps> = ({ s: scale, x, y, windowVisibility: visibility, t }) => (
  <JeiRecipeWindow
    s={scale}
    x={x}
    y={y}
    title="冶炼炉燃料"
    page="1/1"
    tabIcon={<PixelSprite tex={processTextures().blazingBloodBucket} size={16 * scale} />}
    catalysts={['焦黑熔化炉', '焦黑加热器', '冶炼炉控制器', '焦褐合金炉', '熔铸炉控制器'].map((k) => (
      <UiBlockIcon key={k} part={k} size={16 * scale} />
    ))}
    recipeWidth={fuelRecipeSize.width}
    recipeHeight={fuelRecipeSize.height}
    visibility={visibility}
  >
    <FuelRecipe s={scale} t={t} />
  </JeiRecipeWindow>
);

// 提示：0～1，鼠标停到成品上按住 Ctrl 的提示框。游戏里贴着鼠标右上方会盖住中间的人，这里挪到窗口正下方、和窗口左边对齐，长行按 `最宽` 折行
export const MailleWindow: React.FC<WindowProps & { tooltipVisibility: number }> = ({ s: scale, x, y, windowVisibility: visibility, tooltipVisibility }) => (
  <>
    <JeiRecipeWindow
      s={scale}
      x={x}
      y={y}
      title="部件制造台"
      page="5/9"
      tabIcon={<UiBlockIcon part="部件制造台" size={16 * scale} />}
      catalysts={[<UiBlockIcon key="a" part="部件制造台" size={16 * scale} />]}
      recipeWidth={mailleRecipeSize.width}
      recipeHeight={mailleRecipeSize.height}
      visibility={visibility}
    >
      <MailleRecipe s={scale} />
    </JeiRecipeWindow>
    {tooltipVisibility > 0 && visibility > 0 && (
      <div style={{ position: 'absolute', left: x, top: y, opacity: Math.min(tooltipVisibility, visibility) }}>
        <Tooltip s={scale} maxWidth={168} lines={mailleTooltip} style={{ left: 4 * scale, top: 92 * scale }} />
      </div>
    )}
  </>
);

// 6-2-2、6-2-3 的 JEI 铁砧页：附魔书（保护 IV）+ 古卷 → 附魔书（保护 V），三件东西各拉一根思索那样的引线标出名字。
//
// 出处：
// - 这一页是夸克（Quark-4.0-462）自己往 JEI 里加的：`QuarkJeiPlugin.registerAncientTomeAnvilRecipes` 对每个能出古卷的魔咒注册一条铁砧配方——左边是满级附魔书，右边是这个魔咒的古卷，输出是「满级 + 1」的附魔书。在 JEI 里查古卷（或满级的保护书）的用途就会翻到它。
// - 排版照 JEI 的 `AnvilRecipeCategory`（javap）：125×38；左槽 (1,1)、加号 (27,3)、右槽 (50,1)、箭头 (76,1)、输出 (108,1)；附魔花费写在 (2,27)、右对齐、带阴影，够等级是绿色（不够或 ≥ 40 级是红色）。
// - 附魔花费 30 是核实过的（用户 10-03 要求，cfr 反编译 Quark-4.0-462.jar）：JEI 的数是 `AnvilHelper.findLevelsCost` 把两样东西放进假铁砧读出来的，会触发夸克 `AncientTomesModule.onAnvilUpdate` 接管：
//   左边已有古卷那个魔咒、等级 ≤ 上限时，等级 +1，花费 = 新等级超过上限 ? `limitBreakUpgradeCost`（默认 30）: `normalUpgradeCost`（默认 10），改名再 +1，不再加原版的累积惩罚。
//   所以保护 IV + 古卷 → 保护 V 是 30 级，保护 III + 古卷 → 保护 IV 只要 10 级；之后把超限的书合到装备上走 `combineWithBooks` 那一支，花 10 级。
// - 文字：附魔书 / 保护 / IV / V / 附魔花费：%1$s / 铁砧 取原版 zh_cn；古卷（item.quark.ancient_tome）、「+I %s（最高为%s）」（quark.misc.ancient_tome_tooltip，古卷提示框第二行）取夸克 zh_cn。
// - 颜色：附魔书、古卷的稀有度是 UNCOMMON（黄字）；超过上限的附魔书夸克改成 EPIC（淡紫字），默认 `overleveledBooksGlowRainbow` = true，光效换成 assets/quark/textures/glint/enchanted_item_glint_rainbow.png 的彩虹色；古卷 isFoil 恒为真，也有附魔光效。
// - 注意：夸克默认的「能出古卷的魔咒」列表（`AncientTomesModule.generateDefaultEnchantmentList`）里没有保护，要有保护的古卷，整合包得在夸克配置的 Valid Enchantments 里加上 minecraft:protection（保护满级 4 级，过得了 `sanityCheck`）。故事里的整合包算这样配置了（用户 10-03 定）。
// - 古城宝箱：夸克默认往 minecraft:chests/ancient_city 里放古卷（权重 4），「古城的宝箱里就有」是真的。
import React from 'react';
import { png } from '../../engine/model/贴图.ts';
import { PixelSprite, UiText, chatColors, type TooltipLine } from './基础.tsx';
import { JeiRecipeWindow, jeiPoint, jeiLayout, PlusSign, ItemSlot, RecipeArrow } from './JEI.tsx';
import { UiBlockIcon } from './匠魂.tsx';
import { PonderCallout } from './思索.tsx';
import enchantedBookPng from 'asset:贴图/界面/附魔书';
import ancientTomePng from 'asset:贴图/界面/古卷';
import glintPng from 'asset:贴图/界面/附魔光效';
import rainbowGlintPng from 'asset:贴图/界面/彩虹光效';

export const anvilRecipeSize = { width: 125, height: 38 };

export const AnvilRecipe: React.FC<{ s: number; t: number }> = ({ s: scale, t }) => (
  <>
    <ItemSlot x={1} y={1} s={scale}>
      <PixelSprite tex={png(enchantedBookPng)} size={16 * scale} glint={{ tex: png(glintPng), time: t }} />
    </ItemSlot>
    <PlusSign x={27} y={3} s={scale} />
    <ItemSlot x={50} y={1} s={scale}>
      <PixelSprite tex={png(ancientTomePng)} size={16 * scale} glint={{ tex: png(glintPng), time: t + 3.1 }} />
    </ItemSlot>
    <RecipeArrow x={76} y={1} s={scale} />
    <ItemSlot x={108} y={1} s={scale}>
      <PixelSprite tex={png(enchantedBookPng)} size={16 * scale} glint={{ tex: png(rainbowGlintPng), time: t + 1.7 }} />
    </ItemSlot>
    <div style={{ position: 'absolute', left: 2 * scale, top: 27 * scale, width: 121 * scale, textAlign: 'right' }}>
      <UiText fontSize={8.6 * scale} color={chatColors.green}>
        附魔花费：30
      </UiText>
    </div>
  </>
);

// 三条标注的文字：只写游戏里这件东西的提示框真会显示的——物品名（稀有度颜色）、第二行（灰字）；不加自己的白字（用户 10-03）。
export const tomeCalloutLines: TooltipLine[][] = [
  [{ text: '附魔书', color: chatColors.yellow }, { text: '保护 IV', color: chatColors.gray }],
  [{ text: '古卷', color: chatColors.yellow }, { text: '+I 保护（最高为V）', color: chatColors.gray }],
  [{ text: '附魔书', color: chatColors.lightPurple }, { text: '保护 V', color: chatColors.gray }],
];

// 窗口加三条标注。x、y：窗口主体左上角（画面像素）；标注：三条各自的进度 0～1（左槽、古卷、输出）
export const TomeRecipeWindow: React.FC<{ s: number; x: number; y: number; windowVisibility: number; labels: [number, number, number]; t: number }> = ({ s: scale, x, y, windowVisibility: visibility, labels: calloutProgress, t }) => {
  const windowGeom = { s: scale, x, y, recipeWidth: anvilRecipeSize.width, recipeHeight: anvilRecipeSize.height };
  const layout = jeiLayout(anvilRecipeSize.width, anvilRecipeSize.height);
  const windowBottom = y + layout.height * scale; // 窗口下沿
  // 槽的下沿中点（配方坐标：槽 16 + 1 像素边）
  const leftSlotPt = jeiPoint(windowGeom, 1 + 8, 18);
  const middleSlotPt = jeiPoint(windowGeom, 50 + 8, 18);
  const outputSlotPt = jeiPoint(windowGeom, 108 + 8, 18);
  const slotOutlineAt = (rx: number): [number, number, number] => {
    const topLeft = jeiPoint(windowGeom, rx - 1.5, -0.5);
    return [topLeft[0], topLeft[1], 19 * scale];
  };
  // 右边那根线先往下一点、再往右拐出窗口，避开右对齐的「附魔花费」，再往下接说明框
  const rightBendY = outputSlotPt[1] + 4 * scale;
  const rightExitX = x + (layout.width + 8) * scale;
  const k = visibility;
  return (
    <>
      <TomeJeiWindow s={scale} x={x} y={y} windowVisibility={visibility} t={t} />
      <div style={{ opacity: k }}>
        <PonderCallout s={scale} lineStart={leftSlotPt} boxPos={[leftSlotPt[0] - 46 * scale, windowBottom + 14 * scale]} slotOutline={slotOutlineAt(1)} lines={tomeCalloutLines[0]} progress={calloutProgress[0]} />
        <PonderCallout s={scale} lineStart={middleSlotPt} boxPos={[middleSlotPt[0] - 30 * scale, windowBottom + 14 * scale]} slotOutline={slotOutlineAt(50)} lines={tomeCalloutLines[1]} progress={calloutProgress[1]} />
        <PonderCallout s={scale} lineStart={outputSlotPt} path={[[outputSlotPt[0], rightBendY], [rightExitX, rightBendY]]} boxPos={[rightExitX - 8 * scale, windowBottom + 14 * scale]} slotOutline={slotOutlineAt(108)} lines={tomeCalloutLines[2]} progress={calloutProgress[2]} />
      </div>
    </>
  );
};

const TomeJeiWindow: React.FC<{ s: number; x: number; y: number; windowVisibility: number; t: number }> = ({ s: scale, x, y, windowVisibility: visibility, t }) => (
  <JeiRecipeWindow
    s={scale}
    x={x}
    y={y}
    title="铁砧"
    page="1/1"
    tabIcon={<UiBlockIcon part="铁砧" size={16 * scale} />}
    catalysts={[<UiBlockIcon key="a" part="铁砧" size={16 * scale} />, <UiBlockIcon key="b" part="开裂的铁砧" size={16 * scale} />, <UiBlockIcon key="c" part="损坏的铁砧" size={16 * scale} />]}
    recipeWidth={anvilRecipeSize.width}
    recipeHeight={anvilRecipeSize.height}
    visibility={visibility}
  >
    <AnvilRecipe s={scale} t={t} />
  </JeiRecipeWindow>
);

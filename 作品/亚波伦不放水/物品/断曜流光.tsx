// 断曜流光：启示录的 goety_revelation:valettein（zh_cn「断曜流光」），史蒂夫手里的剑（用户 11-10 定）。
// 游戏里（反编译）：ValetteinItem extends ModSwordItem extends SwordItem，没有自己的渲染器、没有 isFoil 重写，拿在手上走原版 ItemInHandLayer。
// 模型 models/item/valettein.json 是 forge:separate_transforms：手里、地上用 valettein_normal（Blockbench 元素模型，一片 0.25 像素厚的薄片，64×64 贴图），
// 物品栏用 valettein_gui（item/generated 的平面图标）。它带一条 override：属性 revelationfix:transformed = 1 时整个换成 item/transform/valettein，
// 结构一样，指到 transform/ 下另一份 valettein_normal、valettein_gui，模型、贴图、display 全都不同。两套外观见 物品/装备外观.ts：
//   新版 58 个元素，x 5.25～10.5、y −0.25～19.5、z 8～8.25；旧版 31 个元素，x 6～10.25、y 0～18.2、z 0～0.25（薄片贴在模型格子的北面上，靠 display 的平移挪回手里）。
// 两个模型都是原样导出（配方「亚波伦史蒂夫装备」），display 照各自的 json 抄。
// 坐标：物品空间（单位格，原点 = 模型 (8, 8, 8)，Y 朝上，游戏的北 = −Z）。
import { type FC, useMemo } from 'react';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { ItemSprite, type ItemTransform } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { GlintItem, 附魔光效补丁 } from '@库/物品/附魔物品.tsx';
import { 默认外观, type 装备外观 } from './装备外观.ts';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 新版数据 from 'asset:模型/物品/断曜流光';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 新版图集 from 'asset:贴图/物品/断曜流光';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 新版图标 from 'asset:贴图/物品/断曜流光.图标';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧版数据 from 'asset:模型/物品/断曜流光.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧版图集 from 'asset:贴图/物品/断曜流光.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧版图标 from 'asset:贴图/物品/断曜流光.旧版.图标';

const 表 = {
  旧版: { 模型: 旧版数据 as unknown as BlockModelData, 图集: 旧版图集, 图标: 旧版图标 },
  新版: { 模型: 新版数据 as unknown as BlockModelData, 图集: 新版图集, 图标: 新版图标 },
} as const;

/** 各自 valettein_normal.json 的 display（旧版 = models/item/transform/ 下那份） */
export const 断曜流光显示 = {
  旧版: {
    thirdperson_righthand: { rotation: [0, 90, 0], translation: [8, 6, 2], scale: [1.8, 1.8, 1] },
    thirdperson_lefthand: { rotation: [0, -90, 0], translation: [-8, 6, 2], scale: [1.8, 1.8, 1] },
    firstperson_righthand: { rotation: [0, 90, 0], translation: [7, 5.25, 2], scale: [0.9, 0.99, 0.9] },
    firstperson_lefthand: { rotation: [0, -90, 0], translation: [-6.5, 5.25, 2], scale: [0.9, 0.99, 0.8] },
    ground: { rotation: [0, 0, -45], translation: [0, 1.5, 4], scale: [0.75, 0.75, 0.5] },
    gui: { rotation: [0, 0, -45], translation: [-1, -1, 0], scale: [1.13086, 1.08594, 1] },
    fixed: { rotation: [0, 180, -45], translation: [0.75, -1.25, -4.25], scale: [1.2, 1.2, 0.66] },
  },
  新版: {
    thirdperson_righthand: { rotation: [0, 90, 0], translation: [-0.25, 7.5, 1.5], scale: [1.8, 1.8, 1.8] },
    thirdperson_lefthand: { rotation: [0, -90, 0], translation: [0.25, 7.5, 1.5], scale: [1.8, 1.8, 1.8] },
    firstperson_righthand: { rotation: [10, 90, 0], translation: [-0.5, 4, 1.75] },
    firstperson_lefthand: { rotation: [15, -90, 0], translation: [-0.25, 4, 1.75] },
    ground: { rotation: [0, 0, -46], translation: [0, 1, 0], scale: [0.8, 0.8, 0.76] },
    gui: { rotation: [0, 0, -45], translation: [0, -1.5, 0], scale: [0.9, 0.9, 0.9] },
    fixed: { rotation: [0, 0, -45], translation: [0, -1.5, 0] },
  },
} satisfies Record<装备外观, Record<string, ItemTransform>>;

// BlockModel 的坐标是 游戏的上 = +Z、游戏的北 = +Y，绕 X 转 −90 度换回物品空间。
// 光泽秒：附魔光效滚动的时钟，不给 = 没附魔。游戏里附魔的剑走原版 ItemRenderer 的物品光效，和 库/物品/附魔物品.tsx 同一套；两套外观的贴图都是 64 像素宽。
export const 断曜流光: FC<{ 外观?: 装备外观; 光泽秒?: number }> = ({ 外观 = 默认外观, 光泽秒 }) => {
  const 附魔 = 光泽秒 !== undefined;
  const 光效 = useMemo(() => (附魔 ? 附魔光效补丁(64) : undefined), [附魔]);
  if (光效 && 附魔) 光效.设秒(光泽秒);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <BlockModel data={表[外观].模型} atlas={png(表[外观].图集)} part="剑" patch={光效?.patch} />
    </group>
  );
};

/** 物品栏里的样子：平面图标（valettein_gui），不是上面那个 3D 模型。光泽秒：给了就带附魔光效 */
export const 断曜流光图标: FC<{ 外观?: 装备外观; 光泽秒?: number }> = ({ 外观 = 默认外观, 光泽秒 }) =>
  光泽秒 === undefined ? <ItemSprite layers={[{ tex: png(表[外观].图标) }]} /> : <GlintItem layers={[{ tex: png(表[外观].图标) }]} sec={光泽秒} />;

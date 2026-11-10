// 启示录的神灵金套和断曜流光各有两套外观，jar（Goety: Revelation 2.3.6）里都在：物品 NBT revelationfix:transformed 为真时换成 transform/ 目录下那套
//（EquipmentAppearance.isTransformed；配方 *_transform.json，类型 revelationfix:equipment_appearance）。
// '新版' = 不带 NBT 的默认样子（金粉灰的甲、洋红披风、繁复护手的剑）；'旧版' = transformed 那套（红金的甲、红披风、直身的金剑）。
// 哪套更早是推的，不是模组写明的：transform/ 下的剑贴图在 jar 里的日期是 2025-05，默认那张是 2026-09；transform/ 下有张没被引用的 original_ptium_armor_layer_2.png，
// 默认目录下对应的叫 new_apocalyptium_armor_layer_*.png。用户 11-10 看了新版说「用旧版本的，新版本建模很丑」。
export type 装备外观 = '旧版' | '新版';
/** 本片默认（用户 11-10 定用旧版） */
export const 默认外观: 装备外观 = '旧版';

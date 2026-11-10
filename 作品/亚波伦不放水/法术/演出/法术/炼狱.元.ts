// 炼狱（revelationfix:revelation_focus）的元数据。出处见 炼狱.tsx。
import { 定义法术元 } from '../接口.ts';

/** 结界飞出：特效/炼狱结界演出状态.ts 的默认 1.5 秒 */
export const 炼狱飞出秒 = 1.5;
/** 罩住：片里的全片演法是罩住 67.5 秒，这里只留 1 秒（自己定的，法术核对只看结界成形、收缩） */
export const 炼狱罩住秒 = 1;
/** 收缩焚烧：默认 2.5 秒 */
export const 炼狱收缩秒 = 2.5;

export default 定义法术元({
  id: 'revelation',
  长秒: 炼狱飞出秒 + 炼狱罩住秒 + 炼狱收缩秒,
  命中秒: 炼狱飞出秒, // 结界罩住史蒂夫
  // RevelationSpell：apostle_prepare_spell；结界收缩时 BEACON_DEACTIVATE；每次伤害 FIRE_AMBIENT（音量 2～3、音高 0.3～1.0）
  声音: [
    { 资产: '音效/诡厄巫法/goety.apostle_prepare_spell.1', 秒: 0 },
    { 资产: '音效/block.beacon.deactivate', 秒: 炼狱飞出秒 + 炼狱罩住秒 },
    { 资产: '音效/block.fire.ambient', 秒: 炼狱飞出秒 + 炼狱罩住秒 + 0.4, 音量: 2, 音高: 0.5 },
    { 资产: '音效/block.fire.ambient', 秒: 炼狱飞出秒 + 炼狱罩住秒 + 1.2, 音量: 3, 音高: 0.3 },
  ],
});

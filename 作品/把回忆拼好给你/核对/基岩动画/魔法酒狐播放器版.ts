// 魔法酒狐的播放器版：库/生物/定义生物.ts 声明，几何、贴图和 魔法酒狐.tsx 是同一份资产，动作直接播 jar 里的原版动画文件（TLM 口径）。
// 只给核对用（和手抄版并排看）；正片里的魔法酒狐照旧用 库/角色/魔法酒狐.tsx。
// 控制器顺序照 GeckoMaidEntity：pre_parallel_0～3 → main（待命坐 sit）→ parallel_1、parallel_5（parallel_ 开头的转角叠加）。
// 环境：戴着头盔（魔女帽显、狐耳藏）；血量满（parallel1 里血量低于 0.2 会换成小狐狸形态）；头不转（眼睛不跟着挪）。
import { defineCreature } from '@库/生物/定义生物.ts';
import magicalWineFoxAnimation from 'asset:动画/角色/魔法酒狐';
import magicFoxModel from 'asset:模型/角色/魔法酒狐';
import texture from 'asset:贴图/角色/魔法酒狐/百花';

export const MagicalWineFoxPlayer = defineCreature({
  name: '魔法酒狐（播放器版）',
  model: magicFoxModel,
  贴图: texture,
  scale: 0.65 / 16, // TLM maid_model.json 的 render_entity_scale
  animation: {
    file: magicalWineFoxAnimation,
    defaultLayers: [
      ...['pre_parallel0', 'pre_parallel1', 'pre_parallel2', 'pre_parallel3', 'sit'].map((name) => ({ name: name })),
      { name: 'parallel1', blendMode: '叠加' as const },
      { name: 'parallel5', blendMode: '叠加' as const },
    ],
    口径: 'TLM',
    env: { query: { health: 20, max_health: 20 }, external: { 'ysm.has_helmet': 1, 'ysm.head_yaw': 0, 'ysm.head_pitch': 0 } },
  },
});

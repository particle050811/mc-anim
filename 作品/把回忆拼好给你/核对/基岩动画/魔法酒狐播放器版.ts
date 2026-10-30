// 魔法酒狐的播放器版：库/生物/定义生物.ts 声明，几何、贴图和 魔法酒狐.tsx 是同一份资产，动作直接播 jar 里的原版动画文件（TLM 口径）。
// 只给核对用（和手抄版并排看）；正片里的魔法酒狐照旧用 库/角色/魔法酒狐.tsx。
// 控制器顺序照 GeckoMaidEntity：pre_parallel_0～3 → main（待命坐 sit）→ parallel_1、parallel_5（parallel_ 开头的转角叠加）。
// 环境：戴着头盔（魔女帽显、狐耳藏）；血量满（parallel1 里血量低于 0.2 会换成小狐狸形态）；头不转（眼睛不跟着挪）。
import { 定义生物 } from '@库/生物/定义生物.ts';
import 动画 from 'asset:动画/角色/魔法酒狐';
import 模型 from 'asset:模型/角色/魔法酒狐';
import 贴图 from 'asset:贴图/角色/魔法酒狐/百花';

export const 魔法酒狐播放器版 = 定义生物({
  名: '魔法酒狐（播放器版）',
  模型,
  贴图,
  缩放: 0.65 / 16, // TLM maid_model.json 的 render_entity_scale
  动画: {
    文件: 动画,
    默认层们: [
      ...['pre_parallel0', 'pre_parallel1', 'pre_parallel2', 'pre_parallel3', 'sit'].map((名) => ({ 名 })),
      { 名: 'parallel1', 模式: '叠加' as const },
      { 名: 'parallel5', 模式: '叠加' as const },
    ],
    口径: 'TLM',
    环境: { 查询: { health: 20, max_health: 20 }, 外部: { 'ysm.has_helmet': 1, 'ysm.head_yaw': 0, 'ysm.head_pitch': 0 } },
  },
});

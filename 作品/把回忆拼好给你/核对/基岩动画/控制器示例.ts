// 控制器示例：播放器版魔法酒狐第 1 秒从坐（sit）换成站（idle），两种控制器各做一遍，主层（原来的 sit）换成控制器，其余层不变。
// GeckoLib 版：照 TLM 女仆的主控制器写法，过渡 10 刻（0.5 秒）从切换那一刻的坐姿插到 idle 第 0 刻，再从 0 开播 idle。
// 基岩版：自己写的 animation_controllers（不是 jar 里的，TLM 不用这个格式），blend_transition 0.5 秒，坐姿接着播、和 idle 交叉淡化。
// 只给核对看两种过渡长什么样；画面不对照游戏。
import { GeckoLib控制器, 基岩控制器, 解析控制器文件, type 控制器播放器 } from '@engine/anim/动画控制器.ts';
import type { 动画层设定 } from '@engine/model/基岩实体.tsx';
import { 魔法酒狐播放器版 } from './魔法酒狐播放器版.ts';

export const 换站秒 = 1;
const 动画们 = 魔法酒狐播放器版.动画文件!;

export const GeckoLib坐到站 = GeckoLib控制器({
  名: 'main',
  过渡刻: 10,
  安排: [
    { 秒: 0, 播: 'sit' },
    { 秒: 换站秒, 播: 'idle' },
  ],
  动画们,
  口径: 'TLM',
});

const 控制器文件 = {
  format_version: '1.10.0',
  animation_controllers: {
    'controller.animation.核对.坐到站': {
      initial_state: 'sit',
      states: {
        sit: { animations: ['sit'], transitions: [{ stand: `q.life_time >= ${换站秒}` }], blend_transition: 0.5 },
        stand: { animations: ['idle'] },
      },
    },
  },
};
export const 基岩坐到站 = 基岩控制器(解析控制器文件(控制器文件, 'TLM')['controller.animation.核对.坐到站']!, {
  动画们,
  环境: (秒) => ({ 查询: { life_time: 秒 } }),
  口径: 'TLM',
});

/** 默认层们里的主层（sit）换成控制器 */
export const 控制器层们 = (控: 控制器播放器): 动画层设定[] =>
  魔法酒狐播放器版.定义.动画!.默认层们.map((层) => ('名' in 层 && 层.名 === 'sit' ? { 控制器: 控 } : 层));

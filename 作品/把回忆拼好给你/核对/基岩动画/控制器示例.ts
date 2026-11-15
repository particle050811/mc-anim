// 控制器示例：播放器版魔法酒狐第 1 秒从坐（sit）换成站（idle），两种控制器各做一遍，主层（原来的 sit）换成控制器，其余层不变。
// GeckoLib 版：照 TLM 女仆的主控制器写法，过渡 10 刻（0.5 秒）从切换那一刻的坐姿插到 idle 第 0 刻，再从 0 开播 idle。
// 基岩版：自己写的 animation_controllers（不是 jar 里的，TLM 不用这个格式），blend_transition 0.5 秒，坐姿接着播、和 idle 交叉淡化。
// 只给核对看两种过渡长什么样；画面不对照游戏。
import { geckoLibController, bedrockController, parseControllerFile, type ControllerPlayer } from '@engine/anim/动画控制器.ts';
import type { AnimationLayerSetting } from '@engine/model/基岩实体.tsx';
import { MagicalWineFoxPlayer } from './魔法酒狐播放器版.ts';

export const switchStandSec = 1;
const animations = MagicalWineFoxPlayer.animationFiles!;

export const geckoLibSitToStand = geckoLibController({
  名: 'main',
  transitionTicks: 10,
  schedule: [
    { 秒: 0, clip: 'sit' },
    { 秒: switchStandSec, clip: 'idle' },
  ],
  animations,
  口径: 'TLM',
});

const controllerFile = {
  format_version: '1.10.0',
  animation_controllers: {
    'controller.animation.核对.坐到站': {
      initial_state: 'sit',
      states: {
        sit: { animations: ['sit'], transitions: [{ stand: `q.life_time >= ${switchStandSec}` }], blend_transition: 0.5 },
        stand: { animations: ['idle'] },
      },
    },
  },
};
export const bedrockSitToStand = bedrockController(parseControllerFile(controllerFile, 'TLM')['controller.animation.核对.坐到站']!, {
  animations,
  环境: (sec) => ({ query: { life_time: sec } }),
  口径: 'TLM',
});

/** 默认层们里的主层（sit）换成控制器 */
export const controllerLayers = (controller: ControllerPlayer): AnimationLayerSetting[] =>
  MagicalWineFoxPlayer.definition.动画!.defaultLayers.map((animLayer) => ('名' in animLayer && animLayer.名 === 'sit' ? { controller: controller } : animLayer));

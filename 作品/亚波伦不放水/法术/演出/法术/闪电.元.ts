// 闪电（goety:lightning_focus）的元数据。出处见 闪电.tsx。
import { 定义法术元 } from '../接口.ts';

/** 一道闪电最多闪 3 轮，每轮最多 2 + 10 刻，再加头一轮的 3 刻：不会超过 40 刻 */
export const 闪电最长刻 = 40;

export default 定义法术元({
  id: 'lightning',
  长秒: 闪电最长刻 / 20,
  命中秒: 0, // 闪电实体生成的当刻就劈
  // LightningBolt.tick 头一刻：雷声（游戏音量 10000，是为了传得远，这里不写）和劈中声（音量 2）
  声音: [
    { 资产: '音效/entity.lightning_bolt.thunder.1', 秒: 0 },
    { 资产: '音效/entity.lightning_bolt.impact.1', 秒: 0, 音量: 2 },
  ],
});

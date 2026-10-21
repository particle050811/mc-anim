// 6-4-6、6-4-7 共用的追兵声音（帧 = 追兵钟 τ × 24，各段减掉自己的起点）：落地的脚步声、振动链里的感测体咔嗒。
// 落地脚下是什么方块：工具/古城4x布局/out/核对.txt「6-4-6 追兵 / 刘心忠」「6-4-7」各跳的「落在 … 上」。声音照方块的 SoundType 取 step 事件：
//   chiseled_deepslate、deepslate_brick_slab、cracked_deepslate_bricks、deepslate_bricks → DEEPSLATE_BRICKS；cracked_deepslate_tiles → DEEPSLATE_TILES；
//   deepslate → DEEPSLATE；sculk → SCULK。polished_deepslate（POLISHED_DEEPSLATE）、polished_basalt（BASALT）的声音没导出，拿最像的 deepslate、stone 顶。
import { rng } from '../../../../engine/model/parts.tsx';
import { randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { FPS, huangRoute, liuRoute, liuStompJump, huangFollowJump, chain } from './追兵.ts';

const stepSounds = {
  bricks: 'block.deepslate_bricks.step',
  deepslateTiles: 'block.deepslate_tiles.step',
  deepslate: 'block.deepslate.step',
  sculk: 'block.sculk.step',
  stone: 'block.stone.step',
};
const huangUnderfoot = [stepSounds.bricks, stepSounds.bricks, stepSounds.deepslate, stepSounds.sculk, stepSounds.deepslate, stepSounds.bricks, stepSounds.sculk];
const liuUnderfoot = [stepSounds.deepslate, stepSounds.deepslateTiles, stepSounds.deepslate, stepSounds.stone, stepSounds.deepslate, stepSounds.bricks, stepSounds.sculk];
export const landingSounds: SoundCue[] = (() => {
  const rand = rng(6461);
  const out: SoundCue[] = [];
  huangRoute.跳们.forEach((J, i) => out.push({ 名: `黄叛落地${i + 1}`, 事件: huangUnderfoot[i], 帧: J.f1, 位置: J.p1, 音量: 0.15, 音高: 1, 选: rand() }));
  liuRoute.跳们.forEach((J, i) => out.push({ 名: `刘心忠落地${i + 1}`, 事件: liuUnderfoot[i], 帧: J.f1, 位置: J.p1, 音量: 0.15, 音高: 1, 选: rand() }));
  out.push({ 名: '刘心忠踩幽匿块', 事件: stepSounds.sculk, 帧: liuStompJump.f1, 位置: liuStompJump.p1, 音量: 0.15, 音高: 1, 选: 0.5096602365374565 });
  out.push({ 名: '黄叛跟跳落地', 事件: stepSounds.sculk, 帧: huangFollowJump.f1, 位置: huangFollowJump.p1, 音量: 0.15, 音高: 1, 选: rand() });
  return out;
})();
// 感测体激活那一刻一声咔嗒（SculkSensorBlock.activate：volume 1、pitch 0.8 + r × 0.2），声源在感测体正中心
export const clickSounds: SoundCue[] = (() => {
  const rand = rng(6462);
  return chain.vibrations
    .filter((v) => v.收.startsWith('感测体'))
    .map((v) => ({ 名: `咔嗒 ${v.收}`, 事件: 'block.sculk_sensor.clicking', 帧: v.到 * FPS, 位置: v.to, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() }));
})();

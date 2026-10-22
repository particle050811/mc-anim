// 娜迦庭院里人踩的方块，给脚步挑 <方块>.step 用（6-1-2、6-1-3 的 声音.tsx）。游戏里脚步放的是脚下那块的 SoundType。
// 庭院中心空地是 2×2 一组的蚀刻娜迦石（组间隔一行草），迷宫水池南边通道是石砖，都是石头声，不是草声。
// `blockMap` 是片场存档里游戏 y = 4 那一层（人站的那层），一行一个游戏 z（从 `Z0` 起往南），一个字一个游戏 x（从 `X0` 起往东）：
// s = 石头类（石砖、蚀刻娜迦石等，SoundType.STONE）；g = 草方块；# = 上面有东西、. = 这层是空的（人踩不到，按草算）。图外都是草。
// 坐标：庭院本地坐标（同 娜迦庭院.tsx），游戏 x = x + 264.5，游戏 z = 488.5 − y。
const X0 = 238;
const Z0 = 484;
const blockMap = [
  'ssgssgss.............ssssssssssssssgssg', // z 484
  'ggggggss.............ssggggggggggg#gggg', // z 485
  'ggggggs#s#...........ssgssgssgssgssgggg', // z 486
  'g###ggs#s#...........ssgssgssgssgssgg##', // z 487
  'g###ggs###...........ssgggggggggggggg##', // z 488
  'g###ggs#s#...........ssgssgssgssgssgg##', // z 489
  'g###ggs#s#...........ssgssgssgssgssgg##', // z 490
  'g###ggss.............ssgggggggggggggg##', // z 491
  'g###g#ss.............ssgssgssgssgssgg##', // z 492
  'g###ggss.............s##ssgssgssgssgg##', // z 493
  'g###ggss.............ssgggggggggggggg##', // z 494
  'g###ggsssssssssssssssssgssgssgssgssgg##', // z 495
  'g###ggsssssssssssssssssgssgssgssgssgg##', // z 496
  'g###ggggggggggggggggggg#gggggg#gggggg##', // z 497
  'g###ggggggggggggggssgssgggggg#ssgssgg##', // z 498
  'g###############ggssgssgg###ggssgssgg##', // z 499
  'g###############g#ggggggg###ggggggggg##', // z 500
];

export const stepSound = (pos: readonly number[]): 'block.stone.step' | 'block.grass.step' => {
  const x = Math.floor(pos[0] + 264.5) - X0;
  const z = Math.floor(488.5 - pos[1]) - Z0;
  return blockMap[z]?.[x] === 's' ? 'block.stone.step' : 'block.grass.step';
};

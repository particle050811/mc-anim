// 段框架示范（docs/新段.md）：3 秒，一发烟花。段键不写在这里（只在目录名和清单里），帧数、fps、画幅由时间线推；
// 每个声音只在这里写一次，时长、峰值来自 anim cues 生成的 声音表，画面.tsx 不 import 声音字节。
import { 窗口段 } from '@engine/段/窗口段.ts';
import 线 from './时间线.ts';
import 声音表 from './声音表.生成.ts';

export default 窗口段(线, {
  起: '开场',
  止: '收尾',
  声音表,
  声音: ({ 放, 事件 }) => [
    放('音效/把回忆拼好给你/entity.firework_rocket.launch', 事件.发射, -14),
    放('音效/把回忆拼好给你/entity.firework_rocket.large_blast', 事件.炸开, -8),
    放('音效/把回忆拼好给你/entity.firework_rocket.twinkle', 事件.噼啪, { 峰值: -18, 名: '火星' }),
    // 私有配乐：不打进包，按 id 现取，数据根里没有就是静音
    放('配乐/把回忆拼好给你-抖音原声', 0, { 入点秒: 31.26, 增益: 0.5, 名: '原声', 淡出: 12 }),
  ],
});

// 段框架示范的时间线：一发烟花从发射到炸开、噼啪，画面外远处又炸一发，响声从 核对-段框架示范 拖进 核对-段框架示范续（场声音，写一次，两段各放落进来的那截）。
// 正片的段这张表放 场/<场键>/时间线.ts，同一场的几段共用；核对段没有场，就放在头一段的目录里，后一段引过去。
import { defineSceneTimeline } from '@engine/段/窗口段.ts';

export default defineSceneTimeline({
  scene: '核对',
  events: {
    opening: { 在: { sec: 0 } },
    launch: { 在: { sec: 0.4 }, basis: '示范：开场停一下再发射' },
    burst: { 在: { after: 'launch', addSec: 1.1 }, basis: '示范：火箭飞 1.1 秒炸开' },
    crackle: { 在: { after: 'burst', addSec: 0.3 }, basis: '示范：炸开以后火星噼啪' },
    distantBurst: { 在: { sec: 2.6 }, basis: '示范：切镜前 0.4 秒远处又炸一发，响到下一段' },
    wrapUp: { 在: { sec: 3 } },
    tailExtend: { 在: { after: 'wrapUp', addSec: 1.5 } },
  },
  sound: [{ asset: '音效/把回忆拼好给你/entity.firework_rocket.blast', name: '远处一发', 在: 'distantBurst', peakDb: -16 }],
});

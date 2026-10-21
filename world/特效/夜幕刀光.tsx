// 夜幕刀光：史诗战斗「夜幕」（EpicFight Nightfall 3.4.0，CurseForge 1307848，jar 在 game/缓存/mods/）阎魔刀挥刀的刀光拖尾、命中特效和泛光，
// 照 jar 和 Epic Fight 源码逐项搬（用户 10-10：拔刀剑的刀光太廉价）。贴图 npm run 取材 -- 夜幕刀光，血滴的 drip_hang 在 粒子.贴图 里（npm run 取材 -- 粒子贴图）。
//
// 各部分在 夜幕刀光/ 下：刀光拖尾、命中、招架、泛光（照哪个类、怎么算写在各自文件头），共用的贴图、材质在 共用.tsx；这里只转出。
//
// 用法（镜头里）：ThreeCanvas 里挂 <夜幕泛光 />（画布上已有 <屏幕AO /> 接管渲染时传 自己画场景={false}，它在 AO 之后接着画）；
//   <刀光拖尾 刃={秒 => ({ 根, 尖 })} 起={秒} 止={秒} 秒={当前秒} />，刃 给出任意剧情秒时刀上两点的场景坐标；
//   <夜幕命中 脚底={V3} 宽 高 秒={命中后的秒} 种子 />；<夜幕招架 位置={V3} 秒={招架后的秒} 种子 />。6-1-2（斩娜迦）、6-4-3（挡箭）在用。
export { bloomLayer } from './夜幕刀光/共用.tsx';
export { BladeTrail, liYingTrailPts, trailEdges, yamato, type BladePos } from './夜幕刀光/刀光拖尾.tsx';
export { NightfallHit } from './夜幕刀光/命中.tsx';
export { NightfallParry } from './夜幕刀光/招架.tsx';
export { NightfallBloom } from './夜幕刀光/泛光.tsx';

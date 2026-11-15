// 段框架示范的下一段：同一条时间线上 [收尾, 续尾)。自己不写声音，远处那一发的后半截是场时间线上的场声音，窗口段自动接上（docs/新段.md「跨段的声音」）。
import { windowSeg } from '@engine/段/窗口段.ts';
import timeline from '../段框架示范/时间线.ts';
import soundTable from './声音表.生成.ts';

export default windowSeg(timeline, { 起: 'wrapUp', 止: 'tailExtend', soundTable });

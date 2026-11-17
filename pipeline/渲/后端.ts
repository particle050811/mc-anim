// 渲染后端：编排代码（出片/渲段、试看出片、静帧、bench、batch、逐帧校验、认指纹、接触表）碰打包、浏览器、Remotion、闸、材质包选用都经这一个对象，
// 默认是真的（realBackend），作为参数传进去；测试传假的（出片/渲段.test.ts 等），不用一个个 vi.mock 渲染栈的模块。
// 只放「换掉就不用真渲」的那几样；段产物（指纹、路径）、地形注入、运行记录这些照旧直接引。
import { getCompositions, renderFrames, renderMedia, renderStill } from './渲染器.ts';
import { launchBrowser, openSession } from './会话.ts';
import { gateHeartbeat, openGateBatch, passGate, passRenderGate } from '../闸/闸.ts';
import { perGroupWithResourcePacks, withSegResourcePack } from '../资产/资产锁.ts';

export type RenderBackend = {
  /** 打包、开浏览器、读 Composition 列表，fn 跑完关浏览器、删包（会话.ts） */
  openSession: typeof openSession;
  /** 只开浏览器、不打包 */
  launchBrowser: typeof launchBrowser;
  /** 读 Composition 列表（会话外：batch 用预先打好的包） */
  readCompositions: typeof getCompositions;
  /** 出片（切片、试看片、bench）：边渲边编 */
  renderMedia: typeof renderMedia;
  /** 出一张静帧（逐帧出：每帧一个新页面） */
  renderStill: typeof renderStill;
  /** 同一页面连出几帧的 PNG，不编码（连出静帧、逐帧校验、认指纹、batch） */
  renderFrames: typeof renderFrames;
  /** 渲染闸：一张票（任务种、低优先、needsLoad、loadLimit 写在第四个参数） */
  passRenderGate: typeof passRenderGate;
  /** 放行闸（不占渲染锁的重活：解码比对） */
  passGate: typeof passGate;
  /** 批：一项一项过渲染闸，按持锁时间、指令让路 */
  openGateBatch: typeof openGateBatch;
  /** 批项里报进度 */
  gateHeartbeat: typeof gateHeartbeat;
  /** 按段的材质包选用分组，一组一个打包 */
  perResourcePackGroup: typeof perGroupWithResourcePacks;
  /** 在这一段的材质包选用里跑 */
  withSegResourcePack: typeof withSegResourcePack;
};

export const realBackend: RenderBackend = {
  openSession,
  launchBrowser,
  readCompositions: getCompositions,
  renderMedia,
  renderStill,
  renderFrames,
  passRenderGate,
  passGate,
  openGateBatch,
  gateHeartbeat,
  perResourcePackGroup: perGroupWithResourcePacks,
  withSegResourcePack,
};

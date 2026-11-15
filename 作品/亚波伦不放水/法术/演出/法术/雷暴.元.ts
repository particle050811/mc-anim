// 雷暴（goety:thunderstorm_focus）的元数据。出处见 雷暴.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 举杖 20 刻后才开始放预警 */
export const stormStartTick = 20;
/** 前 20 刻（20～39）落在目标四周，之后落在施法者四周；片里只放到第 49 刻（游戏里引导多久放多久，自己定的截短） */
export const stormEndTick = 50;
/** 预警圈出现到落雷：duration 40 刻 */
export const stormWarnTicks = 40;
/** 下界魔杖是 rightStaff：每刻放 2 处 */
export const thunderPerTick = 2;

export interface ThunderSpot {
  /** 预警圈出现的刻 */
  生: number;
  /** 以目标为中心（否则以施法者），偏移是游戏格子数，nextInt(-16,16) */
  nearTarget: boolean;
  offsetX: number;
  offsetZ: number;
}

/** 纯函数，声音和画面共用 */
export const strikePoints = (seed: number): ThunderSpot[] => {
  let x = (seed * 2654435761) >>> 0;
  const rand = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const randomOffset = () => Math.floor(rand() * 32) - 16;
  const strikes: ThunderSpot[] = [];
  for (let t = stormStartTick; t < stormEndTick; t++) for (let i = 0; i < thunderPerTick; i++) strikes.push({ 生: t, nearTarget: t < 40, offsetX: randomOffset(), offsetZ: randomOffset() });
  return strikes;
};

export default defineSpellMeta({
  id: 'thunderstorm',
  长秒: (stormEndTick + stormWarnTicks + 15) / 20,
  hitSec: (stormStartTick + stormWarnTicks) / 20,
  // 每处落雷放一次 thunder_strike_fast（按种子 1 的落点排，只排前 12 处免得声音糊成一片）
  声音: strikePoints(1)
    .slice(0, 12)
    .map((p) => ({ 资产: '音效/诡厄巫法/goety.thunder_strike_fast.1', 秒: (p.生 + stormWarnTicks) / 20, 音量: 0.6 })),
});

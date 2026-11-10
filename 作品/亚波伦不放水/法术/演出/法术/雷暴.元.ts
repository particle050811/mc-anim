// 雷暴（goety:thunderstorm_focus）的元数据。出处见 雷暴.tsx。
import { 定义法术元 } from '../接口.ts';

/** 举杖 20 刻后才开始放预警 */
export const 雷暴起刻 = 20;
/** 前 20 刻（20～39）落在目标四周，之后落在施法者四周；片里只放到第 49 刻（游戏里引导多久放多久，自己定的截短） */
export const 雷暴止刻 = 50;
/** 预警圈出现到落雷：duration 40 刻 */
export const 雷暴预警刻 = 40;
/** 下界魔杖是 rightStaff：每刻放 2 处 */
export const 雷暴每刻处数 = 2;

export interface 雷暴落点 {
  /** 预警圈出现的刻 */
  生: number;
  /** 以目标为中心（否则以施法者），偏移是游戏格子数，nextInt(-16,16) */
  近目标: boolean;
  偏x: number;
  偏z: number;
}

/** 纯函数，声音和画面共用 */
export const 雷暴落点们 = (种子: number): 雷暴落点[] => {
  let x = (种子 * 2654435761) >>> 0;
  const 抽 = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const 偏 = () => Math.floor(抽() * 32) - 16;
  const 们: 雷暴落点[] = [];
  for (let t = 雷暴起刻; t < 雷暴止刻; t++) for (let i = 0; i < 雷暴每刻处数; i++) 们.push({ 生: t, 近目标: t < 40, 偏x: 偏(), 偏z: 偏() });
  return 们;
};

export default 定义法术元({
  id: 'thunderstorm',
  长秒: (雷暴止刻 + 雷暴预警刻 + 15) / 20,
  命中秒: (雷暴起刻 + 雷暴预警刻) / 20,
  // 每处落雷放一次 thunder_strike_fast（按种子 1 的落点排，只排前 12 处免得声音糊成一片）
  声音: 雷暴落点们(1)
    .slice(0, 12)
    .map((p) => ({ 资产: '音效/诡厄巫法/goety.thunder_strike_fast.1', 秒: (p.生 + 雷暴预警刻) / 20, 音量: 0.6 })),
});

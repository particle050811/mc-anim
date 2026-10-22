// 第 7 章第 3 场「墙头追逐」三段（7-3-1～7-3-3）共用的地理和衔接常量（纯数据）。坐标同第六章古城和第 1 场：场景 (x, y, z) = (游戏 x + 720, 240 − 游戏 z, 游戏 y + 50)，
// Z 朝上、北 = +Y、1 = 一格。点位全从 ../古城4x布局.ts 取（scene73，核对见 工具/古城4x布局/核对.py 的「7-3」）：
// 地点：场子北墙（东西大道的城墙）的墙头、墙上的塔、墙外大道。路线和快慢见 追逐.ts。
// 7-3-3 → 7-4-1 硬切：马顺大道回城心、监守者穿大殿上西环道、黄叛跳到传送门顶那几秒不演（布局的 backToCityCenter）。
import type { V3 } from '@engine/model/parts.tsx';
import { handoffs, scene71, scene73, footOf } from '../布局.ts';

export const FPS = 24;

// ---------- 接 7-1-7 末帧（契约：古城4x布局.ts 的 衔接.七三首；第 1 场改了数，这里跟着变） ----------
export const handoff = handoffs.七三首;
export const horseStart: V3 = handoff.马; // 北墙头、朝北站着
export const wardenStart: V3 = handoff.监守者; // 墙脚下
export const huangPanStart: V3 = handoff.黄叛; // 黄叛高台（中央台北沿）

export const wallTopEast: V3 = scene73.墙头东;
export const towerTop: V3 = scene73.塔顶;
export const avenue: V3 = scene73.大道;
// 黄叛射完那一箭就往东跳走（去 7-4-1 的传送门顶），第一跳落在场子东墙脊（7-1 刘心忠站过的那条）
export const huangPanExit: V3 = footOf(scene71.东墙脊);

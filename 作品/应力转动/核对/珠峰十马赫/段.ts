// 核对-珠峰十马赫：10 马赫（3430 米/秒，一帧 57 米）飞过珠峰，看地形管线在这个速度、这个高度（地面 5000～8749，镜头最高 10280）下的画面和性能：
// 高空俯冲 → 贴着绒布河谷的冰面 → 爬过北壁、从峰顶上空掠过（航线.ts）。地形是外来存档「real world」的 DH LOD 库烘的包 珠峰-真实地球-DH
//（sourcing/worlds/珠峰-真实地球.toml，各处最细到哪一级不一样：河谷和峰顶 1 米，远处 64 米）。
// 放在应力转动：用的是这部作品的飞行镜头、天空和航线定级默认值（地点/飞行镜头.tsx、默认.ts 的 FLIGHT_ROUTE_LOD），要核的就是这一套。没有声音。
import { checkSeg } from '@engine/段/核对段.ts';
import { flightSec, packName } from './航线.ts';

export default checkSeg({ sec: flightSec, terrain: [packName] });

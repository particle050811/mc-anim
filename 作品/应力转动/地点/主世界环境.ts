// 主世界统一的那套（主世界光照.tsx 的 SUN_OW、OverworldSky，飞行镜头.tsx 的 FlightSky、FlightFog）写成环境描述，给新段用：
// <环境 描述={主世界环境({ 能见度, 投影远 })} 镜头={cam.pos} 离地={…} /> 和 <FlightFog visibility /> + <FlightSky camPos shadow={{ shadowFar, aboveGround }} /> 出一样的画面
// （核对/环境/ 逐像素比过）。坐标是主世界-116 的场景坐标。
import { 定义环境, 光向转向量, 天角转时刻, type 环境描述 } from '@engine/light/环境.ts';
import { 主世界 } from '@engine/light/维度.ts';
import { SUN_OW } from './主世界光照.tsx';
import { borderTownPos } from './主世界116.ts';

// 同 主世界光照.tsx 的 fallCloud、townClear、seaY（那边没导出；改那个文件会让用到它的段过期，所以照抄，核对/环境/ 比着）
const fallCloud = [borderTownPos[0], borderTownPos[1] + 110, 150] as const;
const townClear = [borderTownPos[0], borderTownPos[1], 350, 150] as const;
const seaY = 63 - 64;

/** 能见度：同 FlightFog 的 visibility（米）；投影远：同 FlightSky 的 shadow.shadowFar（不给 = 不投影，离地给 <环境 离地>）；photon：false = 不开大气和云（钻到地下时，同 FlightSky 的 photon） */
export const 主世界环境 = (o: { 能见度: number; 投影远?: number; photon?: boolean }): 环境描述 =>
  定义环境(
    {
      维度: 主世界,
      画法: '主世界',
      太阳: SUN_OW,
      灯光: { 档位: '主世界' },
      雾: { 种类: '指数平方', 能见度: o.能见度 },
      大气远: o.photon === false ? null : 40000,
      云: o.photon === false ? { 种类: '无' } : { 种类: 'photon', 海平面: seaY, 加: [fallCloud], 让开: townClear },
      投影: o.投影远 === undefined ? false : { 远: o.投影远 },
    },
    '主世界环境',
  );

/** SUN_OW（正西、仰角 20°）正好在原版的太阳轨道上（南北分量 0），换成游戏时间约 11510 刻（下午五点半上下）。
 *  新段写 时刻: SUN_OW时刻 得到同一个太阳方向，但灯按时刻调（天光约 × 0.91），不和美术光向那版逐像素一样 */
export const SUN_OW时刻 = (() => {
  const d = 光向转向量(SUN_OW);
  return 天角转时刻(Math.atan2(-d[0], d[2]) / (2 * Math.PI));
})();

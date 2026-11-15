// anim still 的 --望远：照原镜头只把原帧里的一个矩形用整张画布原生渲出来（docs/望远.md，用户 11-15 定做）。
// 同 --光影 的做法：只在 still 的包里把 engine/core/望远.ts 加进入口，矩形经页面环境变量传；段的闭包、inputProps、打包规则都不动，不进指纹，
// film 不认，切片不会混进望远的画面。入口多一项，webpack 缓存目录另起一个（Remotion 按整份配置算缓存名），不和平时的包互相冲。
import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';
import { 代码根 } from '../环境/路径.ts';

/** 页面读的环境变量名（engine/core/望远.ts 里同一个名字） */
export const 望远环境名 = 'REMOTION_ANIM_TELE';

const 望远入口 = () => path.join(代码根(), 'engine', 'core', '望远.ts');

/** 套在 webpack改写 外面：望远入口排在作品入口前面（它先 import 设置，再改细分门槛、接管镜头，段模块求值时已经改好） */
export const 套望远 =
  (改写: WebpackOverrideFn, 作品入口: string): WebpackOverrideFn =>
  async (config) => {
    const c = await 改写(config);
    const 入口 = c.entry;
    const i = Array.isArray(入口) ? 入口.indexOf(作品入口) : -1;
    if (i < 0) throw new Error('望远：webpack 入口里找不到作品入口（Remotion 的入口排法变了？）');
    return { ...c, entry: [...(入口 as string[]).slice(0, i), 望远入口(), ...(入口 as string[]).slice(i)] };
  };

/** x、y、宽、高：矩形在原帧上的像素（左上角起）；倍 = 全宽 ÷ 宽；名：文件名后缀；值：给页面的 JSON */
export type 望远配置 = { x: number; y: number; 宽: number; 高: number; 倍: number; 细一级: boolean; 真值: boolean; 名: string; 值: string };
/** 细一级：远处强制用更细的一级；真值：着色器里按像素大小做的远处简化照望远后的像素算（engine/core/望远.ts）。开了哪个，出来的都不再是原帧那块的放大 */
export type 望远开关 = { 细一级?: boolean; 真值?: boolean };

const 数 = (s: string, 名: string) => {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`--望远 的${名}要是数：${s}`);
  return v;
};

/**
 * --望远 的值，分号隔开的几块，每块是：
 *   x,y,宽        矩形左上角和宽（原帧像素，高按原帧宽高比）
 *   心x,心y,<n>x  矩形中心和放大倍数（如 1920,760,8x）
 * 后面还能跟「,细一级」「,真值」只给这一块开（同一次里同一块出两份对着看）；开 里的对每一块都开。
 * 矩形要整个落在原帧里。全宽、全高是这一级别出图的像素（视频级 4K 是 3840×2160）
 */
export const 解析望远 = (v: string, [全宽, 全高]: readonly [number, number], 开: 望远开关 = {}): 望远配置[] =>
  v
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [...项] = s.split(',').map((t) => t.trim());
      const 单开 = 项.splice(3);
      if (项.length !== 3 || 单开.some((t) => t !== '细一级' && t !== '真值')) throw new Error(`--望远 要写成 x,y,宽 或 心x,心y,<倍>x（后面可跟 ,细一级 ,真值）：${s}`);
      const 细一级 = !!开.细一级 || 单开.includes('细一级');
      const 真值 = !!开.真值 || 单开.includes('真值');
      const 按倍 = /^([0-9.]+)[x倍]$/i.exec(项[2]!);
      let x: number, y: number, 宽: number;
      if (按倍) {
        const 倍 = 数(按倍[1]!, '倍数');
        if (!(倍 >= 1)) throw new Error(`--望远 的倍数不能小于 1：${s}`);
        宽 = 全宽 / 倍;
        x = 数(项[0]!, '中心 x') - 宽 / 2;
        y = 数(项[1]!, '中心 y') - (宽 * 全高) / 全宽 / 2;
      } else {
        x = 数(项[0]!, ' x');
        y = 数(项[1]!, ' y');
        宽 = 数(项[2]!, '宽');
      }
      const 高 = (宽 * 全高) / 全宽;
      if (!(宽 >= 1)) throw new Error(`--望远 的宽至少 1 个像素：${s}`);
      if (x < -1e-6 || y < -1e-6 || x + 宽 > 全宽 + 1e-6 || y + 高 > 全高 + 1e-6) {
        throw new Error(`--望远 的矩形（左上 ${x},${y}，${宽}×${高}）超出原帧 ${全宽}×${全高}：${s}`);
      }
      const 整 = (n: number) => String(Math.round(n * 100) / 100);
      return {
        x, y, 宽, 高, 倍: 全宽 / 宽, 细一级, 真值,
        名: `x${整(x)}-y${整(y)}-宽${整(宽)}${细一级 ? '-细一级' : ''}${真值 ? '-真值' : ''}`,
        值: JSON.stringify({ 左: x / 全宽, 上: y / 全高, 占: 宽 / 全宽, 细一级, 真值 }),
      };
    });

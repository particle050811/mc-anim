// Remotion 自带的 ffmpeg：切片就是它压的（PNG 帧 → bt709 zscale → x264）。brew 的没编 zscale，要照切片编码时一样转色只能用它。
// 它裁过：没有 lavfi、没有 rawvideo 封装（raw 帧经 image2pipe 出），解 PNG/JPEG 要点明解码器。
import { RenderInternals } from './渲染器.ts';

/** 给了 输入 从 stdin 喂，返回 stdout 原始字节；退出码非 0 抛 */
export const 跑自带ffmpeg = async (args: string[], 输入?: Buffer): Promise<Buffer> => {
  const r = await RenderInternals.callFf({
    bin: 'ffmpeg',
    args,
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
    // encoding 给 null 才回 Buffer（execa 5 照这个分），它的类型没写 null
    options: { ...(输入 ? { input: 输入 } : {}), encoding: null as unknown as undefined, maxBuffer: 2 ** 32 },
  });
  return r.stdout as unknown as Buffer;
};

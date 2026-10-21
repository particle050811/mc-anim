// 叠到成片上的透明层（照旧项目 工具/合成第六章/透明层.py）：段声明的叠层（视频，帧号和那段段内帧对齐）在下，字幕卡（一屏一张 PNG）在上。
// 静图用 loop 滤镜重复 帧数 帧（只解一次码），视频 trim 出那几帧；都 setpts 挪到全片第 起帧 帧，overlay 用 eof_action=pass（没开始、叠完的帧原样透过去）。
export type 叠加层 = {
  文件: string;
  /** 全片第几帧开始叠 */
  起帧: number;
  帧数: number;
  x: number;
  y: number;
  静图: boolean;
  /** 视频层从自己的第几帧取 */
  取自帧: number;
};

/** 段叠层 → 全片上的一截：层的第 f 帧叠在段内第 f 帧上；层比段短就只叠前面那几帧 */
export const 展开段叠层 = (文件: string, 层帧数: number, 段帧数: number, 段全片起帧: number): 叠加层 => ({
  文件,
  起帧: 段全片起帧,
  帧数: Math.min(层帧数, 段帧数),
  x: 0,
  y: 0,
  静图: false,
  取自帧: 0,
});

/** ffmpeg 输入参数和 filter_complex 片段：从 基 标签起一层层 overlay；返回 [输入, 滤镜, 最后的标签] */
export const 叠层滤镜 = (层们: 叠加层[], 首个输入号: number, 基: string, fps: number): [string[], string, string] => {
  const 输入: string[] = [];
  const 段: string[] = [];
  let 当前 = 基;
  层们.forEach((l, i) => {
    const k = 首个输入号 + i;
    let 源: string;
    if (l.静图) {
      输入.push('-framerate', String(fps), '-i', l.文件);
      源 = `[${k}:v]format=rgba,loop=loop=${l.帧数 - 1}:size=1:start=0`;
    } else {
      输入.push('-i', l.文件);
      源 = `[${k}:v]trim=start_frame=${l.取自帧}:end_frame=${l.取自帧 + l.帧数}`;
    }
    段.push(`${源},setpts=N/(${fps}*TB)+${l.起帧}/(${fps}*TB)[l${i}]`);
    段.push(`[${当前}][l${i}]overlay=x=${l.x}:y=${l.y}:eof_action=pass[o${i}]`);
    当前 = `o${i}`;
  });
  return [输入, 段.join(';'), 当前];
};

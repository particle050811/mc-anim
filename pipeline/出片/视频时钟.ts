import { config } from '../环境/配置.ts';
import { lowPriority, runCapture } from '../环境/子进程.ts';

export const packetClockArgs = (fps: number): string[] => {
  const ticks = fps * 1000;
  const prescale = /\bprescale\b/.test(runCapture([config('ffmpeg'), '-hide_banner', '-h', 'bsf=setts']));
  const snap = (field: string) => prescale ? `round(${field}/1000)*1000` : `round(${field}*TB*${fps})/(${fps}*TB)`;
  // 按各自原时间量化 PTS、DTS；不能按包序号重排，H.264 的 B 帧解码顺序不是显示顺序。
  const filter = `setts=${prescale ? `prescale=1:time_base=1/${ticks}:` : ''}pts=${snap('PTS')}:dts=${snap('DTS')}:duration=${prescale ? '1000' : `1/(${fps}*TB)`}`;
  return ['-bsf:v', filter, '-video_track_timescale', String(ticks)];
};

export const checkFilmClock = (file: string, fps: number, frames: number) => {
  const packets = runCapture(lowPriority([config('ffprobe'), '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file])).trim().split(/\r?\n/);
  const times = packets.map(packet => Number(packet.trim() || NaN)).sort((first, second) => first - second);
  if (times.length !== frames) throw Error(`成片有 ${times.length} 个画面包，应有 ${frames} 个`);
  for (const [frame, time] of times.entries()) {
    if (!Number.isFinite(time) || Math.abs(time - frame / fps) > 0.0011 || frame > 0 && time <= times[frame - 1]!) throw Error(`成片显示时钟 F${frame}：${time} 秒，应为 ${frame / fps} 秒`);
  }
};

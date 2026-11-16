// ffprobe 读数：视频帧数（按包数，不信容器里写的时长）、宽高、时长。
import { config } from '../环境/配置.ts';
import { runCapture } from '../环境/子进程.ts';

export const videoInfo = (file: string) => {
  const out = runCapture([config('ffprobe'), '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets,width,height', '-of', 'json', file]);
  const s = JSON.parse(out).streams[0] as { nb_read_packets: string; width: number; height: number };
  return { frameCount: Number(s.nb_read_packets), width: s.width, height: s.height };
};

export const hasAudioTrack = (file: string) =>
  runCapture([config('ffprobe'), '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).trim() !== '';

export const probeDurationSec = (file: string) => Number(runCapture([config('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

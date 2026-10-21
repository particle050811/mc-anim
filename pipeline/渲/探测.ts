// ffprobe 读数：视频帧数（按包数，不信容器里写的时长）、宽高、时长。
import { 配置 } from '../环境/配置.ts';
import { 跑出 } from '../环境/子进程.ts';

export const 视频信息 = (file: string) => {
  const out = 跑出([配置('ffprobe'), '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets,width,height', '-of', 'json', file]);
  const s = JSON.parse(out).streams[0] as { nb_read_packets: string; width: number; height: number };
  return { 帧数: Number(s.nb_read_packets), 宽: s.width, 高: s.height };
};

export const 有音轨 = (file: string) =>
  跑出([配置('ffprobe'), '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).trim() !== '';

export const 时长秒 = (file: string) => Number(跑出([配置('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

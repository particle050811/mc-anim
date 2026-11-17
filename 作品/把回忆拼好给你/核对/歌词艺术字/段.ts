// 歌词艺术字核对：符文拼字的飞来中、落定闪、拼齐 × 亮天空、门口、夜，五个关键词的几个时刻，第 15 句放底部，一秒一个视图（视图.ts）。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });

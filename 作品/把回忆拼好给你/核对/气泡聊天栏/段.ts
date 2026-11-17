// 女仆气泡和像素聊天栏的核对：按视图表一秒一个视图出静帧，看气泡的九宫格、尾巴、颜文字（组合附加符号）、两种缩放下的像素对齐，和聊天栏几种颜色、淡出。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });

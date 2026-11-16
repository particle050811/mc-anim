// 现实课桌核对：一秒一个视图，看第 13 句分屏现实那半（右屏）的课桌、倒计时日历和飞纸、墙上整张课表（作品/把回忆拼好给你/现实/，MC 方块和像素物件）。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });

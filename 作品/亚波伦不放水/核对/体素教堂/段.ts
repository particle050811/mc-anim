// 核对-体素教堂：粉色教堂地上结构不开游戏、照本作品的附加方块表一格一格拼出来（方块拼搭），看模组方块进表后画得对不对。一秒一个视图（视图.ts）。没有声音。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });

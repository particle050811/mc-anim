// 灰底正面、教堂跳舞位各走完整舞谱；两种机位的同一姿势相隔 halfSec。没有配乐。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, halfSec } from './视图.ts';

export default checkSeg({ sec: halfSec * 2, aspect });

// 核对-法术演出：法术/演出/ 里每个已注册的法术自动占一槽（槽长、机位见 视图.ts），灰底，起点在左上空中，目标是站在地上的史蒂夫。
// 加了法术不用改这个段：段长照 元表 的条数算。没有声音。
import { checkSeg } from '@engine/段/核对段.ts';
import { spellMetas } from '../../法术/演出/元表.ts';
import { aspect, slotSec } from './视图.ts';

export default checkSeg({ sec: spellMetas.length * slotSec, aspect });

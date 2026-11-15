// 史蒂夫反应核对：中性底上摆本片的史蒂夫（角色/反应史蒂夫.tsx），一秒一个视图：戒备、仰头看、举盾、拉弓射箭、挣扎、挨打、不死图腾、死亡和掉落、挥剑。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });

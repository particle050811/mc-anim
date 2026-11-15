// 史蒂夫装备核对：中性底上摆本片的史蒂夫（角色/史蒂夫装备.tsx：附魔神灵金全套、断曜流光、晋升之环，用户 11-10 定；神灵金套和剑默认旧版外观，另留两张新版对照），一秒一个视图，看外形、附魔光泽、握剑和光环的位置。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });

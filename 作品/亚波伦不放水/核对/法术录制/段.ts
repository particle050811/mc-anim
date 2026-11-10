// 核对-法术录制：录过的法术（sourcing/extract.录制.toml）和手写演出并排比，看录制回放像不像（docs/决策/0016-法术录制.md）。槽法、三格见 视图.ts。没有声音。
import { 定义段 } from '@engine/段/段定义.ts';
import { 槽数, 每槽秒, 画幅 } from './视图.ts';

export default 定义段({ 场: '核对', 秒: 槽数 * 每槽秒, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });

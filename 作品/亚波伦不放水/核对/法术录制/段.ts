// 核对-法术录制：录过的法术（sourcing/extract.录制.toml）和手写演出并排比，看录制回放像不像（docs/决策/0016-法术录制.md）。槽法、三格见 视图.ts。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { slotCount, slotSec, aspect } from './视图.ts';

export default defineSeg({ scene: '核对', sec: slotCount * slotSec, width: aspect.width, height: aspect.height, terrain: [] });

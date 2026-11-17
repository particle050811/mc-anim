// 晋升之环核对：原版贴片和本片自制的三个候选（特效/晋升之环.tsx），并排、单看和特写、戴在娘化亚波伦和史蒂夫头后、中景里的样子。一秒一个视图。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });

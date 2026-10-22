// 本作品的口型：口型表、台词表交给 world/角色/口型.ts 的 做口型 绑好。只引这两份表、不引台词轨和配音 wav，编排.ts 这种纯函数文件也能用，
// 改一句配音不会让只动嘴的段跟着过期。
import mouthTable from 'asset:数据/配音/口型';
import lineTable from 'asset:数据/配音/台词表';
import { 做口型 } from '../角色/口型.ts';

export const { mouthAt, withTalkNod } = 做口型(mouthTable, lineTable);
export { CLOSED, MOUTH_SHAPES, type Mouth } from '../角色/口型.ts';

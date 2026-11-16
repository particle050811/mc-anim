// 门口哈气核对的画面：成片里第 8 句 27.80 那一帧（场/2-门口 的 门口画布 + 哈气角色、哈气气泡；摆法、调子见 场/2-门口/第8句.ts），按视图表换一项。
// 门开着（她站在门洞里），后墙照片墙四张都挂上了（她刚把光柱破云挂进最后一只框），屋后开着远景和头顶那层云，不画太阳；还没种树、没插牌子（第 9 句才种）。
// 不写视图名：静帧就是成片的样子。
// 时刻取歌曲帧 正片事件.哈气.帧（片子里真有的那一帧），颗粒的种子取它（同成片）。这一拍三个角色都定住，不按时间取样。
import React from 'react';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { events as mainCutEvents } from '../../分镜/正片第8句.ts';
import { photoWallCells } from '../../地点/照片墙.tsx';
import { PuffCharacter, PuffBubble } from '../../场/2-门口/哈气.tsx';
import { framing as n6Framing } from '../../场/2-门口/参数.ts';
import { DoorCanvas } from '../../场/2-门口/门口.tsx';
import { line8Tone, line8Shot } from '../../场/2-门口/第8句.ts';
import { line8Cloud } from '../../场/2-门口/第8句云.ts';
import { line8Photos } from '../../特效/照片画.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const frame = mainCutEvents.hiss.frame;
const photoWall = photoWallCells(line8Photos);

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  // N = 6 不是 4 的倍数：地图画按 32 格画（特效/地图画.ts），天、太阳用 门口画布 的默认
  const shot = v.N6 ? { framing: n6Framing, photoWallEdge: 32 as const } : { ...line8Shot, photoWallEdge: 64 as const, arc: null };
  return (
    <FilmPost grade={v.withPost ? line8Tone.grade : null} seed={frame}>
      <DoorCanvas doorOpen photoWall={photoWall} farView={v.farView && { clouds: line8Cloud(frame) }} tone={line8Tone} {...shot} overlay={<PuffBubble framing={shot.framing} />}>
        <PuffCharacter 你={v.你} />
      </DoorCanvas>
    </FilmPost>
  );
};

export default picture;

// anim extract --particle-frames 生成，别手改：粒子 goety:fiery_pillar 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/fiery_pillar sha256 b52468f075b927c4f89b67ac7b3b81f38ed7ce4c3cafd49c0bd5288c8d7e5c8f
import { png, type Png } from '@engine/model/贴图.ts';
import frame0 from 'asset:贴图/法术/goety/particle/big_fire_drop_1';
import frame1 from 'asset:贴图/法术/goety/particle/big_fire_drop_2';
import frame2 from 'asset:贴图/法术/goety/particle/big_fire_drop_3';
import frame3 from 'asset:贴图/法术/goety/particle/big_fire_drop_4';
import frame4 from 'asset:贴图/法术/goety/particle/big_fire_drop_5';
import frame5 from 'asset:贴图/法术/goety/particle/big_fire_drop_6';
import frame6 from 'asset:贴图/法术/goety/particle/big_fire_drop_7';
import frame7 from 'asset:贴图/法术/goety/particle/big_fire_drop_8';

const animFrames: readonly Png[] = [frame0, frame1, frame2, frame3, frame4, frame5, frame6, frame7].map(png);
export default animFrames;

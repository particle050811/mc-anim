// anim extract --particle-frames 生成，别手改：粒子 goety:spell_cloud 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/spell_cloud sha256 1667bd914d0ee4c9139705bf5b22b0610550f0e191317bb41ff79941bf43967d
import { png, type Png } from '@engine/model/贴图.ts';
import frame0 from 'asset:贴图/法术/goety/particle/spell_cloud_0';
import frame1 from 'asset:贴图/法术/goety/particle/spell_cloud_1';
import frame2 from 'asset:贴图/法术/goety/particle/spell_cloud_2';
import frame3 from 'asset:贴图/法术/goety/particle/spell_cloud_3';
import frame4 from 'asset:贴图/法术/goety/particle/spell_cloud_4';
import frame5 from 'asset:贴图/法术/goety/particle/spell_cloud_5';
import frame6 from 'asset:贴图/法术/goety/particle/spell_cloud_6';
import frame7 from 'asset:贴图/法术/goety/particle/spell_cloud_7';
import frame8 from 'asset:贴图/法术/goety/particle/spell_cloud_8';
import frame9 from 'asset:贴图/法术/goety/particle/spell_cloud_9';
import frame10 from 'asset:贴图/法术/goety/particle/spell_cloud_10';
import frame11 from 'asset:贴图/法术/goety/particle/spell_cloud_11';

const animFrames: readonly Png[] = [frame0, frame1, frame2, frame3, frame4, frame5, frame6, frame7, frame8, frame9, frame10, frame11].map(png);
export default animFrames;

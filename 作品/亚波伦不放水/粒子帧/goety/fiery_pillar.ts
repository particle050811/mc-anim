// anim extract --粒子帧 生成，别手改：粒子 goety:fiery_pillar 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/fiery_pillar sha256 b52468f075b927c4f89b67ac7b3b81f38ed7ce4c3cafd49c0bd5288c8d7e5c8f
import { png, type Png } from '@engine/model/贴图.ts';
import bigFireDrop1Png from 'asset:贴图/法术/goety/particle/big_fire_drop_1';
import bigFireDrop2Png from 'asset:贴图/法术/goety/particle/big_fire_drop_2';
import bigFireDrop3Png from 'asset:贴图/法术/goety/particle/big_fire_drop_3';
import bigFireDrop4Png from 'asset:贴图/法术/goety/particle/big_fire_drop_4';
import bigFireDrop5Png from 'asset:贴图/法术/goety/particle/big_fire_drop_5';
import bigFireDrop6Png from 'asset:贴图/法术/goety/particle/big_fire_drop_6';
import bigFireDrop7Png from 'asset:贴图/法术/goety/particle/big_fire_drop_7';
import bigFireDrop8Png from 'asset:贴图/法术/goety/particle/big_fire_drop_8';

const animFrames: readonly Png[] = [bigFireDrop1Png, bigFireDrop2Png, bigFireDrop3Png, bigFireDrop4Png, bigFireDrop5Png, bigFireDrop6Png, bigFireDrop7Png, bigFireDrop8Png].map(png);
export default animFrames;

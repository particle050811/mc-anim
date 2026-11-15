// anim extract --粒子帧 生成，别手改：粒子 goety:big_fire_ground 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/big_fire_ground sha256 8a626b2f737f15498630bf23b5ae4767844514137c4281eb75cd0dd16ffcc86f
import { png, type Png } from '@engine/model/贴图.ts';
import bigFireGround1Png from 'asset:贴图/法术/goety/particle/big_fire_ground_1';
import bigFireGround2Png from 'asset:贴图/法术/goety/particle/big_fire_ground_2';
import bigFireGround3Png from 'asset:贴图/法术/goety/particle/big_fire_ground_3';
import bigFireGround4Png from 'asset:贴图/法术/goety/particle/big_fire_ground_4';
import bigFireGround5Png from 'asset:贴图/法术/goety/particle/big_fire_ground_5';
import bigFireGround6Png from 'asset:贴图/法术/goety/particle/big_fire_ground_6';
import bigFireGround7Png from 'asset:贴图/法术/goety/particle/big_fire_ground_7';
import bigFireGround8Png from 'asset:贴图/法术/goety/particle/big_fire_ground_8';

const animFrames: readonly Png[] = [bigFireGround1Png, bigFireGround2Png, bigFireGround3Png, bigFireGround4Png, bigFireGround5Png, bigFireGround6Png, bigFireGround7Png, bigFireGround8Png].map(png);
export default animFrames;

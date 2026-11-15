// anim extract --粒子帧 生成，别手改：粒子 goety:frost_nova 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/frost_nova sha256 6739e741f212e798e60d706cf6f2c1b3bf620166ffad1fd111a9209a11ec5495
import { png, type Png } from '@engine/model/贴图.ts';
import frost1Png from 'asset:贴图/法术/goety/particle/frost_1';
import frost2Png from 'asset:贴图/法术/goety/particle/frost_2';
import frost3Png from 'asset:贴图/法术/goety/particle/frost_3';
import frost4Png from 'asset:贴图/法术/goety/particle/frost_4';
import frost5Png from 'asset:贴图/法术/goety/particle/frost_5';
import frost6Png from 'asset:贴图/法术/goety/particle/frost_6';

const animFrames: readonly Png[] = [frost1Png, frost2Png, frost3Png, frost4Png, frost5Png, frost6Png, frost5Png, frost4Png, frost3Png, frost2Png, frost1Png].map(png);
export default animFrames;

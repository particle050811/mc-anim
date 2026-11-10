// anim extract --粒子帧 生成，别手改：粒子 goety:spell_square 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/spell_square sha256 312501ba742bd4289c4a11bd6859a2622d413302f30064fb1d87d2538e86c7f5
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/goety/particle/trail';

const 帧: readonly Png[] = [图0].map(png);
export default 帧;

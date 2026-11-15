// anim extract --粒子帧 生成，别手改：粒子 goety:spell_cloud 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/spell_cloud sha256 1667bd914d0ee4c9139705bf5b22b0610550f0e191317bb41ff79941bf43967d
import { png, type Png } from '@engine/model/贴图.ts';
import spellCloud0Png from 'asset:贴图/法术/goety/particle/spell_cloud_0';
import spellCloud1Png from 'asset:贴图/法术/goety/particle/spell_cloud_1';
import spellCloud2Png from 'asset:贴图/法术/goety/particle/spell_cloud_2';
import spellCloud3Png from 'asset:贴图/法术/goety/particle/spell_cloud_3';
import spellCloud4Png from 'asset:贴图/法术/goety/particle/spell_cloud_4';
import spellCloud5Png from 'asset:贴图/法术/goety/particle/spell_cloud_5';
import spellCloud6Png from 'asset:贴图/法术/goety/particle/spell_cloud_6';
import spellCloud7Png from 'asset:贴图/法术/goety/particle/spell_cloud_7';
import spellCloud8Png from 'asset:贴图/法术/goety/particle/spell_cloud_8';
import spellCloud9Png from 'asset:贴图/法术/goety/particle/spell_cloud_9';
import spellCloud10Png from 'asset:贴图/法术/goety/particle/spell_cloud_10';
import spellCloud11Png from 'asset:贴图/法术/goety/particle/spell_cloud_11';

const animFrames: readonly Png[] = [spellCloud0Png, spellCloud1Png, spellCloud2Png, spellCloud3Png, spellCloud4Png, spellCloud5Png, spellCloud6Png, spellCloud7Png, spellCloud8Png, spellCloud9Png, spellCloud10Png, spellCloud11Png].map(png);
export default animFrames;

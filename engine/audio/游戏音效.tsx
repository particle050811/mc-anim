// 原版音效：文件是 工具/游戏取材/导出音效.py 从游戏资源原样拷出来的 ogg（来源、hash 和 sounds.json 的参数在 游戏音效.json），
// 镜头只给「哪一刻、在哪儿、调 playSound 时传的 volume / pitch」，播放时的音量、音高、距离衰减照 1.20.1 客户端算：
// - 音高 = 代码传的 pitch × sounds.json 的 pitch，夹在 0.5～2（`SoundEngine.calculatePitch`）。OpenAL 的 AL_PITCH 是变速变调，
//   这里用 @remotion/media 的 `playbackRate`（预览和渲染都是变速变调）；不能用 remotion 自带的 <Audio>：渲染时 playbackRate 走 ffmpeg atempo，只变速不变调。
// - 音量 = 代码传的 volume × sounds.json 的 volume，实际增益夹在 0～1（`SoundEngine.calculateVolume`，各类别音量按默认 100%）。volume 大于 1 不会更响，只是听得更远。
// - 距离衰减（`SoundEngine.play` → `Channel.linearAttenuation`）：线性距离模型，增益 × max(0, 1 − 距离 / R)，R = max(音量, 1) × attenuation_distance（sounds.json 没写就是 16 格），到 R 就听不见。
//   例：尖啸 2.0 × 0.85 → R = 27.2 格；监守者钻出、心跳、触角都是 5.0 → R = 80 格。
// - 听者 = 镜头机位（项目定的：声音跟着画面的远近走）。没做左右声像，两个声道一样。
// - 每次放哪个文件：sounds.json 里按 weight 随机挑一个（`WeighedSoundEvents.getSound`）；这里用镜头给的随机数挑，固定下来，每次渲染一样。
// - 也收模组的声音（工具/游戏取材/导出音效.py --jar）：夜幕（efn:）、史诗战斗（epicfight:）、暮色森林（twilightforest:）从各自的 jar 取，参数照搬，播放规则同上；拔刀剑没有自己的声音（用原版的三叉戟投掷、锁链等）。
// - 整条音效总线再乘 混音.ts 的 `sfxVolume`。
// 分档（混音.ts）：没给 `档` 的按事件名归一个档，除了「细节」档都不走上面的音量和距离衰减，按档定响度（见那里）。
// 文件开头有一截静音的（音效起音.json），起点往前挪这么多，听见的那一下落在给的那一帧上。
// 用法：<游戏声音轨 声们={…} 听者={(帧) => 机位} />，帧 是这条音轨自己的帧号（镜头的全局帧，配 `起帧` 用：Composition 第 0 帧 = 全局 起帧）。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import type { V3 } from '../model/parts.tsx';
import sfxTableJson from 'asset:数据/音效/游戏音效';
import { defaultTier, distanceFeel, majorActionFloor, majorActionFloorOn, sfxVolume, tierLoudness, type 音效档 } from './混音.ts';
import fileLoudnessJson from 'asset:数据/音效/音效响度';
import fileOnsetJson from 'asset:数据/音效/音效起音';
import { tagSrc } from './同源区分.ts';
import { useFirstVisibleFrame, useSfxLog } from './音效清单.ts';
import { 资产目录 } from '../core/资产目录.ts';
import 资_0 from 'asset:音效/ambient.cave.1';
import 资_1 from 'asset:音效/ambient.cave.10';
import 资_2 from 'asset:音效/ambient.cave.11';
import 资_3 from 'asset:音效/ambient.cave.12';
import 资_4 from 'asset:音效/ambient.cave.13';
import 资_5 from 'asset:音效/ambient.cave.14';
import 资_6 from 'asset:音效/ambient.cave.15';
import 资_7 from 'asset:音效/ambient.cave.16';
import 资_8 from 'asset:音效/ambient.cave.17';
import 资_9 from 'asset:音效/ambient.cave.18';
import 资_10 from 'asset:音效/ambient.cave.19';
import 资_11 from 'asset:音效/ambient.cave.2';
import 资_12 from 'asset:音效/ambient.cave.3';
import 资_13 from 'asset:音效/ambient.cave.4';
import 资_14 from 'asset:音效/ambient.cave.5';
import 资_15 from 'asset:音效/ambient.cave.6';
import 资_16 from 'asset:音效/ambient.cave.7';
import 资_17 from 'asset:音效/ambient.cave.8';
import 资_18 from 'asset:音效/ambient.cave.9';
import 资_19 from 'asset:音效/block.amethyst_block.hit.1';
import 资_20 from 'asset:音效/block.amethyst_block.hit.10';
import 资_21 from 'asset:音效/block.amethyst_block.hit.11';
import 资_22 from 'asset:音效/block.amethyst_block.hit.12';
import 资_23 from 'asset:音效/block.amethyst_block.hit.2';
import 资_24 from 'asset:音效/block.amethyst_block.hit.3';
import 资_25 from 'asset:音效/block.amethyst_block.hit.4';
import 资_26 from 'asset:音效/block.amethyst_block.hit.5';
import 资_27 from 'asset:音效/block.amethyst_block.hit.6';
import 资_28 from 'asset:音效/block.amethyst_block.hit.7';
import 资_29 from 'asset:音效/block.amethyst_block.hit.8';
import 资_30 from 'asset:音效/block.amethyst_block.hit.9';
import 资_31 from 'asset:音效/block.azalea_leaves.break.1';
import 资_32 from 'asset:音效/block.azalea_leaves.break.10';
import 资_33 from 'asset:音效/block.azalea_leaves.break.11';
import 资_34 from 'asset:音效/block.azalea_leaves.break.12';
import 资_35 from 'asset:音效/block.azalea_leaves.break.13';
import 资_36 from 'asset:音效/block.azalea_leaves.break.14';
import 资_37 from 'asset:音效/block.azalea_leaves.break.2';
import 资_38 from 'asset:音效/block.azalea_leaves.break.3';
import 资_39 from 'asset:音效/block.azalea_leaves.break.4';
import 资_40 from 'asset:音效/block.azalea_leaves.break.5';
import 资_41 from 'asset:音效/block.azalea_leaves.break.6';
import 资_42 from 'asset:音效/block.azalea_leaves.break.7';
import 资_43 from 'asset:音效/block.azalea_leaves.break.8';
import 资_44 from 'asset:音效/block.azalea_leaves.break.9';
import 资_45 from 'asset:音效/block.azalea_leaves.hit.1';
import 资_46 from 'asset:音效/block.azalea_leaves.hit.2';
import 资_47 from 'asset:音效/block.azalea_leaves.hit.3';
import 资_48 from 'asset:音效/block.azalea_leaves.hit.4';
import 资_49 from 'asset:音效/block.azalea_leaves.hit.5';
import 资_50 from 'asset:音效/block.calcite.break.1';
import 资_51 from 'asset:音效/block.calcite.break.2';
import 资_52 from 'asset:音效/block.calcite.break.3';
import 资_53 from 'asset:音效/block.calcite.break.4';
import 资_54 from 'asset:音效/block.candle.extinguish.1';
import 资_55 from 'asset:音效/block.candle.extinguish.10';
import 资_56 from 'asset:音效/block.candle.extinguish.11';
import 资_57 from 'asset:音效/block.candle.extinguish.12';
import 资_58 from 'asset:音效/block.candle.extinguish.13';
import 资_59 from 'asset:音效/block.candle.extinguish.14';
import 资_60 from 'asset:音效/block.candle.extinguish.15';
import 资_61 from 'asset:音效/block.candle.extinguish.16';
import 资_62 from 'asset:音效/block.candle.extinguish.17';
import 资_63 from 'asset:音效/block.candle.extinguish.18';
import 资_64 from 'asset:音效/block.candle.extinguish.2';
import 资_65 from 'asset:音效/block.candle.extinguish.3';
import 资_66 from 'asset:音效/block.candle.extinguish.4';
import 资_67 from 'asset:音效/block.candle.extinguish.5';
import 资_68 from 'asset:音效/block.candle.extinguish.6';
import 资_69 from 'asset:音效/block.candle.extinguish.7';
import 资_70 from 'asset:音效/block.candle.extinguish.8';
import 资_71 from 'asset:音效/block.candle.extinguish.9';
import 资_72 from 'asset:音效/block.chain.hit.1';
import 资_73 from 'asset:音效/block.chain.hit.2';
import 资_74 from 'asset:音效/block.chain.hit.3';
import 资_75 from 'asset:音效/block.chain.hit.4';
import 资_76 from 'asset:音效/block.chain.hit.5';
import 资_77 from 'asset:音效/block.chain.hit.6';
import 资_78 from 'asset:音效/block.chest.close.1';
import 资_79 from 'asset:音效/block.chest.close.2';
import 资_80 from 'asset:音效/block.chest.close.3';
import 资_81 from 'asset:音效/block.chest.open';
import 资_82 from 'asset:音效/block.deepslate.break.1';
import 资_83 from 'asset:音效/block.deepslate.break.2';
import 资_84 from 'asset:音效/block.deepslate.break.3';
import 资_85 from 'asset:音效/block.deepslate.break.4';
import 资_86 from 'asset:音效/block.deepslate.fall.1';
import 资_87 from 'asset:音效/block.deepslate.fall.2';
import 资_88 from 'asset:音效/block.deepslate.fall.3';
import 资_89 from 'asset:音效/block.deepslate.fall.4';
import 资_90 from 'asset:音效/block.deepslate.fall.5';
import 资_91 from 'asset:音效/block.deepslate.fall.6';
import 资_92 from 'asset:音效/block.deepslate.step.1';
import 资_93 from 'asset:音效/block.deepslate.step.2';
import 资_94 from 'asset:音效/block.deepslate.step.3';
import 资_95 from 'asset:音效/block.deepslate.step.4';
import 资_96 from 'asset:音效/block.deepslate.step.5';
import 资_97 from 'asset:音效/block.deepslate.step.6';
import 资_98 from 'asset:音效/block.deepslate_bricks.break.1';
import 资_99 from 'asset:音效/block.deepslate_bricks.break.2';
import 资_100 from 'asset:音效/block.deepslate_bricks.break.3';
import 资_101 from 'asset:音效/block.deepslate_bricks.break.4';
import 资_102 from 'asset:音效/block.deepslate_bricks.break.5';
import 资_103 from 'asset:音效/block.deepslate_bricks.break.6';
import 资_104 from 'asset:音效/block.deepslate_bricks.step.1';
import 资_105 from 'asset:音效/block.deepslate_bricks.step.2';
import 资_106 from 'asset:音效/block.deepslate_bricks.step.3';
import 资_107 from 'asset:音效/block.deepslate_bricks.step.4';
import 资_108 from 'asset:音效/block.deepslate_bricks.step.5';
import 资_109 from 'asset:音效/block.deepslate_tiles.step.1';
import 资_110 from 'asset:音效/block.deepslate_tiles.step.2';
import 资_111 from 'asset:音效/block.deepslate_tiles.step.3';
import 资_112 from 'asset:音效/block.deepslate_tiles.step.4';
import 资_113 from 'asset:音效/block.deepslate_tiles.step.5';
import 资_114 from 'asset:音效/block.glass.break.1';
import 资_115 from 'asset:音效/block.glass.break.2';
import 资_116 from 'asset:音效/block.glass.break.3';
import 资_117 from 'asset:音效/block.glass.hit.1';
import 资_118 from 'asset:音效/block.glass.hit.2';
import 资_119 from 'asset:音效/block.glass.hit.3';
import 资_120 from 'asset:音效/block.glass.hit.4';
import 资_121 from 'asset:音效/block.glass.hit.5';
import 资_122 from 'asset:音效/block.glass.hit.6';
import 资_123 from 'asset:音效/block.grass.break.1';
import 资_124 from 'asset:音效/block.grass.break.2';
import 资_125 from 'asset:音效/block.grass.break.3';
import 资_126 from 'asset:音效/block.grass.break.4';
import 资_127 from 'asset:音效/block.grass.hit.1';
import 资_128 from 'asset:音效/block.grass.hit.2';
import 资_129 from 'asset:音效/block.grass.hit.3';
import 资_130 from 'asset:音效/block.grass.hit.4';
import 资_131 from 'asset:音效/block.grass.hit.5';
import 资_132 from 'asset:音效/block.grass.hit.6';
import 资_133 from 'asset:音效/block.grass.step.1';
import 资_134 from 'asset:音效/block.grass.step.2';
import 资_135 from 'asset:音效/block.grass.step.3';
import 资_136 from 'asset:音效/block.grass.step.4';
import 资_137 from 'asset:音效/block.grass.step.5';
import 资_138 from 'asset:音效/block.grass.step.6';
import 资_139 from 'asset:音效/block.gravel.break.1';
import 资_140 from 'asset:音效/block.gravel.break.2';
import 资_141 from 'asset:音效/block.gravel.break.3';
import 资_142 from 'asset:音效/block.gravel.break.4';
import 资_143 from 'asset:音效/block.gravel.hit.1';
import 资_144 from 'asset:音效/block.gravel.hit.2';
import 资_145 from 'asset:音效/block.gravel.hit.3';
import 资_146 from 'asset:音效/block.gravel.hit.4';
import 资_147 from 'asset:音效/block.ladder.break.1';
import 资_148 from 'asset:音效/block.ladder.break.2';
import 资_149 from 'asset:音效/block.ladder.break.3';
import 资_150 from 'asset:音效/block.ladder.break.4';
import 资_151 from 'asset:音效/block.ladder.hit.1';
import 资_152 from 'asset:音效/block.ladder.hit.2';
import 资_153 from 'asset:音效/block.ladder.hit.3';
import 资_154 from 'asset:音效/block.ladder.hit.4';
import 资_155 from 'asset:音效/block.ladder.hit.5';
import 资_156 from 'asset:音效/block.lever.click';
import 资_157 from 'asset:音效/block.metal.break.1';
import 资_158 from 'asset:音效/block.metal.break.2';
import 资_159 from 'asset:音效/block.metal.break.3';
import 资_160 from 'asset:音效/block.metal.break.4';
import 资_161 from 'asset:音效/block.metal.hit.1';
import 资_162 from 'asset:音效/block.metal.hit.2';
import 资_163 from 'asset:音效/block.metal.hit.3';
import 资_164 from 'asset:音效/block.metal.hit.4';
import 资_165 from 'asset:音效/block.metal.hit.5';
import 资_166 from 'asset:音效/block.metal.hit.6';
import 资_167 from 'asset:音效/block.portal.travel';
import 资_168 from 'asset:音效/block.portal.trigger';
import 资_169 from 'asset:音效/block.respawn_anchor.set_spawn.1';
import 资_170 from 'asset:音效/block.respawn_anchor.set_spawn.2';
import 资_171 from 'asset:音效/block.respawn_anchor.set_spawn.3';
import 资_172 from 'asset:音效/block.sculk.break.1';
import 资_173 from 'asset:音效/block.sculk.break.10';
import 资_174 from 'asset:音效/block.sculk.break.11';
import 资_175 from 'asset:音效/block.sculk.break.12';
import 资_176 from 'asset:音效/block.sculk.break.13';
import 资_177 from 'asset:音效/block.sculk.break.14';
import 资_178 from 'asset:音效/block.sculk.break.2';
import 资_179 from 'asset:音效/block.sculk.break.3';
import 资_180 from 'asset:音效/block.sculk.break.4';
import 资_181 from 'asset:音效/block.sculk.break.5';
import 资_182 from 'asset:音效/block.sculk.break.6';
import 资_183 from 'asset:音效/block.sculk.break.7';
import 资_184 from 'asset:音效/block.sculk.break.8';
import 资_185 from 'asset:音效/block.sculk.break.9';
import 资_186 from 'asset:音效/block.sculk.spread.1';
import 资_187 from 'asset:音效/block.sculk.spread.2';
import 资_188 from 'asset:音效/block.sculk.spread.3';
import 资_189 from 'asset:音效/block.sculk.spread.4';
import 资_190 from 'asset:音效/block.sculk.spread.5';
import 资_191 from 'asset:音效/block.sculk.step.1';
import 资_192 from 'asset:音效/block.sculk.step.2';
import 资_193 from 'asset:音效/block.sculk.step.3';
import 资_194 from 'asset:音效/block.sculk.step.4';
import 资_195 from 'asset:音效/block.sculk.step.5';
import 资_196 from 'asset:音效/block.sculk.step.6';
import 资_197 from 'asset:音效/block.sculk_catalyst.bloom.1';
import 资_198 from 'asset:音效/block.sculk_catalyst.bloom.10';
import 资_199 from 'asset:音效/block.sculk_catalyst.bloom.11';
import 资_200 from 'asset:音效/block.sculk_catalyst.bloom.12';
import 资_201 from 'asset:音效/block.sculk_catalyst.bloom.13';
import 资_202 from 'asset:音效/block.sculk_catalyst.bloom.2';
import 资_203 from 'asset:音效/block.sculk_catalyst.bloom.3';
import 资_204 from 'asset:音效/block.sculk_catalyst.bloom.4';
import 资_205 from 'asset:音效/block.sculk_catalyst.bloom.5';
import 资_206 from 'asset:音效/block.sculk_catalyst.bloom.6';
import 资_207 from 'asset:音效/block.sculk_catalyst.bloom.7';
import 资_208 from 'asset:音效/block.sculk_catalyst.bloom.8';
import 资_209 from 'asset:音效/block.sculk_catalyst.bloom.9';
import 资_210 from 'asset:音效/block.sculk_sensor.clicking.1';
import 资_211 from 'asset:音效/block.sculk_sensor.clicking.2';
import 资_212 from 'asset:音效/block.sculk_sensor.clicking.3';
import 资_213 from 'asset:音效/block.sculk_sensor.clicking.4';
import 资_214 from 'asset:音效/block.sculk_sensor.clicking.5';
import 资_215 from 'asset:音效/block.sculk_sensor.clicking.6';
import 资_216 from 'asset:音效/block.sculk_sensor.clicking_stop.1';
import 资_217 from 'asset:音效/block.sculk_sensor.clicking_stop.2';
import 资_218 from 'asset:音效/block.sculk_sensor.clicking_stop.3';
import 资_219 from 'asset:音效/block.sculk_sensor.clicking_stop.4';
import 资_220 from 'asset:音效/block.sculk_sensor.clicking_stop.5';
import 资_221 from 'asset:音效/block.sculk_shrieker.shriek.1';
import 资_222 from 'asset:音效/block.sculk_shrieker.shriek.2';
import 资_223 from 'asset:音效/block.sculk_shrieker.shriek.3';
import 资_224 from 'asset:音效/block.sculk_shrieker.shriek.4';
import 资_225 from 'asset:音效/block.sculk_shrieker.shriek.5';
import 资_226 from 'asset:音效/block.snow.break.1';
import 资_227 from 'asset:音效/block.snow.break.2';
import 资_228 from 'asset:音效/block.snow.break.3';
import 资_229 from 'asset:音效/block.snow.break.4';
import 资_230 from 'asset:音效/block.snow.hit.1';
import 资_231 from 'asset:音效/block.snow.hit.2';
import 资_232 from 'asset:音效/block.snow.hit.3';
import 资_233 from 'asset:音效/block.snow.hit.4';
import 资_234 from 'asset:音效/block.snow.step.1';
import 资_235 from 'asset:音效/block.snow.step.2';
import 资_236 from 'asset:音效/block.snow.step.3';
import 资_237 from 'asset:音效/block.snow.step.4';
import 资_238 from 'asset:音效/block.stone.break.1';
import 资_239 from 'asset:音效/block.stone.break.2';
import 资_240 from 'asset:音效/block.stone.break.3';
import 资_241 from 'asset:音效/block.stone.break.4';
import 资_242 from 'asset:音效/block.stone.fall.1';
import 资_243 from 'asset:音效/block.stone.fall.2';
import 资_244 from 'asset:音效/block.stone.fall.3';
import 资_245 from 'asset:音效/block.stone.fall.4';
import 资_246 from 'asset:音效/block.stone.fall.5';
import 资_247 from 'asset:音效/block.stone.fall.6';
import 资_248 from 'asset:音效/block.stone.hit.1';
import 资_249 from 'asset:音效/block.stone.hit.2';
import 资_250 from 'asset:音效/block.stone.hit.3';
import 资_251 from 'asset:音效/block.stone.hit.4';
import 资_252 from 'asset:音效/block.stone.hit.5';
import 资_253 from 'asset:音效/block.stone.hit.6';
import 资_254 from 'asset:音效/block.stone.place.1';
import 资_255 from 'asset:音效/block.stone.place.2';
import 资_256 from 'asset:音效/block.stone.place.3';
import 资_257 from 'asset:音效/block.stone.place.4';
import 资_258 from 'asset:音效/block.stone.step.1';
import 资_259 from 'asset:音效/block.stone.step.2';
import 资_260 from 'asset:音效/block.stone.step.3';
import 资_261 from 'asset:音效/block.stone.step.4';
import 资_262 from 'asset:音效/block.stone.step.5';
import 资_263 from 'asset:音效/block.stone.step.6';
import 资_264 from 'asset:音效/block.tuff.break.1';
import 资_265 from 'asset:音效/block.tuff.break.2';
import 资_266 from 'asset:音效/block.tuff.break.3';
import 资_267 from 'asset:音效/block.tuff.break.4';
import 资_268 from 'asset:音效/block.water.ambient';
import 资_269 from 'asset:音效/block.wood.break.1';
import 资_270 from 'asset:音效/block.wood.break.2';
import 资_271 from 'asset:音效/block.wood.break.3';
import 资_272 from 'asset:音效/block.wood.break.4';
import 资_273 from 'asset:音效/block.wood.hit.1';
import 资_274 from 'asset:音效/block.wood.hit.2';
import 资_275 from 'asset:音效/block.wood.hit.3';
import 资_276 from 'asset:音效/block.wood.hit.4';
import 资_277 from 'asset:音效/block.wood.hit.5';
import 资_278 from 'asset:音效/block.wood.hit.6';
import 资_279 from 'asset:音效/block.wood.place.1';
import 资_280 from 'asset:音效/block.wood.place.2';
import 资_281 from 'asset:音效/block.wood.place.3';
import 资_282 from 'asset:音效/block.wood.place.4';
import 资_283 from 'asset:音效/block.wood.step.1';
import 资_284 from 'asset:音效/block.wood.step.2';
import 资_285 from 'asset:音效/block.wood.step.3';
import 资_286 from 'asset:音效/block.wood.step.4';
import 资_287 from 'asset:音效/block.wood.step.5';
import 资_288 from 'asset:音效/block.wood.step.6';
import 资_289 from 'asset:音效/block.wool.break.1';
import 资_290 from 'asset:音效/block.wool.break.2';
import 资_291 from 'asset:音效/block.wool.break.3';
import 资_292 from 'asset:音效/block.wool.break.4';
import 资_293 from 'asset:音效/block.wool.place.1';
import 资_294 from 'asset:音效/block.wool.place.2';
import 资_295 from 'asset:音效/block.wool.place.3';
import 资_296 from 'asset:音效/block.wool.place.4';
import 资_297 from 'asset:音效/block.wool.step.1';
import 资_298 from 'asset:音效/block.wool.step.2';
import 资_299 from 'asset:音效/block.wool.step.3';
import 资_300 from 'asset:音效/block.wool.step.4';
import 资_301 from 'asset:音效/cataclysm.heavy_smash';
import 资_302 from 'asset:音效/create.blaze_munch.1';
import 资_303 from 'asset:音效/create.blaze_munch.2';
import 资_304 from 'asset:音效/create.blaze_munch.3';
import 资_305 from 'asset:音效/create.chiff';
import 资_306 from 'asset:音效/create.cogs';
import 资_307 from 'asset:音效/create.contraption_assemble.1';
import 资_308 from 'asset:音效/create.contraption_assemble.2';
import 资_309 from 'asset:音效/create.contraption_assemble.3';
import 资_310 from 'asset:音效/create.contraption_assemble.4';
import 资_311 from 'asset:音效/create.contraption_assemble.5';
import 资_312 from 'asset:音效/create.contraption_assemble_compounded_1';
import 资_313 from 'asset:音效/create.contraption_disassemble.1';
import 资_314 from 'asset:音效/create.contraption_disassemble.2';
import 资_315 from 'asset:音效/create.contraption_disassemble.3';
import 资_316 from 'asset:音效/create.contraption_disassemble.4';
import 资_317 from 'asset:音效/create.crafter_click.1';
import 资_318 from 'asset:音效/create.crafter_click.2';
import 资_319 from 'asset:音效/create.crafter_click.3';
import 资_320 from 'asset:音效/create.crafter_click.4';
import 资_321 from 'asset:音效/create.crafter_click.5';
import 资_322 from 'asset:音效/create.crafter_click.6';
import 资_323 from 'asset:音效/create.crafter_click_compounded_1.1';
import 资_324 from 'asset:音效/create.crafter_click_compounded_1.2';
import 资_325 from 'asset:音效/create.crafter_click_compounded_1.3';
import 资_326 from 'asset:音效/create.crafter_click_compounded_1.4';
import 资_327 from 'asset:音效/create.crafter_click_compounded_1.5';
import 资_328 from 'asset:音效/create.crafter_craft';
import 资_329 from 'asset:音效/create.cranking.1';
import 资_330 from 'asset:音效/create.cranking.2';
import 资_331 from 'asset:音效/create.cranking.3';
import 资_332 from 'asset:音效/create.cranking.4';
import 资_333 from 'asset:音效/create.cranking_compounded_1';
import 资_334 from 'asset:音效/create.crushing_1.1';
import 资_335 from 'asset:音效/create.crushing_1.2';
import 资_336 from 'asset:音效/create.crushing_1.3';
import 资_337 from 'asset:音效/create.crushing_1.4';
import 资_338 from 'asset:音效/create.crushing_1.5';
import 资_339 from 'asset:音效/create.crushing_1.6';
import 资_340 from 'asset:音效/create.crushing_2.1';
import 资_341 from 'asset:音效/create.crushing_2.2';
import 资_342 from 'asset:音效/create.crushing_2.3';
import 资_343 from 'asset:音效/create.crushing_2.4';
import 资_344 from 'asset:音效/create.crushing_3.1';
import 资_345 from 'asset:音效/create.crushing_3.2';
import 资_346 from 'asset:音效/create.crushing_3.3';
import 资_347 from 'asset:音效/create.crushing_3.4';
import 资_348 from 'asset:音效/create.crushing_3.5';
import 资_349 from 'asset:音效/create.crushing_3.6';
import 资_350 from 'asset:音效/create.crushing_3.7';
import 资_351 from 'asset:音效/create.crushing_3.8';
import 资_352 from 'asset:音效/create.depot_plop.1';
import 资_353 from 'asset:音效/create.depot_plop.2';
import 资_354 from 'asset:音效/create.depot_plop.3';
import 资_355 from 'asset:音效/create.depot_plop.4';
import 资_356 from 'asset:音效/create.depot_slide.1';
import 资_357 from 'asset:音效/create.depot_slide.2';
import 资_358 from 'asset:音效/create.depot_slide.3';
import 资_359 from 'asset:音效/create.depot_slide.4';
import 资_360 from 'asset:音效/create.funnel_flap.1';
import 资_361 from 'asset:音效/create.funnel_flap.2';
import 资_362 from 'asset:音效/create.funnel_flap.3';
import 资_363 from 'asset:音效/create.funnel_flap.4';
import 资_364 from 'asset:音效/create.funnel_flap_compounded_1.1';
import 资_365 from 'asset:音效/create.funnel_flap_compounded_1.2';
import 资_366 from 'asset:音效/create.funnel_flap_compounded_1.3';
import 资_367 from 'asset:音效/create.funnel_flap_compounded_1.4';
import 资_368 from 'asset:音效/create.fwoomp';
import 资_369 from 'asset:音效/create.item_hatch.1';
import 资_370 from 'asset:音效/create.item_hatch.2';
import 资_371 from 'asset:音效/create.item_hatch_compounded_1.1';
import 资_372 from 'asset:音效/create.item_hatch_compounded_1.2';
import 资_373 from 'asset:音效/create.item_hatch_compounded_1.3';
import 资_374 from 'asset:音效/create.item_hatch_compounded_1.4';
import 资_375 from 'asset:音效/create.item_hatch_compounded_1.5';
import 资_376 from 'asset:音效/create.item_hatch_compounded_1.6';
import 资_377 from 'asset:音效/create.item_hatch_compounded_1.7';
import 资_378 from 'asset:音效/create.item_hatch_compounded_1.8';
import 资_379 from 'asset:音效/create.mechanical_press_activation';
import 资_380 from 'asset:音效/create.mechanical_press_activation_belt.1';
import 资_381 from 'asset:音效/create.mechanical_press_activation_belt.2';
import 资_382 from 'asset:音效/create.mechanical_press_activation_belt.3';
import 资_383 from 'asset:音效/create.mechanical_press_activation_belt.4';
import 资_384 from 'asset:音效/create.mechanical_press_activation_belt_compounded_1';
import 资_385 from 'asset:音效/create.mechanical_press_activation_compounded_1';
import 资_386 from 'asset:音效/create.mixing.1';
import 资_387 from 'asset:音效/create.mixing.2';
import 资_388 from 'asset:音效/create.mixing.3';
import 资_389 from 'asset:音效/create.mixing.4';
import 资_390 from 'asset:音效/create.mixing_compounded_1.1';
import 资_391 from 'asset:音效/create.mixing_compounded_1.2';
import 资_392 from 'asset:音效/create.mixing_compounded_1.3';
import 资_393 from 'asset:音效/create.mixing_compounded_1.4';
import 资_394 from 'asset:音效/create.mixing_compounded_1.5';
import 资_395 from 'asset:音效/create.mixing_compounded_1.6';
import 资_396 from 'asset:音效/create.potato_hit.1';
import 资_397 from 'asset:音效/create.potato_hit.2';
import 资_398 from 'asset:音效/create.potato_hit.3';
import 资_399 from 'asset:音效/create.potato_hit_compounded_1.1';
import 资_400 from 'asset:音效/create.potato_hit_compounded_1.2';
import 资_401 from 'asset:音效/create.potato_hit_compounded_1.3';
import 资_402 from 'asset:音效/create.potato_hit_compounded_1.4';
import 资_403 from 'asset:音效/create.potato_hit_compounded_1.5';
import 资_404 from 'asset:音效/create.potato_hit_compounded_1.6';
import 资_405 from 'asset:音效/create.sanding_long';
import 资_406 from 'asset:音效/create.sanding_short.1';
import 资_407 from 'asset:音效/create.sanding_short.2';
import 资_408 from 'asset:音效/create.saw_activate_stone.1';
import 资_409 from 'asset:音效/create.saw_activate_stone.2';
import 资_410 from 'asset:音效/create.saw_activate_stone.3';
import 资_411 from 'asset:音效/create.saw_activate_stone.4';
import 资_412 from 'asset:音效/create.saw_activate_wood.1';
import 资_413 from 'asset:音效/create.saw_activate_wood.2';
import 资_414 from 'asset:音效/create.saw_activate_wood.3';
import 资_415 from 'asset:音效/create.saw_activate_wood.4';
import 资_416 from 'asset:音效/create.saw_activate_wood.5';
import 资_417 from 'asset:音效/create.saw_activate_wood.6';
import 资_418 from 'asset:音效/create.schematicannon_launch_block.1';
import 资_419 from 'asset:音效/create.schematicannon_launch_block.2';
import 资_420 from 'asset:音效/create.schematicannon_launch_block.3';
import 资_421 from 'asset:音效/create.schematicannon_launch_block.4';
import 资_422 from 'asset:音效/create.slime_added.1';
import 资_423 from 'asset:音效/create.slime_added.2';
import 资_424 from 'asset:音效/create.slime_added.3';
import 资_425 from 'asset:音效/create.slime_added.4';
import 资_426 from 'asset:音效/create.spout.1';
import 资_427 from 'asset:音效/create.spout.2';
import 资_428 from 'asset:音效/create.spout.3';
import 资_429 from 'asset:音效/create.spout.4';
import 资_430 from 'asset:音效/create.steam';
import 资_431 from 'asset:音效/create.train';
import 资_432 from 'asset:音效/create.train2';
import 资_433 from 'asset:音效/create.train3';
import 资_434 from 'asset:音效/create.whistle';
import 资_435 from 'asset:音效/create.whistle_high';
import 资_436 from 'asset:音效/create.whistle_low';
import 资_437 from 'asset:音效/create.whistle_train';
import 资_438 from 'asset:音效/create.whistle_train_low';
import 资_439 from 'asset:音效/create.whistle_train_manual';
import 资_440 from 'asset:音效/create.whistle_train_manual_end';
import 资_441 from 'asset:音效/create.whistle_train_manual_low';
import 资_442 from 'asset:音效/create.whistle_train_manual_low_end';
import 资_443 from 'asset:音效/create.wrench_remove';
import 资_444 from 'asset:音效/create.wrench_remove_compounded_1.1';
import 资_445 from 'asset:音效/create.wrench_remove_compounded_1.2';
import 资_446 from 'asset:音效/create.wrench_remove_compounded_1.3';
import 资_447 from 'asset:音效/create.wrench_remove_compounded_1.4';
import 资_448 from 'asset:音效/create.wrench_remove_compounded_1.5';
import 资_449 from 'asset:音效/create.wrench_remove_compounded_1.6';
import 资_450 from 'asset:音效/create.wrench_rotate.1';
import 资_451 from 'asset:音效/create.wrench_rotate.2';
import 资_452 from 'asset:音效/create.wrench_rotate.3';
import 资_453 from 'asset:音效/efn.parry.1';
import 资_454 from 'asset:音效/efn.parry.2';
import 资_455 from 'asset:音效/efn.parry.3';
import 资_456 from 'asset:音效/efn.parry.4';
import 资_457 from 'asset:音效/efn.whoosh_light_1';
import 资_458 from 'asset:音效/entity.arrow.hit.1';
import 资_459 from 'asset:音效/entity.arrow.hit.2';
import 资_460 from 'asset:音效/entity.arrow.hit.3';
import 资_461 from 'asset:音效/entity.arrow.hit.4';
import 资_462 from 'asset:音效/entity.arrow.shoot';
import 资_463 from 'asset:音效/entity.creeper.hurt.1';
import 资_464 from 'asset:音效/entity.creeper.hurt.2';
import 资_465 from 'asset:音效/entity.creeper.hurt.3';
import 资_466 from 'asset:音效/entity.creeper.hurt.4';
import 资_467 from 'asset:音效/entity.evoker.cast_spell.1';
import 资_468 from 'asset:音效/entity.evoker.cast_spell.2';
import 资_469 from 'asset:音效/entity.evoker.prepare_summon';
import 资_470 from 'asset:音效/entity.experience_orb.pickup';
import 资_471 from 'asset:音效/entity.generic.big_fall';
import 资_472 from 'asset:音效/entity.generic.death.1';
import 资_473 from 'asset:音效/entity.generic.death.2';
import 资_474 from 'asset:音效/entity.generic.death.3';
import 资_475 from 'asset:音效/entity.generic.explode.1';
import 资_476 from 'asset:音效/entity.generic.explode.2';
import 资_477 from 'asset:音效/entity.generic.explode.3';
import 资_478 from 'asset:音效/entity.generic.explode.4';
import 资_479 from 'asset:音效/entity.generic.hurt.1';
import 资_480 from 'asset:音效/entity.generic.hurt.2';
import 资_481 from 'asset:音效/entity.generic.hurt.3';
import 资_482 from 'asset:音效/entity.generic.small_fall';
import 资_483 from 'asset:音效/entity.generic.splash.1';
import 资_484 from 'asset:音效/entity.generic.splash.2';
import 资_485 from 'asset:音效/entity.ghast.shoot';
import 资_486 from 'asset:音效/entity.horse.ambient.1';
import 资_487 from 'asset:音效/entity.horse.ambient.2';
import 资_488 from 'asset:音效/entity.horse.ambient.3';
import 资_489 from 'asset:音效/entity.horse.breathe.1';
import 资_490 from 'asset:音效/entity.horse.breathe.2';
import 资_491 from 'asset:音效/entity.horse.breathe.3';
import 资_492 from 'asset:音效/entity.horse.death';
import 资_493 from 'asset:音效/entity.horse.gallop.1';
import 资_494 from 'asset:音效/entity.horse.gallop.2';
import 资_495 from 'asset:音效/entity.horse.gallop.3';
import 资_496 from 'asset:音效/entity.horse.gallop.4';
import 资_497 from 'asset:音效/entity.horse.hurt.1';
import 资_498 from 'asset:音效/entity.horse.hurt.2';
import 资_499 from 'asset:音效/entity.horse.hurt.3';
import 资_500 from 'asset:音效/entity.horse.hurt.4';
import 资_501 from 'asset:音效/entity.horse.jump';
import 资_502 from 'asset:音效/entity.horse.land';
import 资_503 from 'asset:音效/entity.horse.step.1';
import 资_504 from 'asset:音效/entity.horse.step.2';
import 资_505 from 'asset:音效/entity.horse.step.3';
import 资_506 from 'asset:音效/entity.horse.step.4';
import 资_507 from 'asset:音效/entity.horse.step.5';
import 资_508 from 'asset:音效/entity.horse.step.6';
import 资_509 from 'asset:音效/entity.hostile.death.1';
import 资_510 from 'asset:音效/entity.hostile.death.2';
import 资_511 from 'asset:音效/entity.hostile.death.3';
import 资_512 from 'asset:音效/entity.hostile.hurt.1';
import 资_513 from 'asset:音效/entity.hostile.hurt.2';
import 资_514 from 'asset:音效/entity.hostile.hurt.3';
import 资_515 from 'asset:音效/entity.illusioner.cast_spell.1';
import 资_516 from 'asset:音效/entity.illusioner.cast_spell.2';
import 资_517 from 'asset:音效/entity.illusioner.mirror_move.1';
import 资_518 from 'asset:音效/entity.illusioner.mirror_move.2';
import 资_519 from 'asset:音效/entity.illusioner.prepare_mirror';
import 资_520 from 'asset:音效/entity.item.break';
import 资_521 from 'asset:音效/entity.item.pickup';
import 资_522 from 'asset:音效/entity.lightning_bolt.impact.1';
import 资_523 from 'asset:音效/entity.lightning_bolt.impact.2';
import 资_524 from 'asset:音效/entity.lightning_bolt.impact.3';
import 资_525 from 'asset:音效/entity.lightning_bolt.impact.4';
import 资_526 from 'asset:音效/entity.lightning_bolt.thunder.1';
import 资_527 from 'asset:音效/entity.lightning_bolt.thunder.2';
import 资_528 from 'asset:音效/entity.lightning_bolt.thunder.3';
import 资_529 from 'asset:音效/entity.minecart.inside';
import 资_530 from 'asset:音效/entity.painting.break.1';
import 资_531 from 'asset:音效/entity.painting.break.2';
import 资_532 from 'asset:音效/entity.painting.break.3';
import 资_533 from 'asset:音效/entity.player.attack.crit.1';
import 资_534 from 'asset:音效/entity.player.attack.crit.2';
import 资_535 from 'asset:音效/entity.player.attack.crit.3';
import 资_536 from 'asset:音效/entity.player.attack.knockback.1';
import 资_537 from 'asset:音效/entity.player.attack.knockback.2';
import 资_538 from 'asset:音效/entity.player.attack.knockback.3';
import 资_539 from 'asset:音效/entity.player.attack.knockback.4';
import 资_540 from 'asset:音效/entity.player.attack.strong.1';
import 资_541 from 'asset:音效/entity.player.attack.strong.2';
import 资_542 from 'asset:音效/entity.player.attack.strong.3';
import 资_543 from 'asset:音效/entity.player.attack.strong.4';
import 资_544 from 'asset:音效/entity.player.attack.strong.5';
import 资_545 from 'asset:音效/entity.player.attack.strong.6';
import 资_546 from 'asset:音效/entity.player.attack.sweep.1';
import 资_547 from 'asset:音效/entity.player.attack.sweep.2';
import 资_548 from 'asset:音效/entity.player.attack.sweep.3';
import 资_549 from 'asset:音效/entity.player.attack.sweep.4';
import 资_550 from 'asset:音效/entity.player.attack.sweep.5';
import 资_551 from 'asset:音效/entity.player.attack.sweep.6';
import 资_552 from 'asset:音效/entity.player.attack.sweep.7';
import 资_553 from 'asset:音效/entity.player.attack.weak.1';
import 资_554 from 'asset:音效/entity.player.attack.weak.2';
import 资_555 from 'asset:音效/entity.player.attack.weak.3';
import 资_556 from 'asset:音效/entity.player.attack.weak.4';
import 资_557 from 'asset:音效/entity.player.big_fall';
import 资_558 from 'asset:音效/entity.player.hurt.1';
import 资_559 from 'asset:音效/entity.player.hurt.2';
import 资_560 from 'asset:音效/entity.player.hurt.3';
import 资_561 from 'asset:音效/entity.player.levelup';
import 资_562 from 'asset:音效/entity.player.small_fall';
import 资_563 from 'asset:音效/entity.player.splash.1';
import 资_564 from 'asset:音效/entity.player.splash.2';
import 资_565 from 'asset:音效/entity.player.splash.high_speed';
import 资_566 from 'asset:音效/entity.splash_potion.break.1';
import 资_567 from 'asset:音效/entity.splash_potion.break.2';
import 资_568 from 'asset:音效/entity.splash_potion.break.3';
import 资_569 from 'asset:音效/entity.splash_potion.throw';
import 资_570 from 'asset:音效/entity.vex.ambient.1';
import 资_571 from 'asset:音效/entity.vex.ambient.2';
import 资_572 from 'asset:音效/entity.vex.ambient.3';
import 资_573 from 'asset:音效/entity.vex.ambient.4';
import 资_574 from 'asset:音效/entity.vex.charge.1';
import 资_575 from 'asset:音效/entity.vex.charge.2';
import 资_576 from 'asset:音效/entity.vex.charge.3';
import 资_577 from 'asset:音效/entity.vex.death.1';
import 资_578 from 'asset:音效/entity.vex.death.2';
import 资_579 from 'asset:音效/entity.vex.hurt.1';
import 资_580 from 'asset:音效/entity.vex.hurt.2';
import 资_581 from 'asset:音效/entity.villager.work_cartographer.1';
import 资_582 from 'asset:音效/entity.villager.work_cartographer.2';
import 资_583 from 'asset:音效/entity.villager.work_cartographer.3';
import 资_584 from 'asset:音效/entity.warden.agitated.1';
import 资_585 from 'asset:音效/entity.warden.agitated.2';
import 资_586 from 'asset:音效/entity.warden.agitated.3';
import 资_587 from 'asset:音效/entity.warden.agitated.4';
import 资_588 from 'asset:音效/entity.warden.agitated.5';
import 资_589 from 'asset:音效/entity.warden.agitated.6';
import 资_590 from 'asset:音效/entity.warden.ambient.1';
import 资_591 from 'asset:音效/entity.warden.ambient.10';
import 资_592 from 'asset:音效/entity.warden.ambient.11';
import 资_593 from 'asset:音效/entity.warden.ambient.12';
import 资_594 from 'asset:音效/entity.warden.ambient.2';
import 资_595 from 'asset:音效/entity.warden.ambient.3';
import 资_596 from 'asset:音效/entity.warden.ambient.4';
import 资_597 from 'asset:音效/entity.warden.ambient.5';
import 资_598 from 'asset:音效/entity.warden.ambient.6';
import 资_599 from 'asset:音效/entity.warden.ambient.7';
import 资_600 from 'asset:音效/entity.warden.ambient.8';
import 资_601 from 'asset:音效/entity.warden.ambient.9';
import 资_602 from 'asset:音效/entity.warden.angry.1';
import 资_603 from 'asset:音效/entity.warden.angry.2';
import 资_604 from 'asset:音效/entity.warden.angry.3';
import 资_605 from 'asset:音效/entity.warden.angry.4';
import 资_606 from 'asset:音效/entity.warden.angry.5';
import 资_607 from 'asset:音效/entity.warden.angry.6';
import 资_608 from 'asset:音效/entity.warden.attack_impact.1';
import 资_609 from 'asset:音效/entity.warden.attack_impact.2';
import 资_610 from 'asset:音效/entity.warden.death.1';
import 资_611 from 'asset:音效/entity.warden.death.2';
import 资_612 from 'asset:音效/entity.warden.emerge';
import 资_613 from 'asset:音效/entity.warden.heartbeat.1';
import 资_614 from 'asset:音效/entity.warden.heartbeat.2';
import 资_615 from 'asset:音效/entity.warden.heartbeat.3';
import 资_616 from 'asset:音效/entity.warden.heartbeat.4';
import 资_617 from 'asset:音效/entity.warden.hurt.1';
import 资_618 from 'asset:音效/entity.warden.hurt.2';
import 资_619 from 'asset:音效/entity.warden.hurt.3';
import 资_620 from 'asset:音效/entity.warden.hurt.4';
import 资_621 from 'asset:音效/entity.warden.nearby_close.1';
import 资_622 from 'asset:音效/entity.warden.nearby_close.2';
import 资_623 from 'asset:音效/entity.warden.nearby_close.3';
import 资_624 from 'asset:音效/entity.warden.nearby_close.4';
import 资_625 from 'asset:音效/entity.warden.nearby_closer.1';
import 资_626 from 'asset:音效/entity.warden.nearby_closer.2';
import 资_627 from 'asset:音效/entity.warden.nearby_closer.3';
import 资_628 from 'asset:音效/entity.warden.nearby_closest.1';
import 资_629 from 'asset:音效/entity.warden.nearby_closest.2';
import 资_630 from 'asset:音效/entity.warden.nearby_closest.3';
import 资_631 from 'asset:音效/entity.warden.roar.1';
import 资_632 from 'asset:音效/entity.warden.roar.2';
import 资_633 from 'asset:音效/entity.warden.roar.3';
import 资_634 from 'asset:音效/entity.warden.roar.4';
import 资_635 from 'asset:音效/entity.warden.roar.5';
import 资_636 from 'asset:音效/entity.warden.sniff.1';
import 资_637 from 'asset:音效/entity.warden.sniff.2';
import 资_638 from 'asset:音效/entity.warden.sniff.3';
import 资_639 from 'asset:音效/entity.warden.sniff.4';
import 资_640 from 'asset:音效/entity.warden.sonic_boom.1';
import 资_641 from 'asset:音效/entity.warden.sonic_boom.2';
import 资_642 from 'asset:音效/entity.warden.sonic_boom.3';
import 资_643 from 'asset:音效/entity.warden.sonic_boom.4';
import 资_644 from 'asset:音效/entity.warden.sonic_charge.1';
import 资_645 from 'asset:音效/entity.warden.sonic_charge.2';
import 资_646 from 'asset:音效/entity.warden.sonic_charge.3';
import 资_647 from 'asset:音效/entity.warden.sonic_charge.4';
import 资_648 from 'asset:音效/entity.warden.step.1';
import 资_649 from 'asset:音效/entity.warden.step.2';
import 资_650 from 'asset:音效/entity.warden.step.3';
import 资_651 from 'asset:音效/entity.warden.step.4';
import 资_652 from 'asset:音效/entity.warden.tendril_clicks.1';
import 资_653 from 'asset:音效/entity.warden.tendril_clicks.2';
import 资_654 from 'asset:音效/entity.warden.tendril_clicks.3';
import 资_655 from 'asset:音效/entity.warden.tendril_clicks.4';
import 资_656 from 'asset:音效/entity.warden.tendril_clicks.5';
import 资_657 from 'asset:音效/entity.warden.tendril_clicks.6';
import 资_658 from 'asset:音效/entity.wither.hurt.1';
import 资_659 from 'asset:音效/entity.wither.hurt.2';
import 资_660 from 'asset:音效/entity.wither.hurt.3';
import 资_661 from 'asset:音效/entity.wither.hurt.4';
import 资_662 from 'asset:音效/epicfight.entity.hit.blade.1';
import 资_663 from 'asset:音效/epicfight.entity.hit.blade.2';
import 资_664 from 'asset:音效/epicfight.entity.hit.blade.3';
import 资_665 from 'asset:音效/irons_spellbooks.force_impact';
import 资_666 from 'asset:音效/item.armor.equip_generic.1';
import 资_667 from 'asset:音效/item.armor.equip_generic.2';
import 资_668 from 'asset:音效/item.armor.equip_generic.3';
import 资_669 from 'asset:音效/item.armor.equip_generic.4';
import 资_670 from 'asset:音效/item.armor.equip_generic.5';
import 资_671 from 'asset:音效/item.armor.equip_generic.6';
import 资_672 from 'asset:音效/item.book.page_turn.1';
import 资_673 from 'asset:音效/item.book.page_turn.2';
import 资_674 from 'asset:音效/item.book.page_turn.3';
import 资_675 from 'asset:音效/item.book.put.1';
import 资_676 from 'asset:音效/item.book.put.2';
import 资_677 from 'asset:音效/item.elytra.flying';
import 资_678 from 'asset:音效/item.spyglass.stop_using.1';
import 资_679 from 'asset:音效/item.spyglass.stop_using.2';
import 资_680 from 'asset:音效/item.spyglass.stop_using.3';
import 资_681 from 'asset:音效/item.spyglass.use.1';
import 资_682 from 'asset:音效/item.spyglass.use.2';
import 资_683 from 'asset:音效/item.spyglass.use.3';
import 资_684 from 'asset:音效/item.spyglass.use.4';
import 资_685 from 'asset:音效/item.trident.throw.1';
import 资_686 from 'asset:音效/item.trident.throw.2';
import 资_687 from 'asset:音效/twilightforest.block.twilightforest.boss_chest.appear';
import 资_688 from 'asset:音效/twilightforest.block.twilightforest.portal.whoosh';
import 资_689 from 'asset:音效/twilightforest.entity.twilightforest.alpha_yeti.death';
import 资_690 from 'asset:音效/twilightforest.entity.twilightforest.alpha_yeti.hurt.1';
import 资_691 from 'asset:音效/twilightforest.entity.twilightforest.alpha_yeti.hurt.2';
import 资_692 from 'asset:音效/twilightforest.entity.twilightforest.alpha_yeti.hurt.3';
import 资_693 from 'asset:音效/twilightforest.entity.twilightforest.hydra.death';
import 资_694 from 'asset:音效/twilightforest.entity.twilightforest.hydra.growl.1';
import 资_695 from 'asset:音效/twilightforest.entity.twilightforest.hydra.growl.2';
import 资_696 from 'asset:音效/twilightforest.entity.twilightforest.hydra.growl.3';
import 资_697 from 'asset:音效/twilightforest.entity.twilightforest.hydra.hurt.1';
import 资_698 from 'asset:音效/twilightforest.entity.twilightforest.hydra.hurt.2';
import 资_699 from 'asset:音效/twilightforest.entity.twilightforest.hydra.hurt.3';
import 资_700 from 'asset:音效/twilightforest.entity.twilightforest.hydra.hurt.4';
import 资_701 from 'asset:音效/twilightforest.entity.twilightforest.lich.death';
import 资_702 from 'asset:音效/twilightforest.entity.twilightforest.lich.hurt.1';
import 资_703 from 'asset:音效/twilightforest.entity.twilightforest.lich.hurt.2';
import 资_704 from 'asset:音效/twilightforest.entity.twilightforest.lich.hurt.3';
import 资_705 from 'asset:音效/twilightforest.entity.twilightforest.lich.hurt.4';
import 资_706 from 'asset:音效/twilightforest.entity.twilightforest.naga.hurt.1';
import 资_707 from 'asset:音效/twilightforest.entity.twilightforest.naga.hurt.2';
import 资_708 from 'asset:音效/twilightforest.entity.twilightforest.naga.hurt.3';
import 资_709 from 'asset:音效/twilightforest.entity.twilightforest.shield.break';
import 资_710 from 'asset:音效/twilightforest.entity.twilightforest.snow_queen.break';
import 资_711 from 'asset:音效/twilightforest.entity.twilightforest.snow_queen.death.1';
import 资_712 from 'asset:音效/twilightforest.entity.twilightforest.snow_queen.death.2';
import 资_713 from 'asset:音效/twilightforest.entity.twilightforest.snow_queen.hurt.1';
import 资_714 from 'asset:音效/twilightforest.entity.twilightforest.snow_queen.hurt.2';
import 资_715 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.death';
import 资_716 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.hurt.1';
import 资_717 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.hurt.2';
import 资_718 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.hurt.3';
import 资_719 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.hurt.4';
import 资_720 from 'asset:音效/twilightforest.entity.twilightforest.ur_ghast.hurt.5';
import 资_721 from 'asset:音效/ui.button.click';

type SoundFile = {
  文件: string;
  索引路径: string;
  hash: string;
  时长: number;
  volume: number;
  pitch: number;
  weight: number;
  attenuation_distance: number;
};
const sfxTable = sfxTableJson as unknown as Record<string, { subtitle: string | null; 声音: SoundFile[] }>;
// 事件名：原版不带命名空间（block.sculk_shrieker.shriek），模组带（efn:parry、twilightforest:entity.twilightforest.naga.hurt），见 游戏音效.json
export type SoundEventName = string;

const ctx = 资产目录({ './ambient.cave.1.ogg': 资_0, './ambient.cave.10.ogg': 资_1, './ambient.cave.11.ogg': 资_2, './ambient.cave.12.ogg': 资_3, './ambient.cave.13.ogg': 资_4, './ambient.cave.14.ogg': 资_5, './ambient.cave.15.ogg': 资_6, './ambient.cave.16.ogg': 资_7, './ambient.cave.17.ogg': 资_8, './ambient.cave.18.ogg': 资_9, './ambient.cave.19.ogg': 资_10, './ambient.cave.2.ogg': 资_11, './ambient.cave.3.ogg': 资_12, './ambient.cave.4.ogg': 资_13, './ambient.cave.5.ogg': 资_14, './ambient.cave.6.ogg': 资_15, './ambient.cave.7.ogg': 资_16, './ambient.cave.8.ogg': 资_17, './ambient.cave.9.ogg': 资_18, './block.amethyst_block.hit.1.ogg': 资_19, './block.amethyst_block.hit.10.ogg': 资_20, './block.amethyst_block.hit.11.ogg': 资_21, './block.amethyst_block.hit.12.ogg': 资_22, './block.amethyst_block.hit.2.ogg': 资_23, './block.amethyst_block.hit.3.ogg': 资_24, './block.amethyst_block.hit.4.ogg': 资_25, './block.amethyst_block.hit.5.ogg': 资_26, './block.amethyst_block.hit.6.ogg': 资_27, './block.amethyst_block.hit.7.ogg': 资_28, './block.amethyst_block.hit.8.ogg': 资_29, './block.amethyst_block.hit.9.ogg': 资_30, './block.azalea_leaves.break.1.ogg': 资_31, './block.azalea_leaves.break.10.ogg': 资_32, './block.azalea_leaves.break.11.ogg': 资_33, './block.azalea_leaves.break.12.ogg': 资_34, './block.azalea_leaves.break.13.ogg': 资_35, './block.azalea_leaves.break.14.ogg': 资_36, './block.azalea_leaves.break.2.ogg': 资_37, './block.azalea_leaves.break.3.ogg': 资_38, './block.azalea_leaves.break.4.ogg': 资_39, './block.azalea_leaves.break.5.ogg': 资_40, './block.azalea_leaves.break.6.ogg': 资_41, './block.azalea_leaves.break.7.ogg': 资_42, './block.azalea_leaves.break.8.ogg': 资_43, './block.azalea_leaves.break.9.ogg': 资_44, './block.azalea_leaves.hit.1.ogg': 资_45, './block.azalea_leaves.hit.2.ogg': 资_46, './block.azalea_leaves.hit.3.ogg': 资_47, './block.azalea_leaves.hit.4.ogg': 资_48, './block.azalea_leaves.hit.5.ogg': 资_49, './block.calcite.break.1.ogg': 资_50, './block.calcite.break.2.ogg': 资_51, './block.calcite.break.3.ogg': 资_52, './block.calcite.break.4.ogg': 资_53, './block.candle.extinguish.1.ogg': 资_54, './block.candle.extinguish.10.ogg': 资_55, './block.candle.extinguish.11.ogg': 资_56, './block.candle.extinguish.12.ogg': 资_57, './block.candle.extinguish.13.ogg': 资_58, './block.candle.extinguish.14.ogg': 资_59, './block.candle.extinguish.15.ogg': 资_60, './block.candle.extinguish.16.ogg': 资_61, './block.candle.extinguish.17.ogg': 资_62, './block.candle.extinguish.18.ogg': 资_63, './block.candle.extinguish.2.ogg': 资_64, './block.candle.extinguish.3.ogg': 资_65, './block.candle.extinguish.4.ogg': 资_66, './block.candle.extinguish.5.ogg': 资_67, './block.candle.extinguish.6.ogg': 资_68, './block.candle.extinguish.7.ogg': 资_69, './block.candle.extinguish.8.ogg': 资_70, './block.candle.extinguish.9.ogg': 资_71, './block.chain.hit.1.ogg': 资_72, './block.chain.hit.2.ogg': 资_73, './block.chain.hit.3.ogg': 资_74, './block.chain.hit.4.ogg': 资_75, './block.chain.hit.5.ogg': 资_76, './block.chain.hit.6.ogg': 资_77, './block.chest.close.1.ogg': 资_78, './block.chest.close.2.ogg': 资_79, './block.chest.close.3.ogg': 资_80, './block.chest.open.ogg': 资_81, './block.deepslate.break.1.ogg': 资_82, './block.deepslate.break.2.ogg': 资_83, './block.deepslate.break.3.ogg': 资_84, './block.deepslate.break.4.ogg': 资_85, './block.deepslate.fall.1.ogg': 资_86, './block.deepslate.fall.2.ogg': 资_87, './block.deepslate.fall.3.ogg': 资_88, './block.deepslate.fall.4.ogg': 资_89, './block.deepslate.fall.5.ogg': 资_90, './block.deepslate.fall.6.ogg': 资_91, './block.deepslate.step.1.ogg': 资_92, './block.deepslate.step.2.ogg': 资_93, './block.deepslate.step.3.ogg': 资_94, './block.deepslate.step.4.ogg': 资_95, './block.deepslate.step.5.ogg': 资_96, './block.deepslate.step.6.ogg': 资_97, './block.deepslate_bricks.break.1.ogg': 资_98, './block.deepslate_bricks.break.2.ogg': 资_99, './block.deepslate_bricks.break.3.ogg': 资_100, './block.deepslate_bricks.break.4.ogg': 资_101, './block.deepslate_bricks.break.5.ogg': 资_102, './block.deepslate_bricks.break.6.ogg': 资_103, './block.deepslate_bricks.step.1.ogg': 资_104, './block.deepslate_bricks.step.2.ogg': 资_105, './block.deepslate_bricks.step.3.ogg': 资_106, './block.deepslate_bricks.step.4.ogg': 资_107, './block.deepslate_bricks.step.5.ogg': 资_108, './block.deepslate_tiles.step.1.ogg': 资_109, './block.deepslate_tiles.step.2.ogg': 资_110, './block.deepslate_tiles.step.3.ogg': 资_111, './block.deepslate_tiles.step.4.ogg': 资_112, './block.deepslate_tiles.step.5.ogg': 资_113, './block.glass.break.1.ogg': 资_114, './block.glass.break.2.ogg': 资_115, './block.glass.break.3.ogg': 资_116, './block.glass.hit.1.ogg': 资_117, './block.glass.hit.2.ogg': 资_118, './block.glass.hit.3.ogg': 资_119, './block.glass.hit.4.ogg': 资_120, './block.glass.hit.5.ogg': 资_121, './block.glass.hit.6.ogg': 资_122, './block.grass.break.1.ogg': 资_123, './block.grass.break.2.ogg': 资_124, './block.grass.break.3.ogg': 资_125, './block.grass.break.4.ogg': 资_126, './block.grass.hit.1.ogg': 资_127, './block.grass.hit.2.ogg': 资_128, './block.grass.hit.3.ogg': 资_129, './block.grass.hit.4.ogg': 资_130, './block.grass.hit.5.ogg': 资_131, './block.grass.hit.6.ogg': 资_132, './block.grass.step.1.ogg': 资_133, './block.grass.step.2.ogg': 资_134, './block.grass.step.3.ogg': 资_135, './block.grass.step.4.ogg': 资_136, './block.grass.step.5.ogg': 资_137, './block.grass.step.6.ogg': 资_138, './block.gravel.break.1.ogg': 资_139, './block.gravel.break.2.ogg': 资_140, './block.gravel.break.3.ogg': 资_141, './block.gravel.break.4.ogg': 资_142, './block.gravel.hit.1.ogg': 资_143, './block.gravel.hit.2.ogg': 资_144, './block.gravel.hit.3.ogg': 资_145, './block.gravel.hit.4.ogg': 资_146, './block.ladder.break.1.ogg': 资_147, './block.ladder.break.2.ogg': 资_148, './block.ladder.break.3.ogg': 资_149, './block.ladder.break.4.ogg': 资_150, './block.ladder.hit.1.ogg': 资_151, './block.ladder.hit.2.ogg': 资_152, './block.ladder.hit.3.ogg': 资_153, './block.ladder.hit.4.ogg': 资_154, './block.ladder.hit.5.ogg': 资_155, './block.lever.click.ogg': 资_156, './block.metal.break.1.ogg': 资_157, './block.metal.break.2.ogg': 资_158, './block.metal.break.3.ogg': 资_159, './block.metal.break.4.ogg': 资_160, './block.metal.hit.1.ogg': 资_161, './block.metal.hit.2.ogg': 资_162, './block.metal.hit.3.ogg': 资_163, './block.metal.hit.4.ogg': 资_164, './block.metal.hit.5.ogg': 资_165, './block.metal.hit.6.ogg': 资_166, './block.portal.travel.ogg': 资_167, './block.portal.trigger.ogg': 资_168, './block.respawn_anchor.set_spawn.1.ogg': 资_169, './block.respawn_anchor.set_spawn.2.ogg': 资_170, './block.respawn_anchor.set_spawn.3.ogg': 资_171, './block.sculk.break.1.ogg': 资_172, './block.sculk.break.10.ogg': 资_173, './block.sculk.break.11.ogg': 资_174, './block.sculk.break.12.ogg': 资_175, './block.sculk.break.13.ogg': 资_176, './block.sculk.break.14.ogg': 资_177, './block.sculk.break.2.ogg': 资_178, './block.sculk.break.3.ogg': 资_179, './block.sculk.break.4.ogg': 资_180, './block.sculk.break.5.ogg': 资_181, './block.sculk.break.6.ogg': 资_182, './block.sculk.break.7.ogg': 资_183, './block.sculk.break.8.ogg': 资_184, './block.sculk.break.9.ogg': 资_185, './block.sculk.spread.1.ogg': 资_186, './block.sculk.spread.2.ogg': 资_187, './block.sculk.spread.3.ogg': 资_188, './block.sculk.spread.4.ogg': 资_189, './block.sculk.spread.5.ogg': 资_190, './block.sculk.step.1.ogg': 资_191, './block.sculk.step.2.ogg': 资_192, './block.sculk.step.3.ogg': 资_193, './block.sculk.step.4.ogg': 资_194, './block.sculk.step.5.ogg': 资_195, './block.sculk.step.6.ogg': 资_196, './block.sculk_catalyst.bloom.1.ogg': 资_197, './block.sculk_catalyst.bloom.10.ogg': 资_198, './block.sculk_catalyst.bloom.11.ogg': 资_199, './block.sculk_catalyst.bloom.12.ogg': 资_200, './block.sculk_catalyst.bloom.13.ogg': 资_201, './block.sculk_catalyst.bloom.2.ogg': 资_202, './block.sculk_catalyst.bloom.3.ogg': 资_203, './block.sculk_catalyst.bloom.4.ogg': 资_204, './block.sculk_catalyst.bloom.5.ogg': 资_205, './block.sculk_catalyst.bloom.6.ogg': 资_206, './block.sculk_catalyst.bloom.7.ogg': 资_207, './block.sculk_catalyst.bloom.8.ogg': 资_208, './block.sculk_catalyst.bloom.9.ogg': 资_209, './block.sculk_sensor.clicking.1.ogg': 资_210, './block.sculk_sensor.clicking.2.ogg': 资_211, './block.sculk_sensor.clicking.3.ogg': 资_212, './block.sculk_sensor.clicking.4.ogg': 资_213, './block.sculk_sensor.clicking.5.ogg': 资_214, './block.sculk_sensor.clicking.6.ogg': 资_215, './block.sculk_sensor.clicking_stop.1.ogg': 资_216, './block.sculk_sensor.clicking_stop.2.ogg': 资_217, './block.sculk_sensor.clicking_stop.3.ogg': 资_218, './block.sculk_sensor.clicking_stop.4.ogg': 资_219, './block.sculk_sensor.clicking_stop.5.ogg': 资_220, './block.sculk_shrieker.shriek.1.ogg': 资_221, './block.sculk_shrieker.shriek.2.ogg': 资_222, './block.sculk_shrieker.shriek.3.ogg': 资_223, './block.sculk_shrieker.shriek.4.ogg': 资_224, './block.sculk_shrieker.shriek.5.ogg': 资_225, './block.snow.break.1.ogg': 资_226, './block.snow.break.2.ogg': 资_227, './block.snow.break.3.ogg': 资_228, './block.snow.break.4.ogg': 资_229, './block.snow.hit.1.ogg': 资_230, './block.snow.hit.2.ogg': 资_231, './block.snow.hit.3.ogg': 资_232, './block.snow.hit.4.ogg': 资_233, './block.snow.step.1.ogg': 资_234, './block.snow.step.2.ogg': 资_235, './block.snow.step.3.ogg': 资_236, './block.snow.step.4.ogg': 资_237, './block.stone.break.1.ogg': 资_238, './block.stone.break.2.ogg': 资_239, './block.stone.break.3.ogg': 资_240, './block.stone.break.4.ogg': 资_241, './block.stone.fall.1.ogg': 资_242, './block.stone.fall.2.ogg': 资_243, './block.stone.fall.3.ogg': 资_244, './block.stone.fall.4.ogg': 资_245, './block.stone.fall.5.ogg': 资_246, './block.stone.fall.6.ogg': 资_247, './block.stone.hit.1.ogg': 资_248, './block.stone.hit.2.ogg': 资_249, './block.stone.hit.3.ogg': 资_250, './block.stone.hit.4.ogg': 资_251, './block.stone.hit.5.ogg': 资_252, './block.stone.hit.6.ogg': 资_253, './block.stone.place.1.ogg': 资_254, './block.stone.place.2.ogg': 资_255, './block.stone.place.3.ogg': 资_256, './block.stone.place.4.ogg': 资_257, './block.stone.step.1.ogg': 资_258, './block.stone.step.2.ogg': 资_259, './block.stone.step.3.ogg': 资_260, './block.stone.step.4.ogg': 资_261, './block.stone.step.5.ogg': 资_262, './block.stone.step.6.ogg': 资_263, './block.tuff.break.1.ogg': 资_264, './block.tuff.break.2.ogg': 资_265, './block.tuff.break.3.ogg': 资_266, './block.tuff.break.4.ogg': 资_267, './block.water.ambient.ogg': 资_268, './block.wood.break.1.ogg': 资_269, './block.wood.break.2.ogg': 资_270, './block.wood.break.3.ogg': 资_271, './block.wood.break.4.ogg': 资_272, './block.wood.hit.1.ogg': 资_273, './block.wood.hit.2.ogg': 资_274, './block.wood.hit.3.ogg': 资_275, './block.wood.hit.4.ogg': 资_276, './block.wood.hit.5.ogg': 资_277, './block.wood.hit.6.ogg': 资_278, './block.wood.place.1.ogg': 资_279, './block.wood.place.2.ogg': 资_280, './block.wood.place.3.ogg': 资_281, './block.wood.place.4.ogg': 资_282, './block.wood.step.1.ogg': 资_283, './block.wood.step.2.ogg': 资_284, './block.wood.step.3.ogg': 资_285, './block.wood.step.4.ogg': 资_286, './block.wood.step.5.ogg': 资_287, './block.wood.step.6.ogg': 资_288, './block.wool.break.1.ogg': 资_289, './block.wool.break.2.ogg': 资_290, './block.wool.break.3.ogg': 资_291, './block.wool.break.4.ogg': 资_292, './block.wool.place.1.ogg': 资_293, './block.wool.place.2.ogg': 资_294, './block.wool.place.3.ogg': 资_295, './block.wool.place.4.ogg': 资_296, './block.wool.step.1.ogg': 资_297, './block.wool.step.2.ogg': 资_298, './block.wool.step.3.ogg': 资_299, './block.wool.step.4.ogg': 资_300, './cataclysm.heavy_smash.ogg': 资_301, './create.blaze_munch.1.ogg': 资_302, './create.blaze_munch.2.ogg': 资_303, './create.blaze_munch.3.ogg': 资_304, './create.chiff.ogg': 资_305, './create.cogs.ogg': 资_306, './create.contraption_assemble.1.ogg': 资_307, './create.contraption_assemble.2.ogg': 资_308, './create.contraption_assemble.3.ogg': 资_309, './create.contraption_assemble.4.ogg': 资_310, './create.contraption_assemble.5.ogg': 资_311, './create.contraption_assemble_compounded_1.ogg': 资_312, './create.contraption_disassemble.1.ogg': 资_313, './create.contraption_disassemble.2.ogg': 资_314, './create.contraption_disassemble.3.ogg': 资_315, './create.contraption_disassemble.4.ogg': 资_316, './create.crafter_click.1.ogg': 资_317, './create.crafter_click.2.ogg': 资_318, './create.crafter_click.3.ogg': 资_319, './create.crafter_click.4.ogg': 资_320, './create.crafter_click.5.ogg': 资_321, './create.crafter_click.6.ogg': 资_322, './create.crafter_click_compounded_1.1.ogg': 资_323, './create.crafter_click_compounded_1.2.ogg': 资_324, './create.crafter_click_compounded_1.3.ogg': 资_325, './create.crafter_click_compounded_1.4.ogg': 资_326, './create.crafter_click_compounded_1.5.ogg': 资_327, './create.crafter_craft.ogg': 资_328, './create.cranking.1.ogg': 资_329, './create.cranking.2.ogg': 资_330, './create.cranking.3.ogg': 资_331, './create.cranking.4.ogg': 资_332, './create.cranking_compounded_1.ogg': 资_333, './create.crushing_1.1.ogg': 资_334, './create.crushing_1.2.ogg': 资_335, './create.crushing_1.3.ogg': 资_336, './create.crushing_1.4.ogg': 资_337, './create.crushing_1.5.ogg': 资_338, './create.crushing_1.6.ogg': 资_339, './create.crushing_2.1.ogg': 资_340, './create.crushing_2.2.ogg': 资_341, './create.crushing_2.3.ogg': 资_342, './create.crushing_2.4.ogg': 资_343, './create.crushing_3.1.ogg': 资_344, './create.crushing_3.2.ogg': 资_345, './create.crushing_3.3.ogg': 资_346, './create.crushing_3.4.ogg': 资_347, './create.crushing_3.5.ogg': 资_348, './create.crushing_3.6.ogg': 资_349, './create.crushing_3.7.ogg': 资_350, './create.crushing_3.8.ogg': 资_351, './create.depot_plop.1.ogg': 资_352, './create.depot_plop.2.ogg': 资_353, './create.depot_plop.3.ogg': 资_354, './create.depot_plop.4.ogg': 资_355, './create.depot_slide.1.ogg': 资_356, './create.depot_slide.2.ogg': 资_357, './create.depot_slide.3.ogg': 资_358, './create.depot_slide.4.ogg': 资_359, './create.funnel_flap.1.ogg': 资_360, './create.funnel_flap.2.ogg': 资_361, './create.funnel_flap.3.ogg': 资_362, './create.funnel_flap.4.ogg': 资_363, './create.funnel_flap_compounded_1.1.ogg': 资_364, './create.funnel_flap_compounded_1.2.ogg': 资_365, './create.funnel_flap_compounded_1.3.ogg': 资_366, './create.funnel_flap_compounded_1.4.ogg': 资_367, './create.fwoomp.ogg': 资_368, './create.item_hatch.1.ogg': 资_369, './create.item_hatch.2.ogg': 资_370, './create.item_hatch_compounded_1.1.ogg': 资_371, './create.item_hatch_compounded_1.2.ogg': 资_372, './create.item_hatch_compounded_1.3.ogg': 资_373, './create.item_hatch_compounded_1.4.ogg': 资_374, './create.item_hatch_compounded_1.5.ogg': 资_375, './create.item_hatch_compounded_1.6.ogg': 资_376, './create.item_hatch_compounded_1.7.ogg': 资_377, './create.item_hatch_compounded_1.8.ogg': 资_378, './create.mechanical_press_activation.ogg': 资_379, './create.mechanical_press_activation_belt.1.ogg': 资_380, './create.mechanical_press_activation_belt.2.ogg': 资_381, './create.mechanical_press_activation_belt.3.ogg': 资_382, './create.mechanical_press_activation_belt.4.ogg': 资_383, './create.mechanical_press_activation_belt_compounded_1.ogg': 资_384, './create.mechanical_press_activation_compounded_1.ogg': 资_385, './create.mixing.1.ogg': 资_386, './create.mixing.2.ogg': 资_387, './create.mixing.3.ogg': 资_388, './create.mixing.4.ogg': 资_389, './create.mixing_compounded_1.1.ogg': 资_390, './create.mixing_compounded_1.2.ogg': 资_391, './create.mixing_compounded_1.3.ogg': 资_392, './create.mixing_compounded_1.4.ogg': 资_393, './create.mixing_compounded_1.5.ogg': 资_394, './create.mixing_compounded_1.6.ogg': 资_395, './create.potato_hit.1.ogg': 资_396, './create.potato_hit.2.ogg': 资_397, './create.potato_hit.3.ogg': 资_398, './create.potato_hit_compounded_1.1.ogg': 资_399, './create.potato_hit_compounded_1.2.ogg': 资_400, './create.potato_hit_compounded_1.3.ogg': 资_401, './create.potato_hit_compounded_1.4.ogg': 资_402, './create.potato_hit_compounded_1.5.ogg': 资_403, './create.potato_hit_compounded_1.6.ogg': 资_404, './create.sanding_long.ogg': 资_405, './create.sanding_short.1.ogg': 资_406, './create.sanding_short.2.ogg': 资_407, './create.saw_activate_stone.1.ogg': 资_408, './create.saw_activate_stone.2.ogg': 资_409, './create.saw_activate_stone.3.ogg': 资_410, './create.saw_activate_stone.4.ogg': 资_411, './create.saw_activate_wood.1.ogg': 资_412, './create.saw_activate_wood.2.ogg': 资_413, './create.saw_activate_wood.3.ogg': 资_414, './create.saw_activate_wood.4.ogg': 资_415, './create.saw_activate_wood.5.ogg': 资_416, './create.saw_activate_wood.6.ogg': 资_417, './create.schematicannon_launch_block.1.ogg': 资_418, './create.schematicannon_launch_block.2.ogg': 资_419, './create.schematicannon_launch_block.3.ogg': 资_420, './create.schematicannon_launch_block.4.ogg': 资_421, './create.slime_added.1.ogg': 资_422, './create.slime_added.2.ogg': 资_423, './create.slime_added.3.ogg': 资_424, './create.slime_added.4.ogg': 资_425, './create.spout.1.ogg': 资_426, './create.spout.2.ogg': 资_427, './create.spout.3.ogg': 资_428, './create.spout.4.ogg': 资_429, './create.steam.ogg': 资_430, './create.train.ogg': 资_431, './create.train2.ogg': 资_432, './create.train3.ogg': 资_433, './create.whistle.ogg': 资_434, './create.whistle_high.ogg': 资_435, './create.whistle_low.ogg': 资_436, './create.whistle_train.ogg': 资_437, './create.whistle_train_low.ogg': 资_438, './create.whistle_train_manual.ogg': 资_439, './create.whistle_train_manual_end.ogg': 资_440, './create.whistle_train_manual_low.ogg': 资_441, './create.whistle_train_manual_low_end.ogg': 资_442, './create.wrench_remove.ogg': 资_443, './create.wrench_remove_compounded_1.1.ogg': 资_444, './create.wrench_remove_compounded_1.2.ogg': 资_445, './create.wrench_remove_compounded_1.3.ogg': 资_446, './create.wrench_remove_compounded_1.4.ogg': 资_447, './create.wrench_remove_compounded_1.5.ogg': 资_448, './create.wrench_remove_compounded_1.6.ogg': 资_449, './create.wrench_rotate.1.ogg': 资_450, './create.wrench_rotate.2.ogg': 资_451, './create.wrench_rotate.3.ogg': 资_452, './efn.parry.1.ogg': 资_453, './efn.parry.2.ogg': 资_454, './efn.parry.3.ogg': 资_455, './efn.parry.4.ogg': 资_456, './efn.whoosh_light_1.ogg': 资_457, './entity.arrow.hit.1.ogg': 资_458, './entity.arrow.hit.2.ogg': 资_459, './entity.arrow.hit.3.ogg': 资_460, './entity.arrow.hit.4.ogg': 资_461, './entity.arrow.shoot.ogg': 资_462, './entity.creeper.hurt.1.ogg': 资_463, './entity.creeper.hurt.2.ogg': 资_464, './entity.creeper.hurt.3.ogg': 资_465, './entity.creeper.hurt.4.ogg': 资_466, './entity.evoker.cast_spell.1.ogg': 资_467, './entity.evoker.cast_spell.2.ogg': 资_468, './entity.evoker.prepare_summon.ogg': 资_469, './entity.experience_orb.pickup.ogg': 资_470, './entity.generic.big_fall.ogg': 资_471, './entity.generic.death.1.ogg': 资_472, './entity.generic.death.2.ogg': 资_473, './entity.generic.death.3.ogg': 资_474, './entity.generic.explode.1.ogg': 资_475, './entity.generic.explode.2.ogg': 资_476, './entity.generic.explode.3.ogg': 资_477, './entity.generic.explode.4.ogg': 资_478, './entity.generic.hurt.1.ogg': 资_479, './entity.generic.hurt.2.ogg': 资_480, './entity.generic.hurt.3.ogg': 资_481, './entity.generic.small_fall.ogg': 资_482, './entity.generic.splash.1.ogg': 资_483, './entity.generic.splash.2.ogg': 资_484, './entity.ghast.shoot.ogg': 资_485, './entity.horse.ambient.1.ogg': 资_486, './entity.horse.ambient.2.ogg': 资_487, './entity.horse.ambient.3.ogg': 资_488, './entity.horse.breathe.1.ogg': 资_489, './entity.horse.breathe.2.ogg': 资_490, './entity.horse.breathe.3.ogg': 资_491, './entity.horse.death.ogg': 资_492, './entity.horse.gallop.1.ogg': 资_493, './entity.horse.gallop.2.ogg': 资_494, './entity.horse.gallop.3.ogg': 资_495, './entity.horse.gallop.4.ogg': 资_496, './entity.horse.hurt.1.ogg': 资_497, './entity.horse.hurt.2.ogg': 资_498, './entity.horse.hurt.3.ogg': 资_499, './entity.horse.hurt.4.ogg': 资_500, './entity.horse.jump.ogg': 资_501, './entity.horse.land.ogg': 资_502, './entity.horse.step.1.ogg': 资_503, './entity.horse.step.2.ogg': 资_504, './entity.horse.step.3.ogg': 资_505, './entity.horse.step.4.ogg': 资_506, './entity.horse.step.5.ogg': 资_507, './entity.horse.step.6.ogg': 资_508, './entity.hostile.death.1.ogg': 资_509, './entity.hostile.death.2.ogg': 资_510, './entity.hostile.death.3.ogg': 资_511, './entity.hostile.hurt.1.ogg': 资_512, './entity.hostile.hurt.2.ogg': 资_513, './entity.hostile.hurt.3.ogg': 资_514, './entity.illusioner.cast_spell.1.ogg': 资_515, './entity.illusioner.cast_spell.2.ogg': 资_516, './entity.illusioner.mirror_move.1.ogg': 资_517, './entity.illusioner.mirror_move.2.ogg': 资_518, './entity.illusioner.prepare_mirror.ogg': 资_519, './entity.item.break.ogg': 资_520, './entity.item.pickup.ogg': 资_521, './entity.lightning_bolt.impact.1.ogg': 资_522, './entity.lightning_bolt.impact.2.ogg': 资_523, './entity.lightning_bolt.impact.3.ogg': 资_524, './entity.lightning_bolt.impact.4.ogg': 资_525, './entity.lightning_bolt.thunder.1.ogg': 资_526, './entity.lightning_bolt.thunder.2.ogg': 资_527, './entity.lightning_bolt.thunder.3.ogg': 资_528, './entity.minecart.inside.ogg': 资_529, './entity.painting.break.1.ogg': 资_530, './entity.painting.break.2.ogg': 资_531, './entity.painting.break.3.ogg': 资_532, './entity.player.attack.crit.1.ogg': 资_533, './entity.player.attack.crit.2.ogg': 资_534, './entity.player.attack.crit.3.ogg': 资_535, './entity.player.attack.knockback.1.ogg': 资_536, './entity.player.attack.knockback.2.ogg': 资_537, './entity.player.attack.knockback.3.ogg': 资_538, './entity.player.attack.knockback.4.ogg': 资_539, './entity.player.attack.strong.1.ogg': 资_540, './entity.player.attack.strong.2.ogg': 资_541, './entity.player.attack.strong.3.ogg': 资_542, './entity.player.attack.strong.4.ogg': 资_543, './entity.player.attack.strong.5.ogg': 资_544, './entity.player.attack.strong.6.ogg': 资_545, './entity.player.attack.sweep.1.ogg': 资_546, './entity.player.attack.sweep.2.ogg': 资_547, './entity.player.attack.sweep.3.ogg': 资_548, './entity.player.attack.sweep.4.ogg': 资_549, './entity.player.attack.sweep.5.ogg': 资_550, './entity.player.attack.sweep.6.ogg': 资_551, './entity.player.attack.sweep.7.ogg': 资_552, './entity.player.attack.weak.1.ogg': 资_553, './entity.player.attack.weak.2.ogg': 资_554, './entity.player.attack.weak.3.ogg': 资_555, './entity.player.attack.weak.4.ogg': 资_556, './entity.player.big_fall.ogg': 资_557, './entity.player.hurt.1.ogg': 资_558, './entity.player.hurt.2.ogg': 资_559, './entity.player.hurt.3.ogg': 资_560, './entity.player.levelup.ogg': 资_561, './entity.player.small_fall.ogg': 资_562, './entity.player.splash.1.ogg': 资_563, './entity.player.splash.2.ogg': 资_564, './entity.player.splash.high_speed.ogg': 资_565, './entity.splash_potion.break.1.ogg': 资_566, './entity.splash_potion.break.2.ogg': 资_567, './entity.splash_potion.break.3.ogg': 资_568, './entity.splash_potion.throw.ogg': 资_569, './entity.vex.ambient.1.ogg': 资_570, './entity.vex.ambient.2.ogg': 资_571, './entity.vex.ambient.3.ogg': 资_572, './entity.vex.ambient.4.ogg': 资_573, './entity.vex.charge.1.ogg': 资_574, './entity.vex.charge.2.ogg': 资_575, './entity.vex.charge.3.ogg': 资_576, './entity.vex.death.1.ogg': 资_577, './entity.vex.death.2.ogg': 资_578, './entity.vex.hurt.1.ogg': 资_579, './entity.vex.hurt.2.ogg': 资_580, './entity.villager.work_cartographer.1.ogg': 资_581, './entity.villager.work_cartographer.2.ogg': 资_582, './entity.villager.work_cartographer.3.ogg': 资_583, './entity.warden.agitated.1.ogg': 资_584, './entity.warden.agitated.2.ogg': 资_585, './entity.warden.agitated.3.ogg': 资_586, './entity.warden.agitated.4.ogg': 资_587, './entity.warden.agitated.5.ogg': 资_588, './entity.warden.agitated.6.ogg': 资_589, './entity.warden.ambient.1.ogg': 资_590, './entity.warden.ambient.10.ogg': 资_591, './entity.warden.ambient.11.ogg': 资_592, './entity.warden.ambient.12.ogg': 资_593, './entity.warden.ambient.2.ogg': 资_594, './entity.warden.ambient.3.ogg': 资_595, './entity.warden.ambient.4.ogg': 资_596, './entity.warden.ambient.5.ogg': 资_597, './entity.warden.ambient.6.ogg': 资_598, './entity.warden.ambient.7.ogg': 资_599, './entity.warden.ambient.8.ogg': 资_600, './entity.warden.ambient.9.ogg': 资_601, './entity.warden.angry.1.ogg': 资_602, './entity.warden.angry.2.ogg': 资_603, './entity.warden.angry.3.ogg': 资_604, './entity.warden.angry.4.ogg': 资_605, './entity.warden.angry.5.ogg': 资_606, './entity.warden.angry.6.ogg': 资_607, './entity.warden.attack_impact.1.ogg': 资_608, './entity.warden.attack_impact.2.ogg': 资_609, './entity.warden.death.1.ogg': 资_610, './entity.warden.death.2.ogg': 资_611, './entity.warden.emerge.ogg': 资_612, './entity.warden.heartbeat.1.ogg': 资_613, './entity.warden.heartbeat.2.ogg': 资_614, './entity.warden.heartbeat.3.ogg': 资_615, './entity.warden.heartbeat.4.ogg': 资_616, './entity.warden.hurt.1.ogg': 资_617, './entity.warden.hurt.2.ogg': 资_618, './entity.warden.hurt.3.ogg': 资_619, './entity.warden.hurt.4.ogg': 资_620, './entity.warden.nearby_close.1.ogg': 资_621, './entity.warden.nearby_close.2.ogg': 资_622, './entity.warden.nearby_close.3.ogg': 资_623, './entity.warden.nearby_close.4.ogg': 资_624, './entity.warden.nearby_closer.1.ogg': 资_625, './entity.warden.nearby_closer.2.ogg': 资_626, './entity.warden.nearby_closer.3.ogg': 资_627, './entity.warden.nearby_closest.1.ogg': 资_628, './entity.warden.nearby_closest.2.ogg': 资_629, './entity.warden.nearby_closest.3.ogg': 资_630, './entity.warden.roar.1.ogg': 资_631, './entity.warden.roar.2.ogg': 资_632, './entity.warden.roar.3.ogg': 资_633, './entity.warden.roar.4.ogg': 资_634, './entity.warden.roar.5.ogg': 资_635, './entity.warden.sniff.1.ogg': 资_636, './entity.warden.sniff.2.ogg': 资_637, './entity.warden.sniff.3.ogg': 资_638, './entity.warden.sniff.4.ogg': 资_639, './entity.warden.sonic_boom.1.ogg': 资_640, './entity.warden.sonic_boom.2.ogg': 资_641, './entity.warden.sonic_boom.3.ogg': 资_642, './entity.warden.sonic_boom.4.ogg': 资_643, './entity.warden.sonic_charge.1.ogg': 资_644, './entity.warden.sonic_charge.2.ogg': 资_645, './entity.warden.sonic_charge.3.ogg': 资_646, './entity.warden.sonic_charge.4.ogg': 资_647, './entity.warden.step.1.ogg': 资_648, './entity.warden.step.2.ogg': 资_649, './entity.warden.step.3.ogg': 资_650, './entity.warden.step.4.ogg': 资_651, './entity.warden.tendril_clicks.1.ogg': 资_652, './entity.warden.tendril_clicks.2.ogg': 资_653, './entity.warden.tendril_clicks.3.ogg': 资_654, './entity.warden.tendril_clicks.4.ogg': 资_655, './entity.warden.tendril_clicks.5.ogg': 资_656, './entity.warden.tendril_clicks.6.ogg': 资_657, './entity.wither.hurt.1.ogg': 资_658, './entity.wither.hurt.2.ogg': 资_659, './entity.wither.hurt.3.ogg': 资_660, './entity.wither.hurt.4.ogg': 资_661, './epicfight.entity.hit.blade.1.ogg': 资_662, './epicfight.entity.hit.blade.2.ogg': 资_663, './epicfight.entity.hit.blade.3.ogg': 资_664, './irons_spellbooks.force_impact.ogg': 资_665, './item.armor.equip_generic.1.ogg': 资_666, './item.armor.equip_generic.2.ogg': 资_667, './item.armor.equip_generic.3.ogg': 资_668, './item.armor.equip_generic.4.ogg': 资_669, './item.armor.equip_generic.5.ogg': 资_670, './item.armor.equip_generic.6.ogg': 资_671, './item.book.page_turn.1.ogg': 资_672, './item.book.page_turn.2.ogg': 资_673, './item.book.page_turn.3.ogg': 资_674, './item.book.put.1.ogg': 资_675, './item.book.put.2.ogg': 资_676, './item.elytra.flying.ogg': 资_677, './item.spyglass.stop_using.1.ogg': 资_678, './item.spyglass.stop_using.2.ogg': 资_679, './item.spyglass.stop_using.3.ogg': 资_680, './item.spyglass.use.1.ogg': 资_681, './item.spyglass.use.2.ogg': 资_682, './item.spyglass.use.3.ogg': 资_683, './item.spyglass.use.4.ogg': 资_684, './item.trident.throw.1.ogg': 资_685, './item.trident.throw.2.ogg': 资_686, './twilightforest.block.twilightforest.boss_chest.appear.ogg': 资_687, './twilightforest.block.twilightforest.portal.whoosh.ogg': 资_688, './twilightforest.entity.twilightforest.alpha_yeti.death.ogg': 资_689, './twilightforest.entity.twilightforest.alpha_yeti.hurt.1.ogg': 资_690, './twilightforest.entity.twilightforest.alpha_yeti.hurt.2.ogg': 资_691, './twilightforest.entity.twilightforest.alpha_yeti.hurt.3.ogg': 资_692, './twilightforest.entity.twilightforest.hydra.death.ogg': 资_693, './twilightforest.entity.twilightforest.hydra.growl.1.ogg': 资_694, './twilightforest.entity.twilightforest.hydra.growl.2.ogg': 资_695, './twilightforest.entity.twilightforest.hydra.growl.3.ogg': 资_696, './twilightforest.entity.twilightforest.hydra.hurt.1.ogg': 资_697, './twilightforest.entity.twilightforest.hydra.hurt.2.ogg': 资_698, './twilightforest.entity.twilightforest.hydra.hurt.3.ogg': 资_699, './twilightforest.entity.twilightforest.hydra.hurt.4.ogg': 资_700, './twilightforest.entity.twilightforest.lich.death.ogg': 资_701, './twilightforest.entity.twilightforest.lich.hurt.1.ogg': 资_702, './twilightforest.entity.twilightforest.lich.hurt.2.ogg': 资_703, './twilightforest.entity.twilightforest.lich.hurt.3.ogg': 资_704, './twilightforest.entity.twilightforest.lich.hurt.4.ogg': 资_705, './twilightforest.entity.twilightforest.naga.hurt.1.ogg': 资_706, './twilightforest.entity.twilightforest.naga.hurt.2.ogg': 资_707, './twilightforest.entity.twilightforest.naga.hurt.3.ogg': 资_708, './twilightforest.entity.twilightforest.shield.break.ogg': 资_709, './twilightforest.entity.twilightforest.snow_queen.break.ogg': 资_710, './twilightforest.entity.twilightforest.snow_queen.death.1.ogg': 资_711, './twilightforest.entity.twilightforest.snow_queen.death.2.ogg': 资_712, './twilightforest.entity.twilightforest.snow_queen.hurt.1.ogg': 资_713, './twilightforest.entity.twilightforest.snow_queen.hurt.2.ogg': 资_714, './twilightforest.entity.twilightforest.ur_ghast.death.ogg': 资_715, './twilightforest.entity.twilightforest.ur_ghast.hurt.1.ogg': 资_716, './twilightforest.entity.twilightforest.ur_ghast.hurt.2.ogg': 资_717, './twilightforest.entity.twilightforest.ur_ghast.hurt.3.ogg': 资_718, './twilightforest.entity.twilightforest.ur_ghast.hurt.4.ogg': 资_719, './twilightforest.entity.twilightforest.ur_ghast.hurt.5.ogg': 资_720, './ui.button.click.ogg': 资_721 }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const oggUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const oggModule = ctx(k);
  oggUrls[k.replace(/^\.\//, '')] = typeof oggModule === 'string' ? oggModule : oggModule.default;
}

// 代码里各处 playSound 传的随机音高（r、r1、r2 是 0～1 的随机数）
export const randomPitch = {
  // LevelRenderer.levelEvent 3007（尖啸）：0.6 + r × 0.4
  尖啸: (r: number) => 0.6 + r * 0.4,
  // SculkSensorBlock 激活（clicking）、冷却完（clicking_stop）：0.8 + r × 0.2
  感测体: (r: number) => 0.8 + r * 0.2,
  // LivingEntity.getVoicePitch（成年）：(r1 − r2) × 0.2 + 1，0.8～1.2、越靠 1 越多（监守者心跳、触角）
  voice: (r1: number, r2: number) => (r1 - r2) * 0.2 + 1,
};

export type SoundCue = {
  事件: SoundEventName;
  帧: number; // 在音轨的第几帧开始响（可以带小数；可以是负的 = 开头之前就响了，只放剩下的）
  位置: V3; // 发声的位置（场景坐标，1 单位 = 1 格）
  音量: number; // 代码里传给 playSound 的 volume
  音高: number; // 代码里传给 playSound 的 pitch（随机已经算好）
  选: number; // 0～1：按 weight 挑哪个文件
  起点?: number; // 从文件的第几秒放起（默认 0；剧情时间里已经响了一阵的，从响到的地方接着放）
  // 放到文件的第几秒为止（默认放完）：最后 `止点淡出` 秒线性淡出，不硬切出咔声。只给剪过的镜头用（如 6-4-8 监守者钻出提速，emerge.ogg 只取前后两阵轰响各一截），游戏里没有这回事
  stopSec?: number;
  名?: string; // 注释用
  major?: boolean; // 是不是剧情主要动作（距离衰减有下限，见 混音.ts）；不给就按事件名判断（主要动作）
  // 同一刻、同一个文件、同一音高的几声并成一声放（如一镜到底撞墙：洞里每一格方块各放一声破坏声，游戏里是同时起音、波形一样的几声，OpenAL 直接相加 = 振幅 × 份数）：几份。
  // 位置给这几声的中心，增益按一份算好（含 混音.ts 的下限）再乘份数；镜头那边限幅压过的是小数
  stackCount?: number;
  gainBoost?: number; // 游戏规则算完以后再乘的增益：照游戏放听不见、用户要求放大的个别声音（游戏里没有这回事）
  档?: 音效档; // 按档定响度（混音.ts），不走游戏的音量和距离衰减；不给按事件名归档（混音.ts 的 `defaultTier`）
  响度?: number; // 直接给目标响度（LUFS），比 档 优先
  // 到音轨的这一帧放完：前 `切点淡出帧` 帧线性淡出。给切到不相干镜头的余音用（用户 10-18：余音拖进别的镜头时淡掉）
  止帧?: number;
};

// 剧情主要动作的声音（距离衰减有下限，见 混音.ts 的 `主要动作下限`）：攻击、挥刀、命中、受伤、死亡、方块破坏、尖啸、钻出、雷击、
// 放箭和箭命中、药水碎、护盾碎、boss 宝箱冒出、落地重击。脚步、拾取、环境声、开关箱、放置、门户、循环声不算。个别声音可以用 `一声.主要` 单独指定
const majorEventRe = /attack|hurt|death|\.break$|\.shriek$|warden\.emerge|warden\.roar|trident\.throw|whoosh|parry|hit\.blade|big_fall|lightning_bolt|arrow\.(shoot|hit)|wither\.hurt|boss_chest|splash_potion|growl|\.fall$/;
export const isMajorAction = (s: SoundCue) => s.major ?? majorEventRe.test(s.事件);

export const pickFile = (event: SoundEventName, pickRand: number): SoundFile => {
  const files = sfxTable[event].声音;
  const totalWeight = files.reduce((s, x) => s + x.weight, 0);
  let k = pickRand * totalWeight;
  for (const x of files) {
    if (k < x.weight) return x;
    k -= x.weight;
  }
  return files[files.length - 1];
};

export const resolveSound = (sound: SoundCue) => {
  const file = pickFile(sound.事件, sound.选);
  const volume = sound.音量 * file.volume;
  const pitch = Math.min(2, Math.max(0.5, sound.音高 * file.pitch));
  return {
    file: file,
    pitch: pitch,
    gain: Math.min(1, Math.max(0, volume)),
    range: Math.max(volume, 1) * file.attenuation_distance,
    // 放完要多少秒（画面时间）
    durationSec: (Math.min(file.时长, sound.stopSec ?? Infinity) - (sound.起点 ?? 0)) / pitch,
  };
};

export const distanceGain = (listener: V3, source: V3, range: number) =>
  Math.max(0, 1 - Math.hypot(listener[0] - source[0], listener[1] - source[1], listener[2] - source[2]) / range);

// 一声在某一帧最后乘到文件上的音量：游戏的增益 × 距离衰减，主要动作按 混音.ts 的下限兜底，乘份数和音效总线。
// 脚步没有下限，照游戏衰减（成片的脚步交给 AI 生成，用户 10-11）。
// 距离 = `距离增益`(听者, 声源, 范围)。`游戏声音轨` 和 一镜到底/声音.tsx 的限幅预测都用它，两边算的一样
export const soundGain = (sound: SoundCue, resolved: ReturnType<typeof resolveSound>, distGain: number) => {
  const gain = resolved.gain * distGain;
  const floored = majorActionFloorOn && isMajorAction(sound) ? Math.max(gain, Math.min(resolved.gain, majorActionFloor)) : gain;
  return sfxVolume * (sound.stackCount ?? 1) * (sound.gainBoost ?? 1) * floored;
};

const fileLoudness = fileLoudnessJson as unknown as Record<string, number>;
const fileOnset = fileOnsetJson as unknown as Record<string, number>;
const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 分档的增益：目标响度 − 文件的有声平均响度，乘远近感和份数。「细节」档返回 undefined（照游戏规则）
const tierGain = (target: number | undefined, file: string, dist: number, stack = 1) =>
  target === undefined ? undefined : 10 ** ((target - fileLoudness[file]) / 20) * distanceFeel(dist) * stack;
const cueTarget = (s: { 档?: 音效档; 响度?: number }) => s.响度 ?? (s.档 && s.档 !== '细节' ? tierLoudness[s.档] : undefined);
// 一声归哪档：镜头给的，没给按事件名
export const cueTier = (s: SoundCue): { 档?: 音效档; 响度?: number } => ({ 档: s.档 ?? defaultTier(s.事件), 响度: s.响度 });
export const isTiered = (s: SoundCue) => cueTarget(cueTier(s)) !== undefined;
// 一声在某一帧最后乘到文件上的音量：分档的按档，「细节」档照游戏规则（`soundGain`）。`游戏声音轨` 和 一镜到底/声音/限幅.ts 的峰值预测都用它
// 脚步档另乘游戏的线性距离衰减（16 格外听不见）：画外、远处的人的脚步不放（用户 10-18 问「为什么在空中和落地后还有走路的声音」，那是画外九胡的脚步）
export const cueGain = (sound: SoundCue, resolved: ReturnType<typeof resolveSound>, listenerPos: V3) => {
  const tier = cueTier(sound);
  const gain = tierGain(cueTarget(tier), resolved.file.文件, dist3(listenerPos, sound.位置), sound.stackCount);
  if (gain === undefined) return soundGain(sound, resolved, distanceGain(listenerPos, sound.位置, resolved.range));
  return tier.档 === '脚步' && tier.响度 === undefined ? gain * distanceGain(listenerPos, sound.位置, resolved.range) : gain;
};
// 剪映片段名前的档（音效清单 的 档）：「重 -10」、直接给响度的「-21.5」、「细节」；没分档的不标
const tierLabel = (s: { 档?: 音效档; 响度?: number }) =>
  s.响度 !== undefined ? `${+s.响度.toFixed(1)}` : s.档 === '细节' ? '细节' : s.档 ? `${s.档} ${tierLoudness[s.档]}` : undefined;

// 一声实际从音轨的第几帧起放：从文件开头放的（起点 0）一律落在最近的整帧上、从文件开头完整地放，早晚不超过半帧（21 毫秒）。
// 不往后取整帧、把晚开始的那一点从文件头跳过去：刀砍、箭命中、脚步这类脆声最响的一下就在文件头 5 毫秒里，跳掉起音就没了，峰值小 10～15 dB、发闷（用户 10-11 问为什么要切掉一节）。
// 帧号是负的（上一段就开始响、这一段接着放）照同一个规则取整再只放剩下的：Math.round(帧 − 整数) = Math.round(帧) − 整数，前后两段算出来的起点相同，接得上。
// 本来就该从文件中间接着放的（起点 > 0：慢放回到原速以后按剧情时间接着放的余音）不取整，往后取整帧、把晚的那一点跳过去，落点准。
// 一镜到底/声音.tsx 撞墙限幅的峰值预测也用它，两边算的起点一样
// 文件开头的静音（音效起音.json）先从 帧 里减掉：起播早这么多，听见的那一下还在 帧 上
export const playStartFrame = (s: SoundCue, fps = 24) => {
  if ((s.起点 ?? 0) > 0) return s.帧;
  const r = resolveSound(s);
  return Math.round(s.帧 - ((fileOnset[r.file.文件] ?? 0) / r.pitch) * fps);
};

// 给了 止点 的，文件放到 止点 前这么多秒开始线性淡出
export const stopFadeSec = 0.08;
// 给了 止帧 的、`段尾淡出` 的段尾：淡出这么多帧（用户 10-18 批的 4～6 帧）
export const cutFadeFrames = 5;

// `起帧`：Composition 第 0 帧对应音轨的第几帧（一条时间线切成几段时用，同 6-4-3/时间线.ts 的全局帧）；`帧数`：这段多长，超出的不放。
// `段尾淡出`：下一段是硬切到别处、不接着放的，响过段尾的声音在最后 `切点淡出帧` 帧淡掉，不硬切
export const GameSoundTrack: React.FC<{ sounds: SoundCue[]; listener: (frame: number) => V3; startFrame?: number; frameCount?: number; tailFade?: boolean }> = ({
  sounds,
  listener,
  startFrame: baseFrame = 0,
  frameCount: frameCount,
  tailFade = false,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const segFrames = frameCount ?? durationInFrames;
  const logSfx = useSfxLog();
  const firstVisible = useFirstVisibleFrame();
  // 同一个文件、同一帧起的几声（一次捡起几样东西、几个卫兵同一刻落水），第二声起给 src 加标记，不然母版里只剩一声，见 同源区分.ts。
  // 不比长短：Sequence 的长度会被段尾截齐（remotion Sequence.js 的 actualDurationInFrames），本来不一样长的到段尾也一样长
  const sameSrcCount = new Map<string, number>();
  return (
    <>
      {sounds.map((sound, i) => {
        const resolved = resolveSound(sound);
        const localStart = playStartFrame(sound, fps) - baseFrame; // 段内帧，带小数
        const cutAt = Math.min(sound.止帧 === undefined ? Infinity : sound.止帧 - baseFrame, tailFade ? segFrames : Infinity); // 段内帧：到这儿淡完
        const localEnd = Math.min(localStart + resolved.durationSec * fps, cutAt);
        if (localEnd <= 0 || localStart >= segFrames) return null;
        // Sequence 只能从整数帧开始：`起播帧` 已经是整帧的这里不跳；接着放的余音（起点 > 0）带小数，往后取整、晚开始的那一点从文件里跳过去；开头在露出来的第一帧之前的，从那一帧起放、前面那截跳过去
        const from = Math.max(firstVisible, Math.ceil(localStart - 1e-6));
        const skipSec = ((from - localStart) / fps) * resolved.pitch;
        const remainingFrames = Math.ceil(localEnd - from);
        if (remainingFrames <= 0) return null;
        const volumeAt = (f: number) =>
          cueGain(sound, resolved, listener(baseFrame + from + f)) *
          Math.min(1, Math.max(0, (cutAt - from - f) / cutFadeFrames)) *
          (sound.stopSec === undefined ? 1 : Math.min(1, Math.max(0, (sound.stopSec - ((sound.起点 ?? 0) + skipSec + (f / fps) * resolved.pitch)) / stopFadeSec)));
        logSfx({ 名: sound.名 ?? sound.事件, 档: tierLabel(cueTier(sound)), 文件: `音效/${resolved.file.文件}`, from, 帧数: remainingFrames, 入点秒: (sound.起点 ?? 0) + skipSec, 速率: resolved.pitch, 循环: false, gainAt: volumeAt });
        const url = oggUrls[resolved.file.文件];
        const sameKey = `${url}|${from}`;
        const nth = sameSrcCount.get(sameKey) ?? 0;
        sameSrcCount.set(sameKey, nth + 1);
        return (
          <Sequence key={i} from={from} durationInFrames={remainingFrames} layout="none" name={sound.名 ?? sound.事件}>
            <Audio src={nth === 0 ? url : tagSrc(url, nth)} playbackRate={resolved.pitch} trimBefore={((sound.起点 ?? 0) + skipSec) * fps} volume={volumeAt} />
          </Sequence>
        );
      })}
    </>
  );
};

// 循环的声音（游戏里是 `TickableSoundInstance`，一直放到停）：机械动力的鼓风机嗡鸣（运动方块的 KINETIC 声景 = 原版 entity.minecart.inside，实例音量 0.25，
// 音高 = clamp(转速 / 256 + 0.45, 0.85, 1)，`KineticBlockEntity.tickAudio`；声景音量再乘 2(1 − 距离/16) 和 clamp(同组方块数/150, 0.025, 0.1)，一台风扇近处约 0.0125，镜头里给 `音量` 时自己乘上）、
// 被鼓风机的风推着飞（`AirCurrent.tickClientPlayerSounds` = 原版 item.elytra.flying，音高 = clamp(速度 × 0.5, 0.5, 2)，音量每刻淡入 0.05）。
// 起、止、音量(帧)、听者(帧) 的帧都是音轨的帧（同 `游戏声音轨`）。音高按 Remotion 的规矩一个 Sequence 里只能是常数。
// 给了 `位置` 就按游戏的线性衰减跟着镜头（听者）走（范围 = max(音量, 1) × attenuation_distance）；不给就是跟着玩家走的声音，不衰减。
// 给了 `档` / `响度` 就按 混音.ts 分档：不用 音量，`包络`(帧)（0～1）管淡入淡出，远近只按 distanceFeel
export const LoopSound: React.FC<{
  event: SoundEventName;
  beginFrame: number;
  endFrame: number;
  volume?: (frame: number) => number;
  tier?: 音效档;
  loudness?: number;
  envelope?: (frame: number) => number;
  pitch?: number;
  pick?: number;
  name?: string;
  startFrame?: number;
  position?: V3;
  listener?: (frame: number) => V3;
}> = ({ event: event, beginFrame: beginFrame, endFrame: endFrame, volume: volumeAt = () => 1, tier, loudness, envelope = () => 1, pitch: pitch = 1, pick: pickRand = 0, name: label, startFrame: baseFrame = 0, position: position, listener }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const logSfx = useSfxLog();
  const firstVisible = useFirstVisibleFrame();
  const file = pickFile(event, pickRand);
  const pitchRate = Math.min(2, Math.max(0.5, pitch * file.pitch));
  const from = Math.max(firstVisible, Math.round(beginFrame - baseFrame));
  const to = Math.min(durationInFrames, Math.round(endFrame - baseFrame));
  if (to - from <= 0) return null;
  const target = cueTarget({ 档: tier, 响度: loudness });
  const gainAt = (trackFrame: number) => {
    if (target !== undefined) return envelope(trackFrame) * tierGain(target, file.文件, position && listener ? dist3(listener(trackFrame), position) : 0)!;
    const volume = volumeAt(trackFrame) * file.volume;
    const distGain = position && listener ? distanceGain(listener(trackFrame), position, Math.max(volume, 1) * file.attenuation_distance) : 1;
    return sfxVolume * Math.min(1, Math.max(0, volume)) * distGain;
  };
  // 循环的相位按音轨的帧算：上一段就开始响的（起 < 起帧），这一段第 0 帧从文件里响到的地方接着放，几段硬切接起来是同一条循环，接缝处相位不跳（会有咔声）。先放完这一圈剩下的，再从文件开头循环
  const loopFrames = (file.时长 / pitchRate) * fps; // 画面帧
  const phaseFrames = ((baseFrame + from - beginFrame) % loopFrames + loopFrames) % loopFrames;
  const restFrames = Math.min(to - from, Math.ceil(loopFrames - phaseFrames));
  const loopFrom = from + (phaseFrames > 0.5 ? restFrames : 0);
  const name = label ?? event;
  const tierName = tierLabel({ 档: tier, 响度: loudness });
  if (phaseFrames > 0.5) logSfx({ 名: `${name}（接着放）`, 档: tierName, 文件: `音效/${file.文件}`, from, 帧数: restFrames, 入点秒: (phaseFrames * pitchRate) / fps, 速率: pitchRate, 循环: false, gainAt: (x) => gainAt(baseFrame + from + x) });
  if (to - loopFrom > 0) logSfx({ 名: name, 档: tierName, 文件: `音效/${file.文件}`, from: loopFrom, 帧数: to - loopFrom, 入点秒: 0, 速率: pitchRate, 循环: true, gainAt: (x) => gainAt(baseFrame + loopFrom + x) });
  return (
    <>
      {phaseFrames > 0.5 && (
        <Sequence from={from} durationInFrames={restFrames} layout="none" name={`${label ?? event}（接着放）`}>
          <Audio src={oggUrls[file.文件]} playbackRate={pitchRate} trimBefore={phaseFrames * pitchRate} volume={(x) => gainAt(baseFrame + from + x)} />
        </Sequence>
      )}
      {to - from - (phaseFrames > 0.5 ? restFrames : 0) > 0 && (
        <Sequence from={from + (phaseFrames > 0.5 ? restFrames : 0)} durationInFrames={to - from - (phaseFrames > 0.5 ? restFrames : 0)} layout="none" name={label ?? event}>
          <Audio
            src={oggUrls[file.文件]}
            loop
            loopVolumeCurveBehavior="extend"
            playbackRate={pitchRate}
            volume={(x) => gainAt(baseFrame + from + (phaseFrames > 0.5 ? restFrames : 0) + x)}
          />
        </Sequence>
      )}
    </>
  );
};

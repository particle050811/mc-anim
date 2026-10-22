// 一镜到底全部音效事件（物理时刻 + 世界坐标）：穿刺、boss 死亡、破盾、撞墙钻隧道、战利品箱和拾取、6-1-9 降落。
import { rng, type V3 } from '@engine/model/parts.tsx';
import { randomPitch } from '@engine/audio/游戏音效.tsx';
import { type StoryEvent } from '@engine/audio/慢放.ts';
import { pickupStateAt } from '@库/特效/物品拾取.tsx';
import { type DebrisData } from '@库/特效/方块飞溅.tsx';
import { RIDE } from '@库/角色/骑扫帚.tsx';
import * as lichChoreo from '../../6-1-5/编排.ts';
import * as hydraChoreo from '../../6-1-6/编排.ts';
import * as chainPierceChoreo from '../../6-1-7/编排.ts';
import * as snowQueenChoreo from '../../6-1-8/编排.ts';
import * as giantChoreo from '../../6-1-8b/编排.ts';
import * as castleChoreo from '../../6-1-9/编排.ts';
import * as route from '../路线.ts';
import { lootChests } from '../战利品.tsx';
import lichDebris from 'asset:碎块/镜头/6-1-5/碎块';
import yetiDebris from 'asset:碎块/镜头/6-1-7/雪怪碎块';
import snowQueenDebris from 'asset:碎块/镜头/6-1-8/碎块';
import giantDebris from 'asset:碎块/镜头/6-1-8b/碎块';
import { wallBreak, drillTunnel, tunnels, yetiBursts } from './方块声.ts';

const voicePitch = (r: () => number) => randomPitch.voice(r(), r());
// 李樱（扫帚杆中心）在物理时刻 T 的位置
const liYingPos = (T: number): V3 => route.扫帚(route.帧(T)).位置;
const breakSound = (event: string, T: number, pos: V3, name: string, r: () => number): StoryEvent => ({ 名: name, 事件: event, T, 位置: pos, 音量: 1, 音高: 0.8, 选: r() });

// 穿刺：攻击声（李樱那里）+ 死亡声（boss 那里）。攻击是主角出招命中，重档（用户 10-18 分档）。
// 死亡声镜头飞远就截断，见 声音.tsx 的 `cutWhenOutOfRange`；`death` 给死亡声另加的（九头蛇的起点、响度）
const pierceSounds = (name: string, T: number, bodyPos: V3, deathEvent: string, volume: number, pitch: number, r: () => number, death: Partial<StoryEvent> = {}): StoryEvent[] => [
  { 名: `${name}·攻击`, 事件: 'entity.player.attack.strong', T, 位置: liYingPos(T), 音量: 1, 音高: 1, 选: r(), 档: '重' },
  { 名: `${name}·死亡`, 事件: deathEvent, T, 位置: bodyPos, 音量: volume, 音高: pitch, 选: r(), ...death },
];

export const storyEvents: StoryEvent[] = (() => {
  const out: StoryEvent[] = [];
  const pierceTable = route.穿刺表;
  const pierceTimes = route.贯穿时刻;

  // ---------- 巫妖（6-1-5） ----------
  {
    const rand = rng(6151);
    const T0 = pierceTimes.巫妖;
    // 六瓶同一刻脱手，挑到同一个文件，叠起来峰值顶到 0 dBFS，画面上又被身子挡着：只放一声（用户 10-18）。另外五声照样取随机数，后面的音高不变
    for (let i = 0; i < 6; i++) {
      const throwSound: StoryEvent = { 名: `药水脱手${i}`, 事件: 'entity.splash_potion.throw', T: T0 + lichChoreo.T_THROW, 位置: liYingPos(T0 + lichChoreo.T_THROW), 音量: 0.5, 音高: 0.4 / (0.8 + rand() * 0.4), 选: rand() };
      if (i === 0) out.push(throwSound);
    }
    lichChoreo.SHIELD_PLAN.forEach((shield, i) => {
      out.push({ 名: `药水碎${i}`, 事件: 'entity.splash_potion.break', T: T0 + shield.tau, 位置: lichChoreo.toWorld(lichChoreo.砸点(i)), 音量: 1, 音高: 0.9 + rand() * 0.1, 选: rand() });
      out.push({ 名: `护盾碎${i}`, 事件: 'twilightforest:entity.twilightforest.shield.break', T: T0 + shield.tau, 位置: lichChoreo.toWorld(shield.center), 音量: 1, 音高: 2 * voicePitch(rand), 选: rand() });
    });
    // 墙：北墙、房间南墙、副楼里的隧道（2 号，只藏不飞，借南墙那一组的矛管定时刻）、副楼出口，逐格（见 方块声.ts）
    out.push(...wallBreak('巫妖', lichDebris as unknown as DebrisData, lichChoreo.debrisBursts(0), lichChoreo.toWorld, T0, rng(6151 + 100), { 2: 1 }));
    // 原来这里每排一声，用掉 HOLE_BOXES 那么多个随机数；照样空取，下面巫妖的攻击、死亡声挑到的文件和音高不变（撞墙改用自己的随机数）
    lichChoreo.HOLE_BOXES.forEach(() => rand());
    out.push(...pierceSounds('巫妖', T0 + lichChoreo.T_TOUCH, pierceTable.巫妖.矛尖(0), 'twilightforest:entity.twilightforest.lich.death', 1, voicePitch(rand), rand));
  }
  // ---------- 九头蛇（6-1-6，远景原速） ----------
  {
    const rand = rng(6161);
    const T0 = pierceTimes.九头蛇;
    // 九头蛇抬头（hydra.growl）不放：远景里照游戏听不见，加到听得清要 +20 dB（用户 10-18：「理论上这个距离是听不到的 那就别弄这个音频」）。照样空取 3 个随机数，后面的音高不变
    rand();
    rand();
    rand();
    // 身子半宽约 2 格（战利品.tsx 的 箱心），矛尖贯穿前 2 米碰到。
    // 死亡声（用户 10-20：九头蛇死亡声太小，几乎听不到）：镜头飞远，放 0.75 秒就截断，原来放到的是 hydra.death.ogg 开头 0.35 秒的前奏（比吼声小 10～20 dB），吼声刚起就淡出了。
    // 改成从吼声起放（起点 0.35 秒）；响度直接给 −6：按重档 −10 再减 50 格外的远近感，放出来只有 −14 LUFS 上下、压在配乐下面，
    // −6 让放出来的那截和另外四个 boss 死亡声放出来的一样在 −8～−11 LUFS（暮初恶魂、雪怪首领截断后剩的是文件最响的开头，本来就比档位响）
    out.push(...pierceSounds('九头蛇', T0 - 2 / hydraChoreo.V, pierceTable.九头蛇.矛尖(0), 'twilightforest:entity.twilightforest.hydra.death', 2, voicePitch(rand), rand, { 起点: 0.35, 响度: -6 }));
    // 钻穿土丘的方块声不放：钻在土丘里面看不到，镜头在 90 格外，照游戏听不见（用户 10-18：「在理论上这个距离是听不到的 那就别弄这个音频」）
  }
  // ---------- 暮初恶魂（6-1-7a，远景原速） ----------
  {
    const rand = rng(6171);
    const T0 = pierceTimes.暮初恶魂;
    out.push(...pierceSounds('暮初恶魂', T0 + chainPierceChoreo.ghastPierceLine.撞 / chainPierceChoreo.speed, pierceTable.暮初恶魂.矛尖(0), 'twilightforest:entity.twilightforest.ur_ghast.death', 16, (rand() - rand()) * 0.2 + 0.5, rand));
  }
  // ---------- 雪怪首领（6-1-7b，远景原速） ----------
  {
    const rand = rng(6172);
    const T0 = pierceTimes.雪怪首领;
    // 钻进西边的雪地一路钻到西口、洞窟里的三组碎块（西口的冰和冰锥、头顶的刷怪笼和云杉叶、东口的冰）。
    // 从东口钻进地里钻出雪地那一截不放：镜头留在洞里、离那儿百来格，照游戏听不见（用户 10-18：远处听不见就删）
    const r2 = rng(6172 + 100);
    out.push(...drillTunnel(tunnels.雪怪进, chainPierceChoreo.yetiTimeAt, chainPierceChoreo.yetiPierceLine.矛尖, T0, '雪怪西边雪地', r2));
    out.push(...wallBreak('雪怪首领', yetiDebris as unknown as DebrisData, yetiBursts(), (p) => chainPierceChoreo.caveFrame.到世界(p), T0, r2));
    // 原来钻进雪地、西口各一声用掉两个随机数；照样空取，雪怪首领的攻击、死亡声不变
    rand();
    rand();
    // 碰撞箱 3.8 格宽，矛尖在贯穿前 1.9 米碰到
    out.push(...pierceSounds('雪怪首领', T0 + chainPierceChoreo.yetiTimeAt(-1.9), pierceTable.雪怪首领.矛尖(0), 'twilightforest:entity.twilightforest.alpha_yeti.death', 4, 0.5 + rand() * 0.5, rand));
  }
  // ---------- 冰雪女王（6-1-8） ----------
  {
    const rand = rng(6181);
    const T0 = pierceTimes.冰雪女王;
    // 极光宫殿南墙、北墙，逐格（见 方块声.ts）；原来南墙一声用掉一个随机数，照样空取，冰雪女王的攻击、死亡声和冰盾碎不变
    out.push(...wallBreak('冰雪女王', snowQueenDebris as unknown as DebrisData, snowQueenChoreo.debrisBursts(0), snowQueenChoreo.toWorld, T0, rng(6181 + 100)));
    rand();
    // 死亡声归中档，不按 boss 死的重档（用户 10-20：「冰雪女王死亡声音太响了 调成中档」）
    out.push(...pierceSounds('冰雪女王', T0 + snowQueenChoreo.T_TOUCH, pierceTable.冰雪女王.矛尖(0), 'twilightforest:entity.twilightforest.snow_queen.death', 1, voicePitch(rand), rand, { 档: '中' }));
    snowQueenChoreo.shields(0).forEach((s, i) => out.push({ 名: `冰盾碎${i}`, 事件: 'twilightforest:entity.twilightforest.snow_queen.break', T: T0, 位置: snowQueenChoreo.toWorld(s.p), 音量: 1, 音高: (rand() - rand()) * 0.7 + 1, 选: rand() }));
  }
  // ---------- 巨人（6-1-8b） ----------
  {
    const rand = rng(6182);
    const T0 = pierceTimes.巨人;
    // 云中小屋南墙、北墙，逐格（见 方块声.ts；0 号是东墙剖面，只藏不碎，撞墙方块.json 没收）
    // 要原地改（不能换新对象）：wallSounds 按对象认撞墙声
    const giantWalls = wallBreak('巨人', giantDebris as unknown as DebrisData, giantChoreo.debrisBursts(0), giantChoreo.toWorld, T0, rng(6182 + 100), {}, [giantChoreo.碎块组.剖面]);
    out.push(...giantWalls);
    // 原来每排一声用掉 8 个随机数；照样空取，两个巨人的攻击、死亡声不变
    [...giantChoreo.HOLE_BOXES.南, ...giantChoreo.HOLE_BOXES.北].forEach(() => rand());
    giantChoreo.GIANTS.forEach((g, i) => out.push(...pierceSounds(`巨人${g.种类}`, T0 + giantChoreo.T_TOUCH[i], giantChoreo.toWorld(giantChoreo.tipLocal(g.a)), 'entity.hostile.death', 1, voicePitch(rand), rand)));
  }
  // ---------- 战利品箱、拾取 ----------
  {
    const rand = rng(6191);
    lootChests.forEach((chest) => {
      const breakT = pierceTimes[chest.名] + chest.t碎;
      if (chest.贴图 !== null) {
        // 冒出声音高 0.5 上下、一声 7 秒，箱子在画面上几帧就被钻碎：只放画面上 1 秒（用户 10-18）。stopSec 是文件秒，变速变调下画面 1 秒 = 音高秒
        const appearPitch = (rand() - rand()) * 0.175 + 0.5;
        out.push({ 名: `${chest.名}战利品箱冒出`, 事件: 'twilightforest:block.twilightforest.boss_chest.appear', T: breakT - chest.冒出, 位置: chest.中心, 音量: 128, 音高: appearPitch, 选: rand(), stopSec: Math.max(0.5, appearPitch) });
        out.push(breakSound('block.wood.break', breakT, chest.中心, `${chest.名}战利品箱碎`, rand));
      }
      chest.件.forEach((k, i) => {
        const pickupPos = pickupStateAt(k, k.起吸, [0, 0, 0])!.p;
        out.push({ 名: `${chest.名}拾取${i}·${k.名}`, 事件: 'entity.item.pickup', T: breakT + k.起吸, 位置: pickupPos, 音量: 0.2, 音高: (rand() - rand()) * 1.4 + 2, 选: rand() });
      });
    });
  }
  // ---------- 6-1-9 降落 ----------
  {
    const rand = rng(6191 + 1);
    const T0 = route.T_ARRIVE;
    const broomPos = liYingPos(T0);
    const dropPos = [broomPos[0], broomPos[1], broomPos[2] - RIDE.stickZ + 0.25] as V3; // 画面.tsx 的 收扫帚：掉落物生成在实体原点
    out.push({ 名: '收扫帚', 事件: 'block.wool.break', T: T0, 位置: broomPos, 音量: 1, 音高: 1, 选: rand() });
    out.push({ 名: '拾取扫帚', 事件: 'entity.item.pickup', T: T0, 位置: dropPos, 音量: 0.2, 音高: (rand() - rand()) * 1.4 + 2, 选: rand() });
    const landT = T0 + route.落地时长();
    const landPos = route.扫帚(route.帧(landT)).位置;
    const feetPos: V3 = [landPos[0], landPos[1], landPos[2] - castleChoreo.dismount.landingStickHeight];
    for (const rider of ['李樱', '九胡']) out.push({ 名: `${rider}落到屋顶`, 事件: 'block.stone.step', T: landT, 位置: feetPos, 音量: 0.15, 音高: 1, 选: rand() });
  }
  return out;
})();

// 聚晶注册名 → 背包图标（16×16 的 png，import 出来是 data URI）。轮盘、法术表按「命名空间:注册名」来这里取图。
// 资产 id 的规律：贴图/物品/聚晶/<命名空间>/<注册名>，命名空间是 goety（本体 124 个加空聚晶 empty_focus）或 goety_revelation（启示录 9 个：
// 有实现的 revelation、heretic、wither_quietus、ice，空壳 dementor、dragon_nirvana、dragon_skyrocket、shadow_clone、nether_meteor）。
// 顺序照两个模组注册物品的先后（Goety ModItems、启示录 GRItems）。图标按物品模型 layer0 取，配方见 sourcing/extract.toml「诡厄巫法聚晶图标」「启示录聚晶图标」。
// 光环版：启示录给持有者戴光环时换的 7 张（贴图/物品/聚晶/光环版/<本体注册名>），键仍是本体聚晶；用不用没定，没列的聚晶没有这一版。
import emptyFocusPng from 'asset:贴图/物品/聚晶/goety/empty_focus';
import vexingFocusPng from 'asset:贴图/物品/聚晶/goety/vexing_focus';
import bitingFocusPng from 'asset:贴图/物品/聚晶/goety/biting_focus';
import feastFocusPng from 'asset:贴图/物品/聚晶/goety/feast_focus';
import teethFocusPng from 'asset:贴图/物品/聚晶/goety/teeth_focus';
import shreddingFocusPng from 'asset:贴图/物品/聚晶/goety/shredding_focus';
import illusionFocusPng from 'asset:贴图/物品/聚晶/goety/illusion_focus';
import igniteFocusPng from 'asset:贴图/物品/聚晶/goety/ignite_focus';
import soulBoltFocusPng from 'asset:贴图/物品/聚晶/goety/soul_bolt_focus';
import magicBoltFocusPng from 'asset:贴图/物品/聚晶/goety/magic_bolt_focus';
import swordFocusPng from 'asset:贴图/物品/聚晶/goety/sword_focus';
import soulLightFocusPng from 'asset:贴图/物品/聚晶/goety/soul_light_focus';
import glowLightFocusPng from 'asset:贴图/物品/聚晶/goety/glow_light_focus';
import illuminateFocusPng from 'asset:贴图/物品/聚晶/goety/illuminate_focus';
import craftingFocusPng from 'asset:贴图/物品/聚晶/goety/crafting_focus';
import ironHideFocusPng from 'asset:贴图/物品/聚晶/goety/iron_hide_focus';
import bulwarkFocusPng from 'asset:贴图/物品/聚晶/goety/bulwark_focus';
import soulHealFocusPng from 'asset:贴图/物品/聚晶/goety/soul_heal_focus';
import shockwaveFocusPng from 'asset:贴图/物品/聚晶/goety/shockwave_focus';
import weakeningFocusPng from 'asset:贴图/物品/聚晶/goety/weakening_focus';
import arrowRainFocusPng from 'asset:贴图/物品/聚晶/goety/arrow_rain_focus';
import telekinesisFocusPng from 'asset:贴图/物品/聚晶/goety/telekinesis_focus';
import commandFocusPng from 'asset:贴图/物品/聚晶/goety/command_focus';
import orderFocusPng from 'asset:贴图/物品/聚晶/goety/order_focus';
import sonicBoomFocusPng from 'asset:贴图/物品/聚晶/goety/sonic_boom_focus';
import corruptionFocusPng from 'asset:贴图/物品/聚晶/goety/corruption_focus';
import rottingFocusPng from 'asset:贴图/物品/聚晶/goety/rotting_focus';
import osseousFocusPng from 'asset:贴图/物品/聚晶/goety/osseous_focus';
import ghostFireFocusPng from 'asset:贴图/物品/聚晶/goety/ghost_fire_focus';
import reapingFocusPng from 'asset:贴图/物品/聚晶/goety/reaping_focus';
import spookyFocusPng from 'asset:贴图/物品/聚晶/goety/spooky_focus';
import phantasmFocusPng from 'asset:贴图/物品/聚晶/goety/phantasm_focus';
import vanguardFocusPng from 'asset:贴图/物品/聚晶/goety/vanguard_focus';
import blackguardFocusPng from 'asset:贴图/物品/聚晶/goety/blackguard_focus';
import leechingFocusPng from 'asset:贴图/物品/聚晶/goety/leeching_focus';
import killingFocusPng from 'asset:贴图/物品/聚晶/goety/killing_focus';
import skullFocusPng from 'asset:贴图/物品/聚晶/goety/skull_focus';
import barricadeFocusPng from 'asset:贴图/物品/聚晶/goety/barricade_focus';
import quakingFocusPng from 'asset:贴图/物品/聚晶/goety/quaking_focus';
import earthPunchFocusPng from 'asset:贴图/物品/聚晶/goety/earth_punch_focus';
import smackStoneFocusPng from 'asset:贴图/物品/聚晶/goety/smack_stone_focus';
import temblorClapFocusPng from 'asset:贴图/物品/聚晶/goety/temblor_clap_focus';
import ministrousFocusPng from 'asset:贴图/物品/聚晶/goety/ministrous_focus';
import pulverizeFocusPng from 'asset:贴图/物品/聚晶/goety/pulverize_focus';
import rotationFocusPng from 'asset:贴图/物品/聚晶/goety/rotation_focus';
import burrowingFocusPng from 'asset:贴图/物品/聚晶/goety/burrowing_focus';
import sensingFocusPng from 'asset:贴图/物品/聚晶/goety/sensing_focus';
import scatterFocusPng from 'asset:贴图/物品/聚晶/goety/scatter_focus';
import eruptionFocusPng from 'asset:贴图/物品/聚晶/goety/eruption_focus';
import frostBreathFocusPng from 'asset:贴图/物品/聚晶/goety/frost_breath_focus';
import iceSpikeFocusPng from 'asset:贴图/物品/聚晶/goety/ice_spike_focus';
import iceStormFocusPng from 'asset:贴图/物品/聚晶/goety/ice_storm_focus';
import hailFocusPng from 'asset:贴图/物品/聚晶/goety/hail_focus';
import iceologyFocusPng from 'asset:贴图/物品/聚晶/goety/iceology_focus';
import blizzardFocusPng from 'asset:贴图/物品/聚晶/goety/blizzard_focus';
import chillingFocusPng from 'asset:贴图/物品/聚晶/goety/chilling_focus';
import frostNovaFocusPng from 'asset:贴图/物品/聚晶/goety/frost_nova_focus';
import frostbornFocusPng from 'asset:贴图/物品/聚晶/goety/frostborn_focus';
import swarmFocusPng from 'asset:贴图/物品/聚晶/goety/swarm_focus';
import poisonDartFocusPng from 'asset:贴图/物品/聚晶/goety/poison_dart_focus';
import blossomingFocusPng from 'asset:贴图/物品/聚晶/goety/blossoming_focus';
import grappleFocusPng from 'asset:贴图/物品/聚晶/goety/grapple_focus';
import huntingFocusPng from 'asset:贴图/物品/聚晶/goety/hunting_focus';
import maulingFocusPng from 'asset:贴图/物品/聚晶/goety/mauling_focus';
import slimyFocusPng from 'asset:贴图/物品/聚晶/goety/slimy_focus';
import carrionFocusPng from 'asset:贴图/物品/聚晶/goety/carrion_focus';
import overgrowthFocusPng from 'asset:贴图/物品/聚晶/goety/overgrowth_focus';
import entanglingFocusPng from 'asset:贴图/物品/聚晶/goety/entangling_focus';
import whisperingFocusPng from 'asset:贴图/物品/聚晶/goety/whispering_focus';
import leapingFocusPng from 'asset:贴图/物品/聚晶/goety/leaping_focus';
import launchFocusPng from 'asset:贴图/物品/聚晶/goety/launch_focus';
import flyingFocusPng from 'asset:贴图/物品/聚晶/goety/flying_focus';
import cushionFocusPng from 'asset:贴图/物品/聚晶/goety/cushion_focus';
import whirlwindFocusPng from 'asset:贴图/物品/聚晶/goety/whirlwind_focus';
import cycloneFocusPng from 'asset:贴图/物品/聚晶/goety/cyclone_focus';
import updraftFocusPng from 'asset:贴图/物品/聚晶/goety/updraft_focus';
import windBlastFocusPng from 'asset:贴图/物品/聚晶/goety/wind_blast_focus';
import razorWindFocusPng from 'asset:贴图/物品/聚晶/goety/razor_wind_focus';
import tremblingFocusPng from 'asset:贴图/物品/聚晶/goety/trembling_focus';
import chargeFocusPng from 'asset:贴图/物品/聚晶/goety/charge_focus';
import shockingFocusPng from 'asset:贴图/物品/聚晶/goety/shocking_focus';
import thunderboltFocusPng from 'asset:贴图/物品/聚晶/goety/thunderbolt_focus';
import electrocuteFocusPng from 'asset:贴图/物品/聚晶/goety/electrocute_focus';
import surgingFocusPng from 'asset:贴图/物品/聚晶/goety/surging_focus';
import sprightlyFocusPng from 'asset:贴图/物品/聚晶/goety/sprightly_focus';
import monsoonFocusPng from 'asset:贴图/物品/聚晶/goety/monsoon_focus';
import dischargeFocusPng from 'asset:贴图/物品/聚晶/goety/discharge_focus';
import boltingFocusPng from 'asset:贴图/物品/聚晶/goety/bolting_focus';
import lightningFocusPng from 'asset:贴图/物品/聚晶/goety/lightning_focus';
import thunderstormFocusPng from 'asset:贴图/物品/聚晶/goety/thunderstorm_focus';
import waterJetFocusPng from 'asset:贴图/物品/聚晶/goety/water_jet_focus';
import bouncyBubbleFocusPng from 'asset:贴图/物品/聚晶/goety/bouncy_bubble_focus';
import steamingFocusPng from 'asset:贴图/物品/聚晶/goety/steaming_focus';
import tridentStormFocusPng from 'asset:贴图/物品/聚晶/goety/trident_storm_focus';
import prismaBeamFocusPng from 'asset:贴图/物品/聚晶/goety/prisma_beam_focus';
import guardianFocusPng from 'asset:贴图/物品/聚晶/goety/guardian_focus';
import biomineFocusPng from 'asset:贴图/物品/聚晶/goety/biomine_focus';
import waterWhipFocusPng from 'asset:贴图/物品/聚晶/goety/water_whip_focus';
import tidalFocusPng from 'asset:贴图/物品/聚晶/goety/tidal_focus';
import fireBreathFocusPng from 'asset:贴图/物品/聚晶/goety/fire_breath_focus';
import fireballFocusPng from 'asset:贴图/物品/聚晶/goety/fireball_focus';
import lavaballFocusPng from 'asset:贴图/物品/聚晶/goety/lavaball_focus';
import bombardmentFocusPng from 'asset:贴图/物品/聚晶/goety/bombardment_focus';
import meteorShowerFocusPng from 'asset:贴图/物品/聚晶/goety/meteor_shower_focus';
import magmaBombFocusPng from 'asset:贴图/物品/聚晶/goety/magma_bomb_focus';
import fireBlastFocusPng from 'asset:贴图/物品/聚晶/goety/fire_blast_focus';
import flameStrikeFocusPng from 'asset:贴图/物品/聚晶/goety/flame_strike_focus';
import witherSkullFocusPng from 'asset:贴图/物品/聚晶/goety/wither_skull_focus';
import ghastlyFocusPng from 'asset:贴图/物品/聚晶/goety/ghastly_focus';
import blazingFocusPng from 'asset:贴图/物品/聚晶/goety/blazing_focus';
import hoggingFocusPng from 'asset:贴图/物品/聚晶/goety/hogging_focus';
import callFocusPng from 'asset:贴图/物品/聚晶/goety/call_focus';
import troopFocusPng from 'asset:贴图/物品/聚晶/goety/troop_focus';
import recallFocusPng from 'asset:贴图/物品/聚晶/goety/recall_focus';
import enderChestFocusPng from 'asset:贴图/物品/聚晶/goety/ender_chest_focus';
import endWalkFocusPng from 'asset:贴图/物品/聚晶/goety/end_walk_focus';
import blinkFocusPng from 'asset:贴图/物品/聚晶/goety/blink_focus';
import banishFocusPng from 'asset:贴图/物品/聚晶/goety/banish_focus';
import tunnelFocusPng from 'asset:贴图/物品/聚晶/goety/tunnel_focus';
import ruptureFocusPng from 'asset:贴图/物品/聚晶/goety/rupture_focus';
import stellarFocusPng from 'asset:贴图/物品/聚晶/goety/stellar_focus';
import voidFlashFocusPng from 'asset:贴图/物品/聚晶/goety/void_flash_focus';
import watchingFocusPng from 'asset:贴图/物品/聚晶/goety/watching_focus';
import blastingFocusPng from 'asset:贴图/物品/聚晶/goety/blasting_focus';
import snaringFocusPng from 'asset:贴图/物品/聚晶/goety/snaring_focus';
import revelationFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/revelation_focus';
import hereticFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/heretic_focus';
import witherQuietusFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/wither_quietus_focus';
import dementorFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/dementor_focus';
import dragonNirvanaFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/dragon_nirvana_focus';
import dragonSkyrocketFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/dragon_skyrocket_focus';
import iceFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/ice_focus';
import shadowCloneFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/shadow_clone_focus';
import netherMeteorFocusPng from 'asset:贴图/物品/聚晶/goety_revelation/nether_meteor_focus';

export const focusIcons = {
  'goety:empty_focus': emptyFocusPng,
  'goety:vexing_focus': vexingFocusPng,
  'goety:biting_focus': bitingFocusPng,
  'goety:feast_focus': feastFocusPng,
  'goety:teeth_focus': teethFocusPng,
  'goety:shredding_focus': shreddingFocusPng,
  'goety:illusion_focus': illusionFocusPng,
  'goety:ignite_focus': igniteFocusPng,
  'goety:soul_bolt_focus': soulBoltFocusPng,
  'goety:magic_bolt_focus': magicBoltFocusPng,
  'goety:sword_focus': swordFocusPng,
  'goety:soul_light_focus': soulLightFocusPng,
  'goety:glow_light_focus': glowLightFocusPng,
  'goety:illuminate_focus': illuminateFocusPng,
  'goety:crafting_focus': craftingFocusPng,
  'goety:iron_hide_focus': ironHideFocusPng,
  'goety:bulwark_focus': bulwarkFocusPng,
  'goety:soul_heal_focus': soulHealFocusPng,
  'goety:shockwave_focus': shockwaveFocusPng,
  'goety:weakening_focus': weakeningFocusPng,
  'goety:arrow_rain_focus': arrowRainFocusPng,
  'goety:telekinesis_focus': telekinesisFocusPng,
  'goety:command_focus': commandFocusPng,
  'goety:order_focus': orderFocusPng,
  'goety:sonic_boom_focus': sonicBoomFocusPng,
  'goety:corruption_focus': corruptionFocusPng,
  'goety:rotting_focus': rottingFocusPng,
  'goety:osseous_focus': osseousFocusPng,
  'goety:ghost_fire_focus': ghostFireFocusPng,
  'goety:reaping_focus': reapingFocusPng,
  'goety:spooky_focus': spookyFocusPng,
  'goety:phantasm_focus': phantasmFocusPng,
  'goety:vanguard_focus': vanguardFocusPng,
  'goety:blackguard_focus': blackguardFocusPng,
  'goety:leeching_focus': leechingFocusPng,
  'goety:killing_focus': killingFocusPng,
  'goety:skull_focus': skullFocusPng,
  'goety:barricade_focus': barricadeFocusPng,
  'goety:quaking_focus': quakingFocusPng,
  'goety:earth_punch_focus': earthPunchFocusPng,
  'goety:smack_stone_focus': smackStoneFocusPng,
  'goety:temblor_clap_focus': temblorClapFocusPng,
  'goety:ministrous_focus': ministrousFocusPng,
  'goety:pulverize_focus': pulverizeFocusPng,
  'goety:rotation_focus': rotationFocusPng,
  'goety:burrowing_focus': burrowingFocusPng,
  'goety:sensing_focus': sensingFocusPng,
  'goety:scatter_focus': scatterFocusPng,
  'goety:eruption_focus': eruptionFocusPng,
  'goety:frost_breath_focus': frostBreathFocusPng,
  'goety:ice_spike_focus': iceSpikeFocusPng,
  'goety:ice_storm_focus': iceStormFocusPng,
  'goety:hail_focus': hailFocusPng,
  'goety:iceology_focus': iceologyFocusPng,
  'goety:blizzard_focus': blizzardFocusPng,
  'goety:chilling_focus': chillingFocusPng,
  'goety:frost_nova_focus': frostNovaFocusPng,
  'goety:frostborn_focus': frostbornFocusPng,
  'goety:swarm_focus': swarmFocusPng,
  'goety:poison_dart_focus': poisonDartFocusPng,
  'goety:blossoming_focus': blossomingFocusPng,
  'goety:grapple_focus': grappleFocusPng,
  'goety:hunting_focus': huntingFocusPng,
  'goety:mauling_focus': maulingFocusPng,
  'goety:slimy_focus': slimyFocusPng,
  'goety:carrion_focus': carrionFocusPng,
  'goety:overgrowth_focus': overgrowthFocusPng,
  'goety:entangling_focus': entanglingFocusPng,
  'goety:whispering_focus': whisperingFocusPng,
  'goety:leaping_focus': leapingFocusPng,
  'goety:launch_focus': launchFocusPng,
  'goety:flying_focus': flyingFocusPng,
  'goety:cushion_focus': cushionFocusPng,
  'goety:whirlwind_focus': whirlwindFocusPng,
  'goety:cyclone_focus': cycloneFocusPng,
  'goety:updraft_focus': updraftFocusPng,
  'goety:wind_blast_focus': windBlastFocusPng,
  'goety:razor_wind_focus': razorWindFocusPng,
  'goety:trembling_focus': tremblingFocusPng,
  'goety:charge_focus': chargeFocusPng,
  'goety:shocking_focus': shockingFocusPng,
  'goety:thunderbolt_focus': thunderboltFocusPng,
  'goety:electrocute_focus': electrocuteFocusPng,
  'goety:surging_focus': surgingFocusPng,
  'goety:sprightly_focus': sprightlyFocusPng,
  'goety:monsoon_focus': monsoonFocusPng,
  'goety:discharge_focus': dischargeFocusPng,
  'goety:bolting_focus': boltingFocusPng,
  'goety:lightning_focus': lightningFocusPng,
  'goety:thunderstorm_focus': thunderstormFocusPng,
  'goety:water_jet_focus': waterJetFocusPng,
  'goety:bouncy_bubble_focus': bouncyBubbleFocusPng,
  'goety:steaming_focus': steamingFocusPng,
  'goety:trident_storm_focus': tridentStormFocusPng,
  'goety:prisma_beam_focus': prismaBeamFocusPng,
  'goety:guardian_focus': guardianFocusPng,
  'goety:biomine_focus': biomineFocusPng,
  'goety:water_whip_focus': waterWhipFocusPng,
  'goety:tidal_focus': tidalFocusPng,
  'goety:fire_breath_focus': fireBreathFocusPng,
  'goety:fireball_focus': fireballFocusPng,
  'goety:lavaball_focus': lavaballFocusPng,
  'goety:bombardment_focus': bombardmentFocusPng,
  'goety:meteor_shower_focus': meteorShowerFocusPng,
  'goety:magma_bomb_focus': magmaBombFocusPng,
  'goety:fire_blast_focus': fireBlastFocusPng,
  'goety:flame_strike_focus': flameStrikeFocusPng,
  'goety:wither_skull_focus': witherSkullFocusPng,
  'goety:ghastly_focus': ghastlyFocusPng,
  'goety:blazing_focus': blazingFocusPng,
  'goety:hogging_focus': hoggingFocusPng,
  'goety:call_focus': callFocusPng,
  'goety:troop_focus': troopFocusPng,
  'goety:recall_focus': recallFocusPng,
  'goety:ender_chest_focus': enderChestFocusPng,
  'goety:end_walk_focus': endWalkFocusPng,
  'goety:blink_focus': blinkFocusPng,
  'goety:banish_focus': banishFocusPng,
  'goety:tunnel_focus': tunnelFocusPng,
  'goety:rupture_focus': ruptureFocusPng,
  'goety:stellar_focus': stellarFocusPng,
  'goety:void_flash_focus': voidFlashFocusPng,
  'goety:watching_focus': watchingFocusPng,
  'goety:blasting_focus': blastingFocusPng,
  'goety:snaring_focus': snaringFocusPng,
  'goety_revelation:revelation_focus': revelationFocusPng,
  'goety_revelation:heretic_focus': hereticFocusPng,
  'goety_revelation:wither_quietus_focus': witherQuietusFocusPng,
  'goety_revelation:dementor_focus': dementorFocusPng,
  'goety_revelation:dragon_nirvana_focus': dragonNirvanaFocusPng,
  'goety_revelation:dragon_skyrocket_focus': dragonSkyrocketFocusPng,
  'goety_revelation:ice_focus': iceFocusPng,
  'goety_revelation:shadow_clone_focus': shadowCloneFocusPng,
  'goety_revelation:nether_meteor_focus': netherMeteorFocusPng,
} as const;

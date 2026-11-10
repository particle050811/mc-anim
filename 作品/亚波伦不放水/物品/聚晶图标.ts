// 聚晶注册名 → 背包图标（16×16 的 png，import 出来是 data URI）。轮盘、法术表按「命名空间:注册名」来这里取图。
// 资产 id 的规律：贴图/物品/聚晶/<命名空间>/<注册名>，命名空间是 goety（本体 124 个加空聚晶 empty_focus）或 goety_revelation（启示录 9 个：
// 有实现的 revelation、heretic、wither_quietus、ice，空壳 dementor、dragon_nirvana、dragon_skyrocket、shadow_clone、nether_meteor）。
// 顺序照两个模组注册物品的先后（Goety ModItems、启示录 GRItems）。图标按物品模型 layer0 取，配方见 sourcing/extract.toml「诡厄巫法聚晶图标」「启示录聚晶图标」。
// 光环版：启示录给持有者戴光环时换的 7 张（贴图/物品/聚晶/光环版/<本体注册名>），键仍是本体聚晶；用不用没定，没列的聚晶没有这一版。
import 图_0 from 'asset:贴图/物品/聚晶/goety/empty_focus';
import 图_1 from 'asset:贴图/物品/聚晶/goety/vexing_focus';
import 图_2 from 'asset:贴图/物品/聚晶/goety/biting_focus';
import 图_3 from 'asset:贴图/物品/聚晶/goety/feast_focus';
import 图_4 from 'asset:贴图/物品/聚晶/goety/teeth_focus';
import 图_5 from 'asset:贴图/物品/聚晶/goety/shredding_focus';
import 图_6 from 'asset:贴图/物品/聚晶/goety/illusion_focus';
import 图_7 from 'asset:贴图/物品/聚晶/goety/ignite_focus';
import 图_8 from 'asset:贴图/物品/聚晶/goety/soul_bolt_focus';
import 图_9 from 'asset:贴图/物品/聚晶/goety/magic_bolt_focus';
import 图_10 from 'asset:贴图/物品/聚晶/goety/sword_focus';
import 图_11 from 'asset:贴图/物品/聚晶/goety/soul_light_focus';
import 图_12 from 'asset:贴图/物品/聚晶/goety/glow_light_focus';
import 图_13 from 'asset:贴图/物品/聚晶/goety/illuminate_focus';
import 图_14 from 'asset:贴图/物品/聚晶/goety/crafting_focus';
import 图_15 from 'asset:贴图/物品/聚晶/goety/iron_hide_focus';
import 图_16 from 'asset:贴图/物品/聚晶/goety/bulwark_focus';
import 图_17 from 'asset:贴图/物品/聚晶/goety/soul_heal_focus';
import 图_18 from 'asset:贴图/物品/聚晶/goety/shockwave_focus';
import 图_19 from 'asset:贴图/物品/聚晶/goety/weakening_focus';
import 图_20 from 'asset:贴图/物品/聚晶/goety/arrow_rain_focus';
import 图_21 from 'asset:贴图/物品/聚晶/goety/telekinesis_focus';
import 图_22 from 'asset:贴图/物品/聚晶/goety/command_focus';
import 图_23 from 'asset:贴图/物品/聚晶/goety/order_focus';
import 图_24 from 'asset:贴图/物品/聚晶/goety/sonic_boom_focus';
import 图_25 from 'asset:贴图/物品/聚晶/goety/corruption_focus';
import 图_26 from 'asset:贴图/物品/聚晶/goety/rotting_focus';
import 图_27 from 'asset:贴图/物品/聚晶/goety/osseous_focus';
import 图_28 from 'asset:贴图/物品/聚晶/goety/ghost_fire_focus';
import 图_29 from 'asset:贴图/物品/聚晶/goety/reaping_focus';
import 图_30 from 'asset:贴图/物品/聚晶/goety/spooky_focus';
import 图_31 from 'asset:贴图/物品/聚晶/goety/phantasm_focus';
import 图_32 from 'asset:贴图/物品/聚晶/goety/vanguard_focus';
import 图_33 from 'asset:贴图/物品/聚晶/goety/blackguard_focus';
import 图_34 from 'asset:贴图/物品/聚晶/goety/leeching_focus';
import 图_35 from 'asset:贴图/物品/聚晶/goety/killing_focus';
import 图_36 from 'asset:贴图/物品/聚晶/goety/skull_focus';
import 图_37 from 'asset:贴图/物品/聚晶/goety/barricade_focus';
import 图_38 from 'asset:贴图/物品/聚晶/goety/quaking_focus';
import 图_39 from 'asset:贴图/物品/聚晶/goety/earth_punch_focus';
import 图_40 from 'asset:贴图/物品/聚晶/goety/smack_stone_focus';
import 图_41 from 'asset:贴图/物品/聚晶/goety/temblor_clap_focus';
import 图_42 from 'asset:贴图/物品/聚晶/goety/ministrous_focus';
import 图_43 from 'asset:贴图/物品/聚晶/goety/pulverize_focus';
import 图_44 from 'asset:贴图/物品/聚晶/goety/rotation_focus';
import 图_45 from 'asset:贴图/物品/聚晶/goety/burrowing_focus';
import 图_46 from 'asset:贴图/物品/聚晶/goety/sensing_focus';
import 图_47 from 'asset:贴图/物品/聚晶/goety/scatter_focus';
import 图_48 from 'asset:贴图/物品/聚晶/goety/eruption_focus';
import 图_49 from 'asset:贴图/物品/聚晶/goety/frost_breath_focus';
import 图_50 from 'asset:贴图/物品/聚晶/goety/ice_spike_focus';
import 图_51 from 'asset:贴图/物品/聚晶/goety/ice_storm_focus';
import 图_52 from 'asset:贴图/物品/聚晶/goety/hail_focus';
import 图_53 from 'asset:贴图/物品/聚晶/goety/iceology_focus';
import 图_54 from 'asset:贴图/物品/聚晶/goety/blizzard_focus';
import 图_55 from 'asset:贴图/物品/聚晶/goety/chilling_focus';
import 图_56 from 'asset:贴图/物品/聚晶/goety/frost_nova_focus';
import 图_57 from 'asset:贴图/物品/聚晶/goety/frostborn_focus';
import 图_58 from 'asset:贴图/物品/聚晶/goety/swarm_focus';
import 图_59 from 'asset:贴图/物品/聚晶/goety/poison_dart_focus';
import 图_60 from 'asset:贴图/物品/聚晶/goety/blossoming_focus';
import 图_61 from 'asset:贴图/物品/聚晶/goety/grapple_focus';
import 图_62 from 'asset:贴图/物品/聚晶/goety/hunting_focus';
import 图_63 from 'asset:贴图/物品/聚晶/goety/mauling_focus';
import 图_64 from 'asset:贴图/物品/聚晶/goety/slimy_focus';
import 图_65 from 'asset:贴图/物品/聚晶/goety/carrion_focus';
import 图_66 from 'asset:贴图/物品/聚晶/goety/overgrowth_focus';
import 图_67 from 'asset:贴图/物品/聚晶/goety/entangling_focus';
import 图_68 from 'asset:贴图/物品/聚晶/goety/whispering_focus';
import 图_69 from 'asset:贴图/物品/聚晶/goety/leaping_focus';
import 图_70 from 'asset:贴图/物品/聚晶/goety/launch_focus';
import 图_71 from 'asset:贴图/物品/聚晶/goety/flying_focus';
import 图_72 from 'asset:贴图/物品/聚晶/goety/cushion_focus';
import 图_73 from 'asset:贴图/物品/聚晶/goety/whirlwind_focus';
import 图_74 from 'asset:贴图/物品/聚晶/goety/cyclone_focus';
import 图_75 from 'asset:贴图/物品/聚晶/goety/updraft_focus';
import 图_76 from 'asset:贴图/物品/聚晶/goety/wind_blast_focus';
import 图_77 from 'asset:贴图/物品/聚晶/goety/razor_wind_focus';
import 图_78 from 'asset:贴图/物品/聚晶/goety/trembling_focus';
import 图_79 from 'asset:贴图/物品/聚晶/goety/charge_focus';
import 图_80 from 'asset:贴图/物品/聚晶/goety/shocking_focus';
import 图_81 from 'asset:贴图/物品/聚晶/goety/thunderbolt_focus';
import 图_82 from 'asset:贴图/物品/聚晶/goety/electrocute_focus';
import 图_83 from 'asset:贴图/物品/聚晶/goety/surging_focus';
import 图_84 from 'asset:贴图/物品/聚晶/goety/sprightly_focus';
import 图_85 from 'asset:贴图/物品/聚晶/goety/monsoon_focus';
import 图_86 from 'asset:贴图/物品/聚晶/goety/discharge_focus';
import 图_87 from 'asset:贴图/物品/聚晶/goety/bolting_focus';
import 图_88 from 'asset:贴图/物品/聚晶/goety/lightning_focus';
import 图_89 from 'asset:贴图/物品/聚晶/goety/thunderstorm_focus';
import 图_90 from 'asset:贴图/物品/聚晶/goety/water_jet_focus';
import 图_91 from 'asset:贴图/物品/聚晶/goety/bouncy_bubble_focus';
import 图_92 from 'asset:贴图/物品/聚晶/goety/steaming_focus';
import 图_93 from 'asset:贴图/物品/聚晶/goety/trident_storm_focus';
import 图_94 from 'asset:贴图/物品/聚晶/goety/prisma_beam_focus';
import 图_95 from 'asset:贴图/物品/聚晶/goety/guardian_focus';
import 图_96 from 'asset:贴图/物品/聚晶/goety/biomine_focus';
import 图_97 from 'asset:贴图/物品/聚晶/goety/water_whip_focus';
import 图_98 from 'asset:贴图/物品/聚晶/goety/tidal_focus';
import 图_99 from 'asset:贴图/物品/聚晶/goety/fire_breath_focus';
import 图_100 from 'asset:贴图/物品/聚晶/goety/fireball_focus';
import 图_101 from 'asset:贴图/物品/聚晶/goety/lavaball_focus';
import 图_102 from 'asset:贴图/物品/聚晶/goety/bombardment_focus';
import 图_103 from 'asset:贴图/物品/聚晶/goety/meteor_shower_focus';
import 图_104 from 'asset:贴图/物品/聚晶/goety/magma_bomb_focus';
import 图_105 from 'asset:贴图/物品/聚晶/goety/fire_blast_focus';
import 图_106 from 'asset:贴图/物品/聚晶/goety/flame_strike_focus';
import 图_107 from 'asset:贴图/物品/聚晶/goety/wither_skull_focus';
import 图_108 from 'asset:贴图/物品/聚晶/goety/ghastly_focus';
import 图_109 from 'asset:贴图/物品/聚晶/goety/blazing_focus';
import 图_110 from 'asset:贴图/物品/聚晶/goety/hogging_focus';
import 图_111 from 'asset:贴图/物品/聚晶/goety/call_focus';
import 图_112 from 'asset:贴图/物品/聚晶/goety/troop_focus';
import 图_113 from 'asset:贴图/物品/聚晶/goety/recall_focus';
import 图_114 from 'asset:贴图/物品/聚晶/goety/ender_chest_focus';
import 图_115 from 'asset:贴图/物品/聚晶/goety/end_walk_focus';
import 图_116 from 'asset:贴图/物品/聚晶/goety/blink_focus';
import 图_117 from 'asset:贴图/物品/聚晶/goety/banish_focus';
import 图_118 from 'asset:贴图/物品/聚晶/goety/tunnel_focus';
import 图_119 from 'asset:贴图/物品/聚晶/goety/rupture_focus';
import 图_120 from 'asset:贴图/物品/聚晶/goety/stellar_focus';
import 图_121 from 'asset:贴图/物品/聚晶/goety/void_flash_focus';
import 图_122 from 'asset:贴图/物品/聚晶/goety/watching_focus';
import 图_123 from 'asset:贴图/物品/聚晶/goety/blasting_focus';
import 图_124 from 'asset:贴图/物品/聚晶/goety/snaring_focus';
import 图_125 from 'asset:贴图/物品/聚晶/goety_revelation/revelation_focus';
import 图_126 from 'asset:贴图/物品/聚晶/goety_revelation/heretic_focus';
import 图_127 from 'asset:贴图/物品/聚晶/goety_revelation/wither_quietus_focus';
import 图_128 from 'asset:贴图/物品/聚晶/goety_revelation/dementor_focus';
import 图_129 from 'asset:贴图/物品/聚晶/goety_revelation/dragon_nirvana_focus';
import 图_130 from 'asset:贴图/物品/聚晶/goety_revelation/dragon_skyrocket_focus';
import 图_131 from 'asset:贴图/物品/聚晶/goety_revelation/ice_focus';
import 图_132 from 'asset:贴图/物品/聚晶/goety_revelation/shadow_clone_focus';
import 图_133 from 'asset:贴图/物品/聚晶/goety_revelation/nether_meteor_focus';
import 图_134 from 'asset:贴图/物品/聚晶/光环版/fireball_focus';
import 图_135 from 'asset:贴图/物品/聚晶/光环版/barricade_focus';
import 图_136 from 'asset:贴图/物品/聚晶/光环版/cyclone_focus';
import 图_137 from 'asset:贴图/物品/聚晶/光环版/hail_focus';
import 图_138 from 'asset:贴图/物品/聚晶/光环版/skull_focus';
import 图_139 from 'asset:贴图/物品/聚晶/光环版/updraft_focus';
import 图_140 from 'asset:贴图/物品/聚晶/光环版/wither_skull_focus';

export const 聚晶图标 = {
  'goety:empty_focus': 图_0,
  'goety:vexing_focus': 图_1,
  'goety:biting_focus': 图_2,
  'goety:feast_focus': 图_3,
  'goety:teeth_focus': 图_4,
  'goety:shredding_focus': 图_5,
  'goety:illusion_focus': 图_6,
  'goety:ignite_focus': 图_7,
  'goety:soul_bolt_focus': 图_8,
  'goety:magic_bolt_focus': 图_9,
  'goety:sword_focus': 图_10,
  'goety:soul_light_focus': 图_11,
  'goety:glow_light_focus': 图_12,
  'goety:illuminate_focus': 图_13,
  'goety:crafting_focus': 图_14,
  'goety:iron_hide_focus': 图_15,
  'goety:bulwark_focus': 图_16,
  'goety:soul_heal_focus': 图_17,
  'goety:shockwave_focus': 图_18,
  'goety:weakening_focus': 图_19,
  'goety:arrow_rain_focus': 图_20,
  'goety:telekinesis_focus': 图_21,
  'goety:command_focus': 图_22,
  'goety:order_focus': 图_23,
  'goety:sonic_boom_focus': 图_24,
  'goety:corruption_focus': 图_25,
  'goety:rotting_focus': 图_26,
  'goety:osseous_focus': 图_27,
  'goety:ghost_fire_focus': 图_28,
  'goety:reaping_focus': 图_29,
  'goety:spooky_focus': 图_30,
  'goety:phantasm_focus': 图_31,
  'goety:vanguard_focus': 图_32,
  'goety:blackguard_focus': 图_33,
  'goety:leeching_focus': 图_34,
  'goety:killing_focus': 图_35,
  'goety:skull_focus': 图_36,
  'goety:barricade_focus': 图_37,
  'goety:quaking_focus': 图_38,
  'goety:earth_punch_focus': 图_39,
  'goety:smack_stone_focus': 图_40,
  'goety:temblor_clap_focus': 图_41,
  'goety:ministrous_focus': 图_42,
  'goety:pulverize_focus': 图_43,
  'goety:rotation_focus': 图_44,
  'goety:burrowing_focus': 图_45,
  'goety:sensing_focus': 图_46,
  'goety:scatter_focus': 图_47,
  'goety:eruption_focus': 图_48,
  'goety:frost_breath_focus': 图_49,
  'goety:ice_spike_focus': 图_50,
  'goety:ice_storm_focus': 图_51,
  'goety:hail_focus': 图_52,
  'goety:iceology_focus': 图_53,
  'goety:blizzard_focus': 图_54,
  'goety:chilling_focus': 图_55,
  'goety:frost_nova_focus': 图_56,
  'goety:frostborn_focus': 图_57,
  'goety:swarm_focus': 图_58,
  'goety:poison_dart_focus': 图_59,
  'goety:blossoming_focus': 图_60,
  'goety:grapple_focus': 图_61,
  'goety:hunting_focus': 图_62,
  'goety:mauling_focus': 图_63,
  'goety:slimy_focus': 图_64,
  'goety:carrion_focus': 图_65,
  'goety:overgrowth_focus': 图_66,
  'goety:entangling_focus': 图_67,
  'goety:whispering_focus': 图_68,
  'goety:leaping_focus': 图_69,
  'goety:launch_focus': 图_70,
  'goety:flying_focus': 图_71,
  'goety:cushion_focus': 图_72,
  'goety:whirlwind_focus': 图_73,
  'goety:cyclone_focus': 图_74,
  'goety:updraft_focus': 图_75,
  'goety:wind_blast_focus': 图_76,
  'goety:razor_wind_focus': 图_77,
  'goety:trembling_focus': 图_78,
  'goety:charge_focus': 图_79,
  'goety:shocking_focus': 图_80,
  'goety:thunderbolt_focus': 图_81,
  'goety:electrocute_focus': 图_82,
  'goety:surging_focus': 图_83,
  'goety:sprightly_focus': 图_84,
  'goety:monsoon_focus': 图_85,
  'goety:discharge_focus': 图_86,
  'goety:bolting_focus': 图_87,
  'goety:lightning_focus': 图_88,
  'goety:thunderstorm_focus': 图_89,
  'goety:water_jet_focus': 图_90,
  'goety:bouncy_bubble_focus': 图_91,
  'goety:steaming_focus': 图_92,
  'goety:trident_storm_focus': 图_93,
  'goety:prisma_beam_focus': 图_94,
  'goety:guardian_focus': 图_95,
  'goety:biomine_focus': 图_96,
  'goety:water_whip_focus': 图_97,
  'goety:tidal_focus': 图_98,
  'goety:fire_breath_focus': 图_99,
  'goety:fireball_focus': 图_100,
  'goety:lavaball_focus': 图_101,
  'goety:bombardment_focus': 图_102,
  'goety:meteor_shower_focus': 图_103,
  'goety:magma_bomb_focus': 图_104,
  'goety:fire_blast_focus': 图_105,
  'goety:flame_strike_focus': 图_106,
  'goety:wither_skull_focus': 图_107,
  'goety:ghastly_focus': 图_108,
  'goety:blazing_focus': 图_109,
  'goety:hogging_focus': 图_110,
  'goety:call_focus': 图_111,
  'goety:troop_focus': 图_112,
  'goety:recall_focus': 图_113,
  'goety:ender_chest_focus': 图_114,
  'goety:end_walk_focus': 图_115,
  'goety:blink_focus': 图_116,
  'goety:banish_focus': 图_117,
  'goety:tunnel_focus': 图_118,
  'goety:rupture_focus': 图_119,
  'goety:stellar_focus': 图_120,
  'goety:void_flash_focus': 图_121,
  'goety:watching_focus': 图_122,
  'goety:blasting_focus': 图_123,
  'goety:snaring_focus': 图_124,
  'goety_revelation:revelation_focus': 图_125,
  'goety_revelation:heretic_focus': 图_126,
  'goety_revelation:wither_quietus_focus': 图_127,
  'goety_revelation:dementor_focus': 图_128,
  'goety_revelation:dragon_nirvana_focus': 图_129,
  'goety_revelation:dragon_skyrocket_focus': 图_130,
  'goety_revelation:ice_focus': 图_131,
  'goety_revelation:shadow_clone_focus': 图_132,
  'goety_revelation:nether_meteor_focus': 图_133,
} as const;

export type 聚晶注册名 = keyof typeof 聚晶图标;

export const 光环版聚晶图标: Partial<Record<聚晶注册名, string>> = {
  'goety:fireball_focus': 图_134,
  'goety:barricade_focus': 图_135,
  'goety:cyclone_focus': 图_136,
  'goety:hail_focus': 图_137,
  'goety:skull_focus': 图_138,
  'goety:updraft_focus': 图_139,
  'goety:wither_skull_focus': 图_140,
};

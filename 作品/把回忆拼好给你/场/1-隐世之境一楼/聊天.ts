// 驯服那一刻聊天栏同时进来的两行（游戏原样）：先是成就广播，后是万法皆通发的淡紫色那句，所以淡紫在下面。
// 出处：TLM 1.5.3 `EntityMaid.tameMaid` 先触发成就 tamed_maid（goal、announce_to_chat），后发 MaidTamedEvent；标题是 TLM zh_cn 的「欢迎回家，主人」。
//   万法皆通 1.9.3 `MaidSpellEventHandler.onMaidTamed`：隐世之境的女仆被驯服时 sendSystemMessage(「您的手艺，一如既往呢」, LIGHT_PURPLE)，两行都是系统消息。
// 玩家名照当时的规矩「玩家是李樱」（10-24 改成「玩家是史蒂夫」，验证片现状留着，见规矩表备注）。两行都放是计划定的默认，节点 3 给只留一行的备选。
import { type ChatLine, achievementChatLine, extraChatColors } from '@库/界面/聊天栏.tsx';

/** 起刻：驯服那一刻（和 ChatOverlay 的 刻 同一个钟） */
export const tamedChatLines = (startTick: number): ChatLine[] => [
  achievementChatLine('李樱', '欢迎回家，主人', 'goal', startTick),
  { text: '您的手艺，一如既往呢', color: extraChatColors.lightPurple, startTick },
];

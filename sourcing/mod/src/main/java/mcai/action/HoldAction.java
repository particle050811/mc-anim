package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.Game;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.common.capabilities.ForgeCapabilities;
import net.minecraftforge.items.IItemHandler;
import net.minecraftforge.items.IItemHandlerModifiable;

import java.util.List;

/**
 * 主手拿一件物品，可以先往它自己的物品栏（Forge 的 ITEM_HANDLER 能力）里放一件：诡厄的法杖把聚晶放在这里，
 * 「拿下界魔杖、装上霜冻新星聚晶」就是 hold item=goety:nether_staff inner=goety:frost_nova_focus。不认识哪个模组，只走 Forge 的接口。
 */
public class HoldAction implements Action {
    public String name() {
        return "hold";
    }

    public String doc() {
        return "主手拿一件物品（顶掉原来的），inner 给了就先放进这件物品自己的物品栏（法杖里装聚晶这类）";
    }

    public List<Param> params() {
        return List.of(
                Param.must("item", "物品 id", "如 goety:nether_staff"),
                Param.opt("inner", "物品 id", "放进 item 自己物品栏的那件，如 goety:frost_nova_focus"),
                Param.opt("slot", "序号", "inner 放第几格，默认 0"));
    }

    public Where where() {
        return Where.SERVER;
    }

    private static Item item(String id) {
        ResourceLocation r = ResourceLocation.tryParse(id);
        Item it = r == null ? null : BuiltInRegistries.ITEM.get(r);
        if (it == null || it == Items.AIR) throw new ActionException("没有这个物品：" + id);
        return it;
    }

    public JsonElement run(Args args) {
        ServerPlayer p = Game.player();
        ItemStack stack = new ItemStack(item(args.str("item")));
        JsonObject o = new JsonObject();
        o.addProperty("item", args.str("item"));
        if (args.has("inner")) {
            ItemStack in = new ItemStack(item(args.str("inner")));
            IItemHandler h = stack.getCapability(ForgeCapabilities.ITEM_HANDLER).orElse(null);
            if (h == null) throw new ActionException(args.str("item") + " 没有自己的物品栏（ITEM_HANDLER 能力），放不进 inner");
            int slot = (int) args.num("slot", 0);
            if (slot < 0 || slot >= h.getSlots()) throw new ActionException("slot 超出范围：这件物品有 " + h.getSlots() + " 格");
            if (h instanceof IItemHandlerModifiable m) {
                m.setStackInSlot(slot, in);
            } else {
                ItemStack rest = h.insertItem(slot, in, false);
                if (!rest.isEmpty()) throw new ActionException("inner 放不进第 " + slot + " 格（物品栏不收）");
            }
            o.addProperty("inner", args.str("inner"));
        }
        p.setItemInHand(InteractionHand.MAIN_HAND, stack);
        p.inventoryMenu.broadcastChanges();
        return o;
    }
}

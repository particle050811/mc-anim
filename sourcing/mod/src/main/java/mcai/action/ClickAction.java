package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.contents.TranslatableContents;

import java.util.ArrayList;
import java.util.List;

/**
 * 按当前界面上的按钮。没有辅助功能权限、发不了鼠标键盘，碰到必须选一下才能继续的界面
 * （比如第一次打开带模组维度的存档时的“实验性设置”确认）只能靠它。
 */
public class ClickAction implements Action {
    public String name() {
        return "click";
    }

    public String doc() {
        return "按当前界面上的一个按钮（按钮清单在 ready / state 的 screen.buttons 里）";
    }

    public List<Param> params() {
        return List.of(
                Param.opt("text", "按钮文字", "完全相同的优先，否则取包含这段文字的第一个"),
                Param.opt("index", "序号", "buttons 清单里的下标，从 0 开始；和 text 二选一"));
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) {
        Screen screen = Minecraft.getInstance().screen;
        if (screen == null) throw new ActionException("当前没有界面");
        List<AbstractButton> buttons = buttons(screen);
        AbstractButton hit = null;
        if (args.has("index")) {
            int i = (int) args.num("index");
            if (i < 0 || i >= buttons.size()) throw new ActionException("index 超出范围，这个界面有 " + buttons.size() + " 个按钮");
            hit = buttons.get(i);
        } else {
            String text = args.str("text");
            for (AbstractButton b : buttons) if (b.getMessage().getString().equals(text)) hit = hit == null ? b : hit;
            for (AbstractButton b : buttons) if (b.getMessage().getString().contains(text)) hit = hit == null ? b : hit;
            if (hit == null) throw new ActionException("没有找到按钮「" + text + "」，现有：" + describe(screen).get("buttons"));
        }
        if (!hit.active) throw new ActionException("按钮「" + hit.getMessage().getString() + "」现在是灰的，按不了");
        hit.onPress();
        JsonObject o = new JsonObject();
        o.addProperty("clicked", hit.getMessage().getString());
        return o;
    }

    private static List<AbstractButton> buttons(Screen screen) {
        List<AbstractButton> list = new ArrayList<>();
        for (GuiEventListener child : screen.children()) {
            if (child instanceof AbstractButton b && b.visible) list.add(b);
        }
        return list;
    }

    /** 界面的类名、标题、按钮，ready 和 state 共用。 */
    public static JsonObject describe(Screen screen) {
        JsonObject o = new JsonObject();
        o.addProperty("type", screen.getClass().getSimpleName());
        o.addProperty("title", screen.getTitle().getString());
        // 标题的翻译键不随游戏语言变，脚本要认某个界面时用它
        if (screen.getTitle().getContents() instanceof TranslatableContents t) o.addProperty("titleKey", t.getKey());
        JsonArray names = new JsonArray();
        for (AbstractButton b : buttons(screen)) names.add(b.getMessage().getString());
        o.add("buttons", names);
        return o;
    }
}

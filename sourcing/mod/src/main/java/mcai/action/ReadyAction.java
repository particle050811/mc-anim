package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import net.minecraft.client.Minecraft;

import java.util.List;

public class ReadyAction implements Action {
    public String name() {
        return "ready";
    }

    public String doc() {
        return "世界是否加载完、可以接命令了（mcai game start 靠它等游戏起来）";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.CLIENT;
    }

    public boolean exclusive() {
        return false;
    }

    public JsonElement run(Args args) {
        Minecraft mc = Minecraft.getInstance();
        JsonObject o = new JsonObject();
        boolean inWorld = mc.level != null && mc.player != null;
        String why = null;
        if (mc.getOverlay() != null) why = "游戏资源还在加载";
        else if (!inWorld) why = "还没进入世界" + (mc.screen == null ? "" : "，当前界面 " + mc.screen.getClass().getSimpleName());
        else if (mc.screen != null) why = "有界面挡着：" + mc.screen.getClass().getSimpleName() + "（加载界面会自己消失，菜单用 closescreen 关）";
        o.addProperty("ready", why == null);
        o.addProperty("inWorld", inWorld);
        // 没进世界但已经到了标题界面：不带 world 启动时等的是这个
        o.addProperty("atMenu", mc.getOverlay() == null && !inWorld && mc.screen != null);
        if (why != null) o.addProperty("why", why);
        if (mc.screen != null) o.add("screen", ClickAction.describe(mc.screen));
        return o;
    }
}

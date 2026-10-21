package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import net.minecraft.client.Minecraft;

import java.util.List;

public class CloseScreenAction implements Action {
    public String name() {
        return "closescreen";
    }

    public String doc() {
        return "关掉当前挡着的菜单/界面（暂停菜单、背包、聊天栏等），回到游戏";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) {
        Minecraft mc = Minecraft.getInstance();
        JsonObject o = new JsonObject();
        if (mc.screen != null) o.addProperty("closed", mc.screen.getClass().getSimpleName());
        // 在世界里 setScreen(null) 就是回到游戏；没进世界时游戏会自己换回标题界面
        mc.setScreen(null);
        return o;
    }
}

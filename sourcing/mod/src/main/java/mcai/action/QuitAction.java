package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import net.minecraft.client.Minecraft;

import java.util.List;

public class QuitAction implements Action {
    public String name() {
        return "quit";
    }

    public String doc() {
        return "退出游戏（正常流程：存档、关集成服务端、退出进程）";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) {
        // stop 只是置标志，主循环跑完这一轮才真正退出，所以这个请求能正常收到回复
        Minecraft.getInstance().stop();
        return new JsonObject();
    }
}

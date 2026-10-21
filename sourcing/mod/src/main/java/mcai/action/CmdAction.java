package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import mcai.Game;
import net.minecraft.commands.CommandSource;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.network.chat.Component;

import java.util.List;

public class CmdAction implements Action {
    public String name() {
        return "cmd";
    }

    public String doc() {
        return "以最高权限执行任意原版/模组命令并返回输出。执行者是摄像机玩家（@s、~ 相对它）。命令造成的方块变化可以 undo";
    }

    public List<Param> params() {
        return List.of(Param.must("command", "命令文本", "开头的 / 可有可无。命令行里可以直接写 mcai cmd time set day"));
    }

    public Where where() {
        return Where.SERVER;
    }

    public boolean changesWorld() {
        return true;
    }

    public JsonElement run(Args args) {
        JsonArray output = new JsonArray();
        // 自定义命令源只为截获输出：成功和失败的反馈都收进来，不往聊天栏和其他管理员那里发
        CommandSource capture = new CommandSource() {
            public void sendSystemMessage(Component message) {
                output.add(message.getString());
            }

            public boolean acceptsSuccess() {
                return true;
            }

            public boolean acceptsFailure() {
                return true;
            }

            public boolean shouldInformAdmins() {
                return false;
            }
        };
        boolean[] success = {false};
        CommandSourceStack source = Game.player().createCommandSourceStack()
                .withSource(capture)
                .withPermission(4)
                .withCallback((context, ok, result) -> success[0] |= ok);
        int result = Game.server().getCommands().performPrefixedCommand(source, args.str("command"));
        JsonObject o = new JsonObject();
        o.addProperty("success", success[0]);
        o.addProperty("result", result);
        o.add("output", output);
        return o;
    }
}

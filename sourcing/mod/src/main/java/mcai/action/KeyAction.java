package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.InputConstants;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.Input;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

import java.util.List;

public class KeyAction implements Action {
    public String name() {
        return "key";
    }

    public String doc() {
        return "模拟按一下键盘（按下再松开）。走的是和真实键盘完全相同的入口，所以 input off 时同样被挡掉——可以用它验证锁定；要让按键生效先 input on";
    }

    public List<Param> params() {
        return List.of(Param.must("key", "键名", "escape、e、f3、space 等（即 key.keyboard.<键名>）"));
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) {
        Minecraft mc = Minecraft.getInstance();
        int code;
        try {
            code = InputConstants.getKey("key.keyboard." + args.str("key").toLowerCase()).getValue();
        } catch (IllegalArgumentException e) {
            throw new ActionException("不认识的键名：" + args.str("key"));
        }
        long window = mc.getWindow().getWindow();
        mc.keyboardHandler.keyPress(window, code, 0, GLFW.GLFW_PRESS, 0);
        mc.keyboardHandler.keyPress(window, code, 0, GLFW.GLFW_RELEASE, 0);
        JsonObject o = new JsonObject();
        o.addProperty("delivered", Input.enabled);
        if (!Input.enabled) o.addProperty("note", "input 是 off，这次按键被锁定挡掉了");
        return o;
    }
}

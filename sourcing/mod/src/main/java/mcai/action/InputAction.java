package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.Input;

import java.util.List;

public class InputAction implements Action {
    public String name() {
        return "input";
    }

    public String doc() {
        return "用户输入开关。默认 off：窗口隐藏，鼠标键盘都不生效（不会挪机位、不会弹菜单）；on：显示窗口并放开输入，给人自己进游戏操作用。命令行写 mcai input on / off";
    }

    public List<Param> params() {
        return List.of(Param.opt("state", "on|off", "不写就只查询当前状态"));
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) {
        if (args.has("state")) {
            String s = args.str("state");
            if (!s.equals("on") && !s.equals("off")) throw new ActionException("state 只能是 on 或 off");
            Input.set(s.equals("on"));
        }
        JsonObject o = new JsonObject();
        o.addProperty("input", Input.enabled ? "on" : "off");
        return o;
    }
}

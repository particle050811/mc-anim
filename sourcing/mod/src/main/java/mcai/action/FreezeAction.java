package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import mcai.Freeze;

import java.util.List;

/** freeze 和 unfreeze 共用一个类，注册两次。 */
public class FreezeAction implements Action {
    private final boolean freeze;

    public FreezeAction(boolean freeze) {
        this.freeze = freeze;
    }

    public String name() {
        return freeze ? "freeze" : "unfreeze";
    }

    public String doc() {
        return freeze ? "冻结世界：停掉实体、方块实体、随机刻、计划刻、时间天气、刷怪；玩家移动和区块加载照常" : "解冻";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        // 放在服务端线程上切换，保证开关落在两个 tick 之间，不会出现半个 tick 冻住
        return Where.SERVER;
    }

    public JsonElement run(Args args) {
        Freeze.frozen = freeze;
        JsonObject o = new JsonObject();
        o.addProperty("frozen", freeze);
        return o;
    }
}

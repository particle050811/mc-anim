package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Actions;
import mcai.Args;
import mcai.Undo;

import java.util.List;

public class BatchAction implements Action {
    public String name() {
        return "batch";
    }

    public String doc() {
        return "按顺序执行多个动作，遇到失败就停。整个 batch 里的改动算一次 undo";
    }

    public List<Param> params() {
        return List.of(Param.must("steps", "[{action,args}]", "命令行里写成 mcai batch 'cam pos=.. look=..' 'shoot out=a.png'，每一步一个引号参数"));
    }

    public Where where() {
        // 草案想的是“同一个 tick 内执行”，但 shoot 要跨很多帧等区块，做不到；
        // 改成在 HTTP 线程上逐个调度，需要画面静止就在 batch 前先 freeze
        return Where.HTTP;
    }

    public JsonElement run(Args args) throws Exception {
        if (!args.raw("steps").isJsonArray()) throw new ActionException("steps 要是数组");
        JsonArray results = new JsonArray();
        Undo.beginGroup("batch");
        try {
            for (JsonElement step : args.raw("steps").getAsJsonArray()) {
                JsonObject s = step.getAsJsonObject();
                String action = s.get("action").getAsString();
                JsonObject r = new JsonObject();
                r.addProperty("action", action);
                results.add(r);
                try {
                    r.add("result", Actions.call(action, new Args(s.has("args") ? s.getAsJsonObject("args") : new JsonObject(), args.cwd())));
                } catch (ActionException e) {
                    throw new ActionException("第 " + results.size() + " 步 " + action + " 失败：" + e.getMessage() + "（前面的步骤已执行）");
                }
            }
        } finally {
            Undo.endGroup();
        }
        return results;
    }
}

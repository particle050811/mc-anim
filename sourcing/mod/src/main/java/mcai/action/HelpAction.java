package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Actions;
import mcai.Args;

import java.util.List;

public class HelpAction implements Action {
    public String name() {
        return "help";
    }

    public String doc() {
        return "列出全部动作和参数（直接从注册表生成）";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.HTTP;
    }

    public boolean exclusive() {
        return false;
    }

    public JsonElement run(Args args) {
        JsonArray list = new JsonArray();
        for (Action a : Actions.all()) {
            JsonObject o = new JsonObject();
            o.addProperty("name", a.name());
            o.addProperty("doc", a.doc());
            o.addProperty("where", a.where().name());
            o.addProperty("changesWorld", a.changesWorld());
            JsonArray params = new JsonArray();
            for (Param p : a.params()) {
                JsonObject po = new JsonObject();
                po.addProperty("name", p.name());
                po.addProperty("format", p.format());
                po.addProperty("required", p.required());
                po.addProperty("doc", p.doc());
                params.add(po);
            }
            o.add("params", params);
            list.add(o);
        }
        return list;
    }
}

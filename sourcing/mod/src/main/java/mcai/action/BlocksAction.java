package mcai.action;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import mcai.Game;
import mcai.gamedata.BlockTable;
import mcai.gamedata.GameData;
import mcai.gamedata.Png;
import mcai.gamedata.forge1201.ForgeGameData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/** 导出方块表（结构见 {@link BlockTable}）：每个方块状态的面、贴图、染色。版本相关的取数在 {@link GameData} 后面。 */
public class BlocksAction implements Action {
    public String name() {
        return "blocks";
    }

    public String doc() {
        return "把每个方块状态在游戏里烘焙好的面（贴图、染色索引、剔除方向）导成方块表 <out>.json + <out>.png，模组模型和启用的资源包自动带上";
    }

    public List<Param> params() {
        return List.of(
                Param.must("out", "路径", "不带扩展名，写 <out>.json 和 <out>.png（贴图 16×16 竖排）"),
                Param.opt("only", "方块id,方块id", "只导这些方块，可用 * 通配，如 minecraft:*,twilightforest:*_leaves；默认全部"));
    }

    public Where where() {
        // 取面要在渲染线程上；编 PNG、写文件挪回 HTTP 线程，不让游戏多卡
        return Where.HTTP;
    }

    public JsonElement run(Args args) throws Exception {
        long t0 = System.nanoTime();
        Predicate<String> keep = filter(args.str("only", "*"));
        JsonObject params = new JsonObject();
        if (args.has("only")) params.addProperty("only", args.str("only"));
        BlockTable.Result r = Game.onClient(() -> {
            GameData game = new ForgeGameData();
            return BlockTable.build(game, game.blocks(), keep, params);
        });
        long t1 = System.nanoTime();
        Path out = args.path("out");
        Path json = out.resolveSibling(out.getFileName() + ".json"), png = out.resolveSibling(out.getFileName() + ".png");
        if (json.getParent() != null) Files.createDirectories(json.getParent());
        Files.writeString(json, new GsonBuilder().disableHtmlEscaping().create().toJson(r.json()), StandardCharsets.UTF_8);
        Files.write(png, Png.encode(16, 16 * r.textures().size(), BlockTable.strip(r.textures(), r.pixels())));
        JsonObject res = new JsonObject();
        res.addProperty("out", json.toString());
        res.add("统计", r.json().get("统计"));
        JsonArray warnings = new JsonArray();
        r.warnings().forEach(warnings::add);
        res.add("提醒", warnings);
        JsonObject secs = new JsonObject();
        secs.addProperty("取面", Math.round((t1 - t0) / 1e8) / 10.0);
        secs.addProperty("写文件", Math.round((System.nanoTime() - t1) / 1e8) / 10.0);
        res.add("seconds", secs);
        return res;
    }

    /** 方块 id 的通配（* 任意串），按方块 id 匹配，不管属性 */
    static Predicate<String> filter(String spec) {
        Pattern[] ps = java.util.Arrays.stream(spec.split(",")).map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> Pattern.compile(Pattern.quote(s).replace("*", "\\E.*\\Q"))).toArray(Pattern[]::new);
        return state -> {
            int i = state.indexOf('[');
            String id = i < 0 ? state : state.substring(0, i);
            for (Pattern p : ps) if (p.matcher(id).matches()) return true;
            return false;
        };
    }
}

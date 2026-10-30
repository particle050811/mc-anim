package mcai.action;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import mcai.gamedata.BiomeTable;
import mcai.gamedata.GameData;
import mcai.gamedata.forge1201.ForgeGameData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** 导出群系色表（结构见 {@link BiomeTable}）。版本相关的取数在 {@link GameData} 后面。 */
public class BiomesAction implements Action {
    public String name() {
        return "biomes";
    }

    public String doc() {
        return "导出当前世界注册的每个群系的草、树叶、水、天空、雾色和气候（游戏自己的取色函数在固定采样点上的值），写成 <out>.json";
    }

    public List<Param> params() {
        return List.of(
                Param.must("out", "路径", "不带扩展名，写 <out>.json"),
                Param.opt("samples", "个数", "采样点个数，默认 64；草、叶色在各点不一样的记成随位置变，并写下各点的颜色"));
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) throws Exception {
        int n = (int) args.num("samples", 64);
        JsonObject params = new JsonObject();
        params.addProperty("samples", n);
        GameData game = new ForgeGameData();
        JsonObject table = BiomeTable.build(game, game.biomes(), n, params);
        Path out = args.path("out");
        Path json = out.resolveSibling(out.getFileName() + ".json");
        if (json.getParent() != null) Files.createDirectories(json.getParent());
        Files.writeString(json, new GsonBuilder().disableHtmlEscaping().setPrettyPrinting().create().toJson(table) + "\n", StandardCharsets.UTF_8);
        JsonObject r = new JsonObject();
        r.addProperty("out", json.toString());
        JsonObject biomes = table.getAsJsonObject("群系");
        r.addProperty("群系", biomes.size());
        JsonArray varying = new JsonArray();
        biomes.entrySet().forEach(e -> {
            if (e.getValue().getAsJsonObject().has("采样")) varying.add(e.getKey());
        });
        r.add("随位置", varying);
        return r;
    }
}

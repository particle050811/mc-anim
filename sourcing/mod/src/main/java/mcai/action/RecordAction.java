package mcai.action;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.Game;
import mcai.record.Recorder;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 录制：从现在起录 ticks 个客户端刻，粒子（构造完的实例字段 + 每刻快照）、半径内的实体（每刻位姿 + 服务端存档 NBT）、声音、诡厄的施法事件，
 * 写成一份 JSON（格式见 docs/决策/0016-法术录制.md）。use=1 时第 pre 刻「按一下右键」（走游戏的 startUseItem），
 * 蓄力、引导的物品按住到不再使用或 hold 刻。施法者就是当前玩家：先 tp 好、hold 好法杖再录。
 */
public class RecordAction implements Action {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    public String name() {
        return "record";
    }

    public String doc() {
        return "录 ticks 刻的粒子、实体、声音（以当前玩家为施法者，半径 radius 内），写成 JSON；use=1 在第 pre 刻按右键用主手物品";
    }

    public List<Param> params() {
        return List.of(
                Param.must("out", "文件路径", "JSON 存到哪，相对路径按 mcai 的当前目录算"),
                Param.must("ticks", "刻数", "录多少个客户端刻（不含 pre）"),
                Param.opt("radius", "格", "离施法者多远以内的粒子、实体才记，默认 32"),
                Param.opt("target", "x,y,z", "目标点（只记进文件，回放时按施法者→目标重新摆）"),
                Param.opt("use", "0|1", "1 = 第 pre 刻按右键，默认 0"),
                Param.opt("pre", "刻数", "开录后第几刻按右键，默认 5；录的总刻数是 pre + ticks"),
                Param.opt("hold", "刻数", "右键最多按住几刻，默认按住到物品不再「使用中」（最长录到结束）"),
                Param.opt("seed", "整数", "按之前把服务端世界和玩家的随机数设成这个种子（粒子自己的随机数管不到，见决策记录）"),
                Param.opt("note", "文字", "写进文件的说明"));
    }

    public Where where() {
        return Where.HTTP;
    }

    public JsonElement run(Args args) throws Exception {
        Path out = args.path("out");
        Recorder.Params p = new Recorder.Params();
        int ticks = (int) args.num("ticks");
        if (ticks <= 0) throw new ActionException("ticks 要大于 0");
        p.radius = args.num("radius", 32);
        if (args.has("target")) p.target = args.vec("target");
        p.use = args.num("use", 0) != 0;
        p.pre = (int) args.num("pre", 5);
        p.hold = (int) args.num("hold", -1);
        p.note = args.has("note") ? args.str("note") : null;
        if (Recorder.active()) throw new ActionException("已经在录了（上一次没停？）");
        if (args.has("seed")) {
            long seed = (long) args.num("seed");
            Game.onServer(() -> {
                var pl = Game.player();
                pl.serverLevel().random.setSeed(seed);
                pl.getRandom().setSeed(seed);
                return null;
            });
        }
        Game.onClient(() -> Recorder.start(p));
        int total = p.pre + ticks;
        // 客户端 20 刻/秒；给 4 倍余量再加 30 秒（区块加载、卡顿）
        long deadline = System.currentTimeMillis() + total * 200L + 30_000;
        try {
            while (Game.onClient(Recorder::tick) < total) {
                if (System.currentTimeMillis() > deadline) throw new ActionException("等了太久：只录到 " + Recorder.tick() + " / " + total + " 刻（游戏卡住或暂停了？）");
                Thread.sleep(20);
            }
        } catch (Exception e) {
            Game.onClient(Recorder::stop);
            throw e;
        }
        // 先不再记新东西，再等服务端把排着的「取实体 NBT」做完，最后才整理（NBT 是异步填进去的）
        Game.onClient(() -> {
            Recorder.pause();
            return null;
        });
        Game.onServer(() -> null);
        JsonObject data = Game.onClient(Recorder::stop);
        Files.createDirectories(out.toAbsolutePath().getParent());
        Files.writeString(out, GSON.toJson(data), StandardCharsets.UTF_8);
        JsonObject o = new JsonObject();
        o.addProperty("out", out.toString());
        o.addProperty("刻数", data.get("刻数").getAsInt());
        o.addProperty("粒子", data.getAsJsonArray("粒子").size());
        o.addProperty("实体", data.getAsJsonArray("实体").size());
        o.addProperty("声音", data.getAsJsonArray("声音").size());
        o.addProperty("事件", data.getAsJsonArray("事件").size());
        o.addProperty("按下刻", data.get("按下刻").getAsInt());
        return o;
    }
}

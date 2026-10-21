package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.Args;
import mcai.Game;
import net.minecraft.commands.arguments.blocks.BlockInput;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;

import java.util.List;

public class FillAction implements Action {
    public String name() {
        return "fill";
    }

    public String doc() {
        return "把一个长方体区域填成同一种方块（可 undo）。没有 /fill 的 32768 格上限";
    }

    public List<Param> params() {
        return List.of(
                Param.must("from", "x,y,z", "一个角"),
                Param.must("to", "x,y,z", "对角（含）"),
                Param.must("block", "方块", "和 /setblock 同样的写法"),
                Param.opt("dim", "维度 id", "不写就是当前维度"));
    }

    public Where where() {
        return Where.SERVER;
    }

    public boolean changesWorld() {
        return true;
    }

    public JsonElement run(Args args) {
        ServerLevel level = Game.level(args);
        BlockInput block = SetBlockAction.parse(level, args.str("block"));
        int changed = 0;
        for (BlockPos pos : BlockPos.betweenClosed(BlockPos.containing(args.vec("from")), BlockPos.containing(args.vec("to")))) {
            if (block.place(level, pos, SetBlockAction.FLAGS)) changed++;
        }
        JsonObject o = new JsonObject();
        o.addProperty("changed", changed);
        return o;
    }
}

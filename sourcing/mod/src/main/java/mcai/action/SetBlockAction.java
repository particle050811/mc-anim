package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.Game;
import net.minecraft.commands.arguments.blocks.BlockInput;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;

import java.util.List;

public class SetBlockAction implements Action {
    public String name() {
        return "setblock";
    }

    public String doc() {
        return "放一个方块（可 undo）";
    }

    public List<Param> params() {
        return List.of(
                Param.must("pos", "x,y,z", "方块坐标"),
                Param.must("block", "方块", "和 /setblock 同样的写法，如 minecraft:oak_stairs[facing=east]，可带 {NBT}"),
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
        boolean changed = parse(level, args.str("block")).place(level, BlockPos.containing(args.vec("pos")), FLAGS);
        JsonObject o = new JsonObject();
        o.addProperty("changed", changed ? 1 : 0);
        return o;
    }

    /**
     * 只通知客户端，不给邻居发方块更新：悬空的沙子不会马上掉，红石、水流不会被触发。
     * 邻居的“形状更新”照常（栅栏、墙、玻璃板会和新方块连起来，失去支撑的花草会掉），摆景要的就是这个效果；
     * 这些连带变化发生在动作执行期间，undo 会一并恢复。要完整的原版行为用 cmd 跑 /setblock。
     */
    static final int FLAGS = Block.UPDATE_CLIENTS;

    static BlockInput parse(ServerLevel level, String text) {
        try {
            BlockStateParser.BlockResult r = BlockStateParser.parseForBlock(level.holderLookup(Registries.BLOCK), text, true);
            return new BlockInput(r.blockState(), r.properties().keySet(), r.nbt());
        } catch (CommandSyntaxException e) {
            throw new ActionException("方块写法不对：" + e.getMessage());
        }
    }
}

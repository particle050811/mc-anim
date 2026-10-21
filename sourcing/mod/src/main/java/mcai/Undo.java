package mcai;

import com.google.gson.JsonObject;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Clearable;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraftforge.event.entity.EntityJoinLevelEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 撤销。做法：改世界的动作执行期间，服务端上每次方块写入（`LevelChunkMixin` 挂在 `LevelChunk.setBlockState` 上）都把该位置“改之前”的方块状态和方块实体数据记下来，
 * 所以 cmd 里的 /fill、/clone、/place 也能撤销，不用解析命令。期间新生成的实体（掉落物、召唤的生物）也记下来，撤销时一并删掉。
 *
 * 简化掉的部分：
 * - 只改方块实体数据、不换方块的操作（/data merge block、往箱子里放东西）不记录；
 * - 动作返回之后才发生的连锁变化（沙子下落、水流、红石）不算，要干净就先 freeze 再改；
 * - 被命令删掉的实体（/kill）不会复活；记录只在内存里，退出游戏就没了。
 */
public final class Undo {
    /** 动作执行期间生成的实体都打这个标签，想手动清场可以 /kill @e[tag=mcai]（中文标签在选择器里要加引号，所以用英文） */
    public static final String TAG = "mcai";
    private static final int MAX_DEPTH = 50;

    private record Change(BlockState state, CompoundTag nbt) {
    }

    private static final class Entry {
        final String label;
        final Map<GlobalPos, Change> blocks = new LinkedHashMap<>();
        final List<Entity> entities = new ArrayList<>();

        Entry(String label) {
            this.label = label;
        }
    }

    private static final Deque<Entry> STACK = new ArrayDeque<>();
    /** batch 开的组：组里各个动作的改动记进同一条，整个 batch 算一次撤销。 */
    private static volatile Entry group;
    /** 正在记录的那一条。只在改世界的动作同步执行的那一小段时间里非空。 */
    private static volatile Entry current;

    private Undo() {
    }

    /**
     * 服务端线程上，一个改世界的动作开始/结束时调。
     * 只在动作本身执行的这一段里记录，不从 batch 开始记到结束：batch 里夹着 cam、shoot 会跨很多 tick，
     * 期间新区块生成的收尾、自然刷怪都会被当成“这次的改动”，一撤销就把无关的地形改坏。
     */
    public static void open(String label) {
        current = group != null ? group : new Entry(label);
    }

    public static void close() {
        Entry entry = current;
        current = null;
        if (group == null) push(entry);
    }

    public static void beginGroup(String label) {
        group = new Entry(label);
    }

    public static void endGroup() {
        Entry entry = group;
        group = null;
        push(entry);
    }

    private static void push(Entry entry) {
        // 没改到世界的动作（比如 cmd 里只跑了 tp）不占撤销栈
        if (entry.blocks.isEmpty() && entry.entities.isEmpty()) return;
        synchronized (STACK) {
            STACK.addLast(entry);
            if (STACK.size() > MAX_DEPTH) STACK.removeFirst();
        }
    }

    public static int depth() {
        synchronized (STACK) {
            return STACK.size();
        }
    }

    /** LevelChunkMixin 在方块真正被改掉之前调用。 */
    public static void beforeBlockChange(LevelChunk chunk, BlockPos pos) {
        Entry entry = current;
        if (entry == null || !(chunk.getLevel() instanceof ServerLevel level)) return;
        GlobalPos key = GlobalPos.of(level.dimension(), pos.immutable());
        // 同一格被改多次时只留第一次看到的，那才是动作开始前的样子
        if (entry.blocks.containsKey(key)) return;
        BlockEntity be = chunk.getBlockEntity(pos);
        entry.blocks.put(key, new Change(chunk.getBlockState(pos), be == null ? null : be.saveWithFullMetadata()));
    }

    @SubscribeEvent
    public static void onEntityJoin(EntityJoinLevelEvent event) {
        Entry entry = current;
        if (entry == null || event.loadedFromDisk() || event.getLevel().isClientSide() || event.getEntity() instanceof Player) return;
        event.getEntity().addTag(TAG);
        entry.entities.add(event.getEntity());
    }

    /** 在服务端线程上撤销最近一条记录。 */
    public static JsonObject undoLast(MinecraftServer server) {
        Entry entry;
        synchronized (STACK) {
            entry = STACK.pollLast();
        }
        if (entry == null) throw new ActionException("没有可以撤销的动作");
        int removed = 0;
        for (Entity e : entry.entities) {
            if (!e.isRemoved()) {
                e.discard();
                removed++;
            }
        }
        for (Map.Entry<GlobalPos, Change> it : entry.blocks.entrySet()) {
            ServerLevel level = server.getLevel(it.getKey().dimension());
            BlockPos pos = it.getKey().pos();
            Change old = it.getValue();
            // 先清空容器，否则换掉箱子时里面的东西会掉一地
            Clearable.tryClear(level.getBlockEntity(pos));
            // UPDATE_KNOWN_SHAPE：原样放回去，不让邻居跟着更新形状（否则恢复到一半时火把、门之类会被挤掉）
            level.setBlock(pos, old.state, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS);
            if (old.nbt != null) {
                BlockEntity be = level.getBlockEntity(pos);
                if (be != null) {
                    be.load(old.nbt);
                    be.setChanged();
                    level.getChunkSource().blockChanged(pos);
                }
            }
        }
        JsonObject out = new JsonObject();
        out.addProperty("undone", entry.label);
        out.addProperty("blocks", entry.blocks.size());
        out.addProperty("entities", removed);
        out.addProperty("remaining", depth());
        return out;
    }
}

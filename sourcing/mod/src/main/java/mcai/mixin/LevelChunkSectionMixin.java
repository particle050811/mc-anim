package mcai.mixin;

import com.mojang.logging.LogUtils;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.chunk.MissingPaletteEntryException;
import net.minecraft.world.level.chunk.PalettedContainer;
import org.slf4j.Logger;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

import java.lang.invoke.VarHandle;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 读方块时碰上调色板正在扩容（MissingPaletteEntryException）就稍等重读，不让异常抛出去。
 *
 * 这是原版的数据竞争：生成区块时别的线程正往同一个区段写方块，调色板先记下新下标、新条目还没对读的线程可见，
 * 读到的下标就在调色板里查不到。苹果芯片（arm64）的内存序弱，比 x86 容易碰上。光照线程碰上时异常一路抛出 ProcessorMailbox，
 * 光照的任务队列从此停掉，所有等光照的区块都卡住，预生成停在原地，停服时存盘也会等它们等到超时被强杀。
 * 2026-10-04 暮色放大-1752 用 Chunky 预生成到 13 万区块时碰上一次（光照线程读 ProtoChunk.getBlockState），
 * 之后 11 分钟一个区块也没生成。所以在所有读方块都要经过的 LevelChunkSection.getBlockState 里接住它：
 * 写的那边一般几微秒就写完，重读就是对的；重读 1 秒还不对说明调色板真坏了，照原样抛出去。
 */
@Mixin(LevelChunkSection.class)
public class LevelChunkSectionMixin {
    @Unique
    private static final Logger mcai$LOG = LogUtils.getLogger();
    @Unique
    private static final AtomicInteger mcai$races = new AtomicInteger();

    @Redirect(method = "getBlockState(III)Lnet/minecraft/world/level/block/state/BlockState;",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/chunk/PalettedContainer;get(III)Ljava/lang/Object;"))
    private Object mcai$getRetrying(PalettedContainer<?> states, int x, int y, int z) {
        try {
            return states.get(x, y, z);
        } catch (MissingPaletteEntryException first) {
            long deadline = System.nanoTime() + 1_000_000_000L;
            for (int i = 0; ; i++) {
                if (i < 100) Thread.onSpinWait();
                else Thread.yield();
                VarHandle.fullFence();
                try {
                    Object state = states.get(x, y, z);
                    int n = mcai$races.incrementAndGet();
                    if (n <= 20 || n % 100 == 0) mcai$LOG.warn("读方块碰上调色板扩容（原版的数据竞争），重读 {} 次后读到了；累计 {} 次", i + 1, n);
                    return state;
                } catch (MissingPaletteEntryException again) {
                    if (System.nanoTime() > deadline) throw again;
                }
            }
        }
    }
}

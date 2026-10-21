package mcai.mixin;

import mcai.BigJigsaw;
import net.minecraft.core.RegistryAccess;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.chunk.storage.ChunkSerializer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

import java.util.function.LongPredicate;
import java.util.stream.LongStream;

/**
 * 读区块时留下大拼图结构的远引用（见 BigJigsaw 第 4 条）：原版 unpackStructureReferences 把离区块超过 8 个区块的引用当坏数据丢掉
 * （lambda 里写死的 8，打 Found invalid structure reference）。这里把那一道过滤换成「BigJigsaw.maxReach() 以内的留下，再远的照原版」。
 * 世界里没有大结构时 maxReach 是 8，和原版一样。不改 lambda 本身（它的名字在 SRG 里另编了号），改的是调 LongStream.filter 的那一下。
 */
@Mixin(ChunkSerializer.class)
public abstract class ChunkSerializerMixin {
    @Redirect(method = "unpackStructureReferences", at = @At(value = "INVOKE", target = "Ljava/util/stream/LongStream;filter(Ljava/util/function/LongPredicate;)Ljava/util/stream/LongStream;", remap = false))
    private static LongStream mcai$keepFar(LongStream refs, LongPredicate vanilla, RegistryAccess ra, ChunkPos pos, CompoundTag tag) {
        int r = BigJigsaw.maxReach();
        if (r <= BigJigsaw.VANILLA_REACH) return refs.filter(vanilla);
        return refs.filter(ref -> new ChunkPos(ref).getChessboardDistance(pos) <= r || vanilla.test(ref));
    }
}

package mcai.mixin;

import com.mojang.serialization.Codec;
import mcai.BigJigsaw;
import net.minecraft.world.level.levelgen.structure.structures.JigsawStructure;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * 拼图结构的编解码放宽范围（见 BigJigsaw 第 1 条）：原版 size 0～7、max_distance_from_center 1～128（加地形适配 ≤ 128），
 * 写在 CODEC 的建造 lambda 里（Codec.intRange(0, 7)、intRange(1, 128)）。不去改 lambda（它的名字在 SRG 里另编了号），
 * 而是在类初始化的最后把整个 CODEC 换成 BigJigsaw.codec()：StructureType.JIGSAW 注册时读的是这个字段，
 * 读之前 JVM 已经把 JigsawStructure 初始化完（含这里），所以注册进去的就是放宽的那份。原版的数都在新范围里，读出来一样。
 */
@Mixin(JigsawStructure.class)
public abstract class JigsawStructureMixin {
    @Shadow
    @Final
    @Mutable
    public static Codec<JigsawStructure> CODEC;

    @Inject(method = "<clinit>", at = @At("TAIL"))
    private static void mcai$wideCodec(CallbackInfo ci) {
        CODEC = BigJigsaw.codec();
    }
}

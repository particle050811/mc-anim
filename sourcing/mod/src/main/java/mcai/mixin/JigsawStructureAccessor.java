package mcai.mixin;

import net.minecraft.core.Holder;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.heightproviders.HeightProvider;
import net.minecraft.world.level.levelgen.structure.pools.StructureTemplatePool;
import net.minecraft.world.level.levelgen.structure.structures.JigsawStructure;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.util.Optional;

/** 拼图结构的各个参数（原版都是 private）：BigJigsaw 的放宽编解码写回数据包、算引用半径用 */
@Mixin(JigsawStructure.class)
public interface JigsawStructureAccessor {
    @Accessor("startPool")
    Holder<StructureTemplatePool> mcai$startPool();

    @Accessor("startJigsawName")
    Optional<ResourceLocation> mcai$startJigsawName();

    @Accessor("maxDepth")
    int mcai$maxDepth();

    @Accessor("startHeight")
    HeightProvider mcai$startHeight();

    @Accessor("useExpansionHack")
    boolean mcai$useExpansionHack();

    @Accessor("projectStartToHeightmap")
    Optional<Heightmap.Types> mcai$projectStartToHeightmap();

    @Accessor("maxDistanceFromCenter")
    int mcai$maxDistanceFromCenter();
}

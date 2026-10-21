package mcai.mixin;

import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.StructureManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** StructureManager 的 level（原版 private）：FillBiome 在群系那一步从这里拿 WorldGenRegion → ServerLevel，按 BigJigsaw 的缓存找结构起点 */
@Mixin(StructureManager.class)
public interface StructureManagerAccessor {
    @Accessor("level")
    LevelAccessor mcai$level();
}

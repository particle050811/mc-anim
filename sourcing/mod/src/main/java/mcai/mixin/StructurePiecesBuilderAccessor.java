package mcai.mixin;

import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePiecesBuilder;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.util.List;

/** 结构生成中已摆好的各件（第 0 件是起始件）。FinalCastleMazeTower13ComponentMixin 用它取终焉城堡主楼 */
@Mixin(StructurePiecesBuilder.class)
public interface StructurePiecesBuilderAccessor {
    @Accessor("pieces")
    List<StructurePiece> mcai$pieces();
}

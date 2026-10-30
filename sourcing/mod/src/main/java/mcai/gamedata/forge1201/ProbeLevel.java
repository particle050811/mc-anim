package mcai.gamedata.forge1201;

import mcai.gamedata.TintProbe;
import net.minecraft.client.renderer.BiomeColors;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.ColorResolver;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.lighting.LevelLightEngine;
import net.minecraft.world.level.material.FluidState;

/** 问染色函数用的假世界（见 {@link TintProbe}）：只在 POS[set] 有这一个方块，被问到群系色时回第 set 组暗号。 */
final class ProbeLevel implements BlockAndTintGetter {
    static final BlockPos[] POS = {new BlockPos(0, 64, 0), new BlockPos(1234, 70, -987)};
    private final int set;
    private final BlockState state;

    ProbeLevel(int set, BlockState state) {
        this.set = set;
        this.state = state;
    }

    public int getBlockTint(BlockPos pos, ColorResolver resolver) {
        int i = resolver == BiomeColors.GRASS_COLOR_RESOLVER ? 0 : resolver == BiomeColors.FOLIAGE_COLOR_RESOLVER ? 1 : resolver == BiomeColors.WATER_COLOR_RESOLVER ? 2 : 3;
        return TintProbe.sentinel(set, i);
    }

    public float getShade(Direction direction, boolean shade) {
        return 1.0F;
    }

    public LevelLightEngine getLightEngine() {
        return null;
    }

    public BlockEntity getBlockEntity(BlockPos pos) {
        return null;
    }

    public BlockState getBlockState(BlockPos pos) {
        return pos.equals(POS[set]) ? state : Blocks.AIR.defaultBlockState();
    }

    public FluidState getFluidState(BlockPos pos) {
        return getBlockState(pos).getFluidState();
    }

    public int getHeight() {
        return 384;
    }

    public int getMinBuildHeight() {
        return -64;
    }
}

package mcai.mixin;

import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** 录制读贴图粒子当前用的那一格（setSpriteFromAge、pickSprite 选出来的），回放按名字找贴图，不用知道选帧规则。 */
@Mixin(TextureSheetParticle.class)
public interface TextureSheetParticleAccessor {
    @Accessor("sprite")
    TextureAtlasSprite mcai$getSprite();
}

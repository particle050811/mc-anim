package mcai.mixin;

import net.minecraft.client.resources.sounds.AbstractSoundInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** 录制读声音实例的原始音量、音高（playSound 给的那两个数）：PlaySoundEvent 时还没 resolve，getVolume() 要乘变体的音量会空指针。 */
@Mixin(AbstractSoundInstance.class)
public interface AbstractSoundInstanceAccessor {
    @Accessor("volume")
    float mcai$getVolume();

    @Accessor("pitch")
    float mcai$getPitch();
}

package sample;

import net.minecraft.world.entity.Entity;

public class SampleEntity extends Entity {
    public boolean aggressive;
    public Mode mode = Mode.WALK;
    public float health = 20.0F;
    public int tick;

    public boolean isAggressive() {
        return aggressive;
    }

    public Mode getMode() {
        return mode;
    }

    public float getHealth() {
        return health;
    }

    public SampleEntity getRider() {
        return null;
    }
}

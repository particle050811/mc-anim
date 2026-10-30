package sample;

public enum Mode {
    WALK(0.5F), RUN(1.25F), SIT(0.0F), FLY(-0.75F);

    private final float k;

    Mode(float k) {
        this.k = k;
    }

    public float k() {
        return k;
    }

    public boolean airborne() {
        return this == FLY;
    }
}

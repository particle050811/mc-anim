package net.minecraft.util;

/** 测试桩：实现照 1.20.1 的 Mth（翻译器把这些当内建函数，这里给 JVM 跑出真值） */
public class Mth {
    private static final float[] SIN = new float[65536];

    static {
        for (int i = 0; i < SIN.length; ++i) SIN[i] = (float) Math.sin((double) i * Math.PI * 2.0D / 65536.0D);
    }

    public static float sin(float value) {
        return SIN[(int) (value * 10430.378F) & '￿'];
    }

    public static float cos(float value) {
        return SIN[(int) (value * 10430.378F + 16384.0F) & '￿'];
    }

    public static float sqrt(float value) {
        return (float) Math.sqrt((double) value);
    }

    public static float clamp(float value, float min, float max) {
        return value < min ? min : Math.min(value, max);
    }

    public static float lerp(float delta, float start, float end) {
        return start + delta * (end - start);
    }

    public static double lerp(double delta, double start, double end) {
        return start + delta * (end - start);
    }

    public static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    public static double clamp(double value, double min, double max) {
        return value < min ? min : Math.min(value, max);
    }

    public static int floor(float value) {
        int i = (int) value;
        return value < (float) i ? i - 1 : i;
    }

    public static float abs(float value) {
        return Math.abs(value);
    }

    public static int abs(int value) {
        return Math.abs(value);
    }

    public static float square(float value) {
        return value * value;
    }

    public static float wrapDegrees(float degrees) {
        float f = degrees % 360.0F;
        if (f >= 180.0F) f -= 360.0F;
        if (f < -180.0F) f += 360.0F;
        return f;
    }
}

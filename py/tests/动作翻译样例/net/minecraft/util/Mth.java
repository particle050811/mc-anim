package net.minecraft.util;

/** 测试桩：实现照 1.20.1 的 Mth（double 版的 sin、cos 和 rotLerpRad 照 1.21.11）；翻译器把这些当内建函数，这里给 JVM 跑出真值 */
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

    // 1.21.x 的 double 版（1.20.1 没有）：照 1.21.11 字节码，d2l 再 & 65535L
    public static float sin(double value) {
        return SIN[(int) ((long) (value * 10430.378350470453D) & 65535L)];
    }

    public static float cos(double value) {
        return SIN[(int) ((long) (value * 10430.378350470453D + 16384.0D) & 65535L)];
    }

    // 1.21.11 的 Mth.rotLerpRad：照字节码（fcmpg / fcmpl，float 的 π、2π）
    public static float rotLerpRad(float t, float from, float to) {
        float d = to - from;
        while (d < -(float) Math.PI) d += (float) Math.PI * 2F;
        while (d >= (float) Math.PI) d -= (float) Math.PI * 2F;
        return from + t * d;
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

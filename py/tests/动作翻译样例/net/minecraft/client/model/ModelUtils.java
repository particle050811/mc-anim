package net.minecraft.client.model;

// 测试桩：照 1.20.1 ModelUtils.rotlerpRad 的字节码写（两个 while 用 fcmpg / fcmpl，常量是 float 的 π、2π）
public class ModelUtils {
    public static float rotlerpRad(float a, float b, float t) {
        float d = b - a;
        while (d < -(float) Math.PI) d += (float) Math.PI * 2F;
        while (d >= (float) Math.PI) d -= (float) Math.PI * 2F;
        return a + t * d;
    }
}

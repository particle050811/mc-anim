package sample;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import net.minecraft.client.model.ModelUtils;
import net.minecraft.util.Mth;

/**
 * 内建函数（py/anim_py/动作翻译/图.py 的 内建、engine/anim/姿态程序.ts 的 内建函数）的 JVM 真值。
 * 每读一行「函数 参数…」（float 给 float 位、double 给 double 位，十六进制；int 给十进制）打印一行结果，格式同参数。
 * Mth 走测试桩（照 1.20.1 的字节码写），java/lang/Math 走 JDK 本身。
 */
public final class Builtins {
    static float F(String s) {
        return Float.intBitsToFloat(Integer.parseUnsignedInt(s, 16));
    }

    static double D(String s) {
        return Double.longBitsToDouble(Long.parseUnsignedLong(s, 16));
    }

    static int I(String s) {
        return Integer.parseInt(s);
    }

    // NaN 统一成规范位（各平台 NaN 的负载位可以不同，姿态里用不到）
    static String f(float x) {
        return Integer.toHexString(Float.floatToIntBits(x));
    }

    static String d(double x) {
        return Long.toHexString(Double.doubleToLongBits(x));
    }

    static String i(int x) {
        return Integer.toString(x);
    }

    static String run(String[] s) {
        return switch (s[0]) {
            case "net/minecraft/util/Mth.sin(F)F" -> f(Mth.sin(F(s[1])));
            case "net/minecraft/util/Mth.cos(F)F" -> f(Mth.cos(F(s[1])));
            case "net/minecraft/util/Mth.sqrt(F)F" -> f(Mth.sqrt(F(s[1])));
            case "net/minecraft/util/Mth.abs(F)F" -> f(Mth.abs(F(s[1])));
            case "net/minecraft/util/Mth.abs(I)I" -> i(Mth.abs(I(s[1])));
            case "net/minecraft/util/Mth.clamp(FFF)F" -> f(Mth.clamp(F(s[1]), F(s[2]), F(s[3])));
            case "net/minecraft/util/Mth.clamp(III)I" -> i(Mth.clamp(I(s[1]), I(s[2]), I(s[3])));
            case "net/minecraft/util/Mth.clamp(DDD)D" -> d(Mth.clamp(D(s[1]), D(s[2]), D(s[3])));
            case "net/minecraft/util/Mth.lerp(FFF)F" -> f(Mth.lerp(F(s[1]), F(s[2]), F(s[3])));
            case "net/minecraft/util/Mth.lerp(DDD)D" -> d(Mth.lerp(D(s[1]), D(s[2]), D(s[3])));
            case "net/minecraft/util/Mth.wrapDegrees(F)F" -> f(Mth.wrapDegrees(F(s[1])));
            case "net/minecraft/util/Mth.square(F)F" -> f(Mth.square(F(s[1])));
            case "net/minecraft/util/Mth.floor(F)I" -> i(Mth.floor(F(s[1])));
            case "net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F" -> f(ModelUtils.rotlerpRad(F(s[1]), F(s[2]), F(s[3])));
            case "java/lang/Math.sin(D)D" -> d(Math.sin(D(s[1])));
            case "java/lang/Math.cos(D)D" -> d(Math.cos(D(s[1])));
            case "java/lang/Math.sqrt(D)D" -> d(Math.sqrt(D(s[1])));
            case "java/lang/Math.abs(F)F" -> f(Math.abs(F(s[1])));
            case "java/lang/Math.abs(D)D" -> d(Math.abs(D(s[1])));
            case "java/lang/Math.abs(I)I" -> i(Math.abs(I(s[1])));
            case "java/lang/Math.min(FF)F" -> f(Math.min(F(s[1]), F(s[2])));
            case "java/lang/Math.max(FF)F" -> f(Math.max(F(s[1]), F(s[2])));
            case "java/lang/Math.min(DD)D" -> d(Math.min(D(s[1]), D(s[2])));
            case "java/lang/Math.max(DD)D" -> d(Math.max(D(s[1]), D(s[2])));
            case "java/lang/Math.min(II)I" -> i(Math.min(I(s[1]), I(s[2])));
            case "java/lang/Math.max(II)I" -> i(Math.max(I(s[1]), I(s[2])));
            case "java/lang/Math.pow(DD)D" -> d(Math.pow(D(s[1]), D(s[2])));
            case "java/lang/Math.atan2(DD)D" -> d(Math.atan2(D(s[1]), D(s[2])));
            case "java/lang/Math.exp(D)D" -> d(Math.exp(D(s[1])));
            case "java/lang/Math.signum(F)F" -> f(Math.signum(F(s[1])));
            default -> throw new IllegalArgumentException("没有这个内建函数的真值：" + s[0]);
        };
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            if (!line.isBlank()) out.append(run(line.trim().split(" "))).append('\n');
        }
        System.out.print(out);
    }
}

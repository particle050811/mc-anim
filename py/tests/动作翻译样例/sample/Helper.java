package sample;

import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;

/** 像 AnimationUtils：静态方法改传进来的部件 */
public final class Helper {
    public static void bobArm(ModelPart arm, float age, float sign) {
        arm.zRot += sign * (Mth.cos(age * 0.09F) * 0.05F + 0.05F);
        arm.xRot += sign * Mth.sin(age * 0.067F) * 0.05F;
    }
}

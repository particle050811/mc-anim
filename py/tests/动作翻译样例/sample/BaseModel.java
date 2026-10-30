package sample;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;

/** 父类：子类 super.setupAnim；prepareMobModel 写模型字段、setupAnim 读 */
public abstract class BaseModel<T extends SampleEntity> extends EntityModel<T> {
    protected final ModelPart head;
    protected float swing;

    protected BaseModel(ModelPart root) {
        this.head = root.getChild("head");
    }

    @Override
    public void prepareMobModel(T e, float limbSwing, float limbSwingAmount, float partialTick) {
        this.swing = Mth.lerp(partialTick, limbSwingAmount * 0.5F, limbSwingAmount);
    }

    @Override
    public void setupAnim(T e, float limbSwing, float limbSwingAmount, float age, float yaw, float pitch) {
        head.yRot = yaw * ((float) Math.PI / 180F);
        head.xRot = pitch * ((float) Math.PI / 180F);
        if (e.getMode().airborne()) head.xRot = -(float) Math.PI / 4F;
    }
}

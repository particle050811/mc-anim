package net.minecraft.client.model;

import net.minecraft.world.entity.Entity;

/** 测试桩 */
public abstract class EntityModel<T extends Entity> {
    public float attackTime;
    public boolean riding;
    public boolean young = true;

    public abstract void setupAnim(T entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch);

    public void prepareMobModel(T entity, float limbSwing, float limbSwingAmount, float partialTick) {
    }
}

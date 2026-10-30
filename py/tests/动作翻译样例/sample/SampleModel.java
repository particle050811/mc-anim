package sample;

import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;

/** 动作翻译的样例模型：常量界循环、符号条件、枚举 switch（SwitchMap）、int switch、int / long / double 运算、继承、静态辅助方法 */
public class SampleModel extends BaseModel<SampleEntity> {
    private final ModelPart body, rightArm, leftArm, tail;
    private final ModelPart[] legs = new ModelPart[4];

    public SampleModel(ModelPart root) {
        super(root);
        this.body = root.getChild("body");
        // 字段名和部件名对不上（CreeperModel 也这样）
        this.rightArm = root.getChild("left_arm");
        this.leftArm = root.getChild("right_arm");
        this.tail = this.body.getChild("tail");
        for (int i = 0; i < legs.length; i++) legs[i] = root.getChild("leg" + i);
    }

    @Override
    public void setupAnim(SampleEntity e, float ls, float la, float age, float yaw, float pitch) {
        super.setupAnim(e, ls, la, age, yaw, pitch);
        for (int i = 0; i < legs.length; i++) {
            float phase = (i % 2 == 0) ? 0.0F : (float) Math.PI;
            legs[i].xRot = Mth.cos(ls * 0.6662F + phase) * 1.4F * la;
        }
        if (e.isAggressive()) {
            rightArm.setRotation(-1.5F + Mth.sin(age * 0.1F) * 0.1F, 0.1F, 0.0F);
        } else if (la > 0.5F && !this.riding) {
            rightArm.setRotation(la * e.getMode().k(), 0.0F, 0.0F);
        } else {
            rightArm.xRot = this.swing;
        }
        switch (e.getMode()) {
            case WALK -> leftArm.zRot = 0.1F;
            case RUN -> leftArm.zRot = -0.2F * Mth.clamp(age, -1.0F, 1.0F);
            case SIT -> {
                leftArm.zRot = 0.0F;
                body.y = 3.0F;
            }
            default -> leftArm.zRot = Mth.wrapDegrees(age) * 0.01F;
        }
        int t = (int) (age * 3.7F);
        switch (t & 3) {
            case 0:
                tail.y += (float) (t % 7);
                break;
            case 1:
                tail.y -= (float) (t >> 2);
                break;
            case 2:
                tail.y = (float) (t >>> 3 ^ 5);
                break;
            default:
                tail.y = -1.0F;
        }
        long l = (long) (age * 1000.0F);
        tail.x = (float) (l % 1000L) / 1000.0F;
        double d = Math.sin((double) age * 0.05D) * 0.25D;
        tail.zRot = (float) d + Mth.sqrt(Math.abs(yaw));
        float at = this.attackTime;
        body.yRot = at > 0.0F ? Mth.sin(Mth.sqrt(at) * ((float) Math.PI * 2F)) * 0.2F : 0.0F;
        tail.visible = !(e.getHealth() < 5.0F);
        tail.xScale = this.young ? 0.5F : 1.0F;
        Helper.bobArm(rightArm, age, 1.0F);
        Helper.bobArm(leftArm, age, -1.0F);
        leftArm.yRot = Math.max(pitch, yaw) * 0.01F + (float) e.tick;
    }
}

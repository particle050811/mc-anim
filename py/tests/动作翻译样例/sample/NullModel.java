package sample;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;

/** 判实体上取的东西是不是 null：翻成输入「entity.getRider() == null」，不给按非 null 算 */
public class NullModel extends EntityModel<SampleEntity> {
    private final ModelPart head;

    public NullModel(ModelPart root) {
        this.head = root.getChild("head");
    }

    @Override
    public void setupAnim(SampleEntity e, float ls, float la, float age, float yaw, float pitch) {
        SampleEntity rider = e.getRider();
        head.xRot = rider != null ? rider.getHealth() * 0.1F : -1.0F;
    }
}

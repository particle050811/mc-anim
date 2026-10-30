package sample;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;

/** setupAnim 什么都不做（原版 SlimeModel 就这样）：翻出空程序，不报错 */
public class EmptyModel extends EntityModel<SampleEntity> {
    private final ModelPart head;

    public EmptyModel(ModelPart root) {
        this.head = root.getChild("head");
    }

    @Override
    public void setupAnim(SampleEntity e, float ls, float la, float age, float yaw, float pitch) {
    }
}

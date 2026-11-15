// 祭坛照片核对的画面：2-祭坛召唤 在 照片-祭坛递蛋糕 那一帧的整个画面（你递蛋糕、她看着你笑、爱心刚冒出来；场里本来就不画界面），不带歌词、不套整片后期：
// 照片是你在游戏里截的图（藏起界面），贴进第 8 句以后跟着那一句的整片后期走，这里再套一遍颗粒和调色就叠了两层。
// 出照片：anim still 核对-祭坛照片 0，按面积平均缩成 320×180（特效/照片图.ts），登记成资产再给 照片图 用。
import type React from 'react';
import { events as mainCutEvents } from '../../分镜/正片第3句.ts';
import { AltarPicture } from '../../场/2-祭坛/祭坛.tsx';

const picture: React.FC = () => <AltarPicture g={mainCutEvents['照片-祭坛递蛋糕'].帧} />;

export default picture;

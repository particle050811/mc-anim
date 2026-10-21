// JEI（jei-1.20.1-forge-15.62.0.217）的配方窗口：6-2-1 匠魂配方、6-2-2/6-2-3 古卷配方共用这一个框。
// 排版照 JEI 的 RecipesGui（javap 读的常量）：窗口最小宽 198，四周留边 6；上面两条导航栏（配方类别、页码）各高 13，两条之间隔 2，两头 13×13 小按钮；
// 类别标签页 24×24 叠在窗口顶上 3 像素、离左边 2 像素。催化剂照 RecipeCatalysts：窗口左边一列，和顶边对齐，宽 28、高 12 + 16 × 个数，和窗口重叠 6，图标每个占 16、从 (6, 6) 排下去。
// JEI 窗口高度按屏幕高算，这里只包住一页配方，但至少包住催化剂那一列。
// 画法是自制高清版（见 基础.tsx 开头）：颜色取原版界面灰（#C6C6C6 底、白高光、#555 阴影、黑描边），圆角、柔和投影；导航按钮箭头、书签图标用 JEI 自己的贴图
// （assets/jei/textures/jei/atlas/gui/icons/），配方箭头、加号照 recipe_arrow.png、recipe_plus_sign.png 的形状画成矢量。
import React from 'react';
import { png } from '../../engine/model/贴图.ts';
import { PixelSprite, UiText, chatColors } from './基础.tsx';
import prevPagePng from 'asset:贴图/界面/JEI上一页';
import nextPagePng from 'asset:贴图/界面/JEI下一页';
import bookmarkPng from 'asset:贴图/界面/JEI书签';

const guiGray = { bgColor: '#C6C6C6', light: '#FFFFFF', dark: '#555555', withSlot: '#8B8B8B', slotShadow: '#373737' };

// 窗口各部分的位置（GUI 像素，原点在窗口主体左上角）
export const jeiLayout = (recipeWidth: number, recipeHeight: number, catalystCount = 0) => {
  const width = Math.max(198, recipeWidth + 2 * 6 + 2 * 4 + 20);
  const recipeArea = { x: 6, y: 6 + 13 + 2 + 13 + 4, w: width - 12, h: recipeHeight + 8 };
  const height = Math.max(recipeArea.y + recipeArea.h + 6, catalystCount ? 12 + 16 * catalystCount : 0);
  // 配方居中放（右边留出书签按钮的位置）
  const recipeOrigin = { x: Math.round((width - recipeWidth) / 2) - 4, y: recipeArea.y + 4 };
  return { width: width, height: height, recipeArea: recipeArea, recipeOrigin: recipeOrigin };
};

// 原版界面那种凸起的面板（外黑边、左上白高光、右下灰阴影）
export const RaisedPanel: React.FC<{ x: number; y: number; w: number; h: number; s: number; cornerRadius?: number; bgColor?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ x, y, w: width, h: height, s: scale, cornerRadius = 3, bgColor: bgColor = guiGray.bgColor, style, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x * scale,
      top: y * scale,
      width: width * scale,
      height: height * scale,
      borderRadius: cornerRadius * scale,
      background: `linear-gradient(180deg, ${bgColor} 0%, ${bgColor} 60%, #BDBDBD 100%)`,
      boxShadow: `0 0 0 ${scale}px #000, inset ${scale}px ${scale}px 0 ${guiGray.light}, inset ${-scale}px ${-scale}px 0 ${guiGray.dark}`,
      ...style,
    }}
  >
    {children}
  </div>
);

// 凹下去的格子：物品槽（18×18：左上 #373737、右下白）、导航栏的底
export const InsetSlot: React.FC<{ x: number; y: number; w?: number; h?: number; s: number; bgColor?: string }> = ({ x, y, w: width = 18, h: height = 18, s: scale, bgColor: bgColor = guiGray.withSlot }) => (
  <div
    style={{
      position: 'absolute',
      left: x * scale,
      top: y * scale,
      width: width * scale,
      height: height * scale,
      borderRadius: 0.8 * scale,
      background: bgColor,
      boxShadow: `inset ${scale}px ${scale}px 0 ${guiGray.slotShadow}, inset ${-scale}px ${-scale}px 0 ${guiGray.light}`,
    }}
  />
);

// 物品：(x, y) 是 JEI 里物品图标左上角（槽的背景在它外面 1 像素）；数量照原版写在右下角
export const ItemSlot: React.FC<{ x: number; y: number; s: number; withSlot?: boolean; count?: number; children: React.ReactNode }> = ({ x, y, s: scale, withSlot = true, count, children }) => (
  <>
    {withSlot && <InsetSlot x={x - 1} y={y - 1} s={scale} />}
    <div style={{ position: 'absolute', left: x * scale, top: y * scale, width: 16 * scale, height: 16 * scale }}>{children}</div>
    {count !== undefined && count > 1 && (
      <div style={{ position: 'absolute', left: x * scale, top: y * scale, width: 17.5 * scale, height: 17.5 * scale, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        <UiText fontSize={8.6 * scale} bold style={{ lineHeight: 1 }}>
          {String(count)}
        </UiText>
      </div>
    )}
  </>
);

// 大输出槽（JEI output_slot 26×26）：物品画在中间
export const LargeSlot: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s: scale }) => <InsetSlot x={x - 5} y={y - 5} w={26} h={26} s={scale} />;

// JEI 的配方箭头（recipe_arrow 22×16）；进度 0～1 时照 JEI 的动画箭头从左往右填深色
export const RecipeArrow: React.FC<{ x: number; y: number; s: number; progress?: number; width?: number; height?: number }> = ({ x, y, s: scale, progress = 0, width: width = 22, height: height = 16 }) => {
  // 箭头外形照 recipe_arrow.png：杆 从 (0, 6) 到 (14, 10)，头是 (14, 1)～(22, 8)～(14, 15) 的三角
  const pts = (polyWidth: number, polyHeight: number) => {
    const k = polyHeight / 16;
    return `0,${6 * k} ${polyWidth - 8 * k},${6 * k} ${polyWidth - 8 * k},${1 * k} ${polyWidth},${8 * k} ${polyWidth - 8 * k},${15 * k} ${polyWidth - 8 * k},${10 * k} 0,${10 * k}`;
  };
  return (
    <svg style={{ position: 'absolute', left: x * scale, top: y * scale, overflow: 'visible' }} width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <clipPath id={`箭头${x}-${y}`}>
          <rect x={0} y={0} width={width * progress} height={height} />
        </clipPath>
      </defs>
      <polygon points={pts(width, height)} fill="#8B8B8B" />
      {progress > 0 && <polygon points={pts(width, height)} fill="#3A3A3A" clipPath={`url(#箭头${x}-${y})`} />}
    </svg>
  );
};

// JEI 的加号（recipe_plus_sign 13×13）
export const PlusSign: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s: scale }) => (
  <svg style={{ position: 'absolute', left: x * scale, top: y * scale }} width={13 * scale} height={13 * scale} viewBox="0 0 13 13">
    <path d="M5 0h3v5h5v3H8v5H5V8H0V5h5z" fill="#8B8B8B" />
  </svg>
);

const SmallButton: React.FC<{ x: number; y: number; s: number; icon: string }> = ({ x, y, s: scale, icon: icon }) => (
  <RaisedPanel x={x} y={y} w={13} h={13} s={scale} cornerRadius={1.5} bgColor="#B5B5B5" style={{ boxShadow: `0 0 0 ${0.6 * scale}px #000, inset ${0.8 * scale}px ${0.8 * scale}px 0 #E8E8E8, inset ${-0.8 * scale}px ${-0.8 * scale}px 0 #6A6A6A` }}>
    <div style={{ position: 'absolute', left: 2 * scale, top: 2 * scale }}>
      <PixelSprite tex={png(icon)} size={9 * scale} />
    </div>
  </RaisedPanel>
);

// 导航栏：两头小按钮，中间凹下去的一条写字
const NavBar: React.FC<{ y: number; width: number; s: number; label: string }> = ({ y, width: width, s: scale, label: label }) => (
  <>
    <SmallButton x={6} y={y} s={scale} icon={prevPagePng} />
    <InsetSlot x={6 + 13 + 2} y={y} w={width - 2 * (6 + 13 + 2)} h={13} s={scale} bgColor="#9A9A9A" />
    <div style={{ position: 'absolute', left: (6 + 13 + 2) * scale, top: y * scale, width: (width - 2 * (6 + 13 + 2)) * scale, height: 13 * scale, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <UiText fontSize={8.4 * scale}>{label}</UiText>
    </div>
    <SmallButton x={width - 6 - 13} y={y} s={scale} icon={nextPagePng} />
  </>
);

export type JeiWindowProps = {
  s: number; // 缩放：画面像素 / GUI 像素
  x: number; // 窗口主体左上角（画面像素）
  y: number;
  title: string; // 配方类别名
  page: string; // 例 "1/1"
  tabIcon: React.ReactNode; // 类别标签页上的图标（16 GUI 像素见方）
  catalysts: React.ReactNode[]; // 左边一列（每个 16 GUI 像素见方）
  recipeWidth: number;
  recipeHeight: number;
  visibility: number; // 0～1：出现 / 消失的过程（淡入、轻微放大）
  children: React.ReactNode; // 配方内容，坐标是配方原点起的 GUI 像素（乘 s）
};

export const JeiRecipeWindow: React.FC<JeiWindowProps> = ({ s: scale, x, y, title: title, page: page, tabIcon, catalysts, recipeWidth, recipeHeight, visibility, children }) => {
  if (visibility <= 0) return null;
  const layout = jeiLayout(recipeWidth, recipeHeight, catalysts.length);
  const k = 0.96 + 0.04 * visibility;
  const catalystColHeight = 12 + 16 * catalysts.length;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: layout.width * scale,
        height: layout.height * scale,
        opacity: visibility,
        transform: `scale(${k})`,
        transformOrigin: '50% 40%',
        filter: `drop-shadow(0 ${3 * scale}px ${6 * scale}px rgba(0,0,0,0.45))`,
      }}
    >
      {/* 催化剂一列：和窗口顶边对齐、和窗口重叠 6；里面一整条凹槽，图标 16 一个 */}
      {catalysts.length > 0 && (
        <RaisedPanel x={-(12 + 16) + 6} y={0} w={12 + 16} h={catalystColHeight} s={scale}>
          <InsetSlot x={5} y={5} w={18} h={2 + 16 * catalysts.length} s={scale} />
          {catalysts.map((c, i) => (
            <div key={i} style={{ position: 'absolute', left: 6 * scale, top: (6 + 16 * i) * scale, width: 16 * scale, height: 16 * scale }}>
              {c}
            </div>
          ))}
        </RaisedPanel>
      )}
      {/* 类别标签页：叠在窗口顶上 3 像素；选中的这一页和窗口连成一片 */}
      <RaisedPanel x={2} y={-24 + 3} w={24} h={24 + 2} s={scale} cornerRadius={2.5}>
        <div style={{ position: 'absolute', left: 4 * scale, top: 4 * scale, width: 16 * scale, height: 16 * scale }}>{tabIcon}</div>
      </RaisedPanel>
      <RaisedPanel x={0} y={0} w={layout.width} h={layout.height} s={scale} />
      {/* 盖住标签页和窗口之间那条边，看起来是一体的 */}
      <div style={{ position: 'absolute', left: 3 * scale, top: 0, width: 22 * scale, height: 1.2 * scale, background: guiGray.bgColor }} />
      <NavBar y={6} width={layout.width} s={scale} label={title} />
      <NavBar y={6 + 13 + 2} width={layout.width} s={scale} label={page} />
      {/* 配方区：浅一点的底 */}
      <div
        style={{
          position: 'absolute',
          left: layout.recipeArea.x * scale,
          top: layout.recipeArea.y * scale,
          width: layout.recipeArea.w * scale,
          height: layout.recipeArea.h * scale,
          borderRadius: 1.5 * scale,
          background: '#CFCFCF',
          boxShadow: `inset 0 0 0 ${0.6 * scale}px #A8A8A8`,
        }}
      />
      <div style={{ position: 'absolute', left: layout.recipeOrigin.x * scale, top: layout.recipeOrigin.y * scale, width: recipeWidth * scale, height: recipeHeight * scale }}>{children}</div>
      {/* 每个配方右下角的书签按钮（JEI recipe_bookmark） */}
      <SmallButton x={layout.recipeArea.x + layout.recipeArea.w - 13 - 3} y={layout.recipeArea.y + layout.recipeArea.h - 13 - 3} s={scale} icon={bookmarkPng} />
    </div>
  );
};

// 窗口里某一点（配方坐标，GUI 像素）在画面上的位置；思索引线从这里引出
export const jeiPoint = (windowGeom: { s: number; x: number; y: number; recipeWidth: number; recipeHeight: number }, rx: number, ry: number): [number, number] => {
  const layout = jeiLayout(windowGeom.recipeWidth, windowGeom.recipeHeight);
  return [windowGeom.x + (layout.recipeOrigin.x + rx) * windowGeom.s, windowGeom.y + (layout.recipeOrigin.y + ry) * windowGeom.s];
};

export { chatColors as 色 };

import {
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";

interface WheelPickerProps {
  items: string[];
  targetIndex: number;
  targetColor: string;
  fontSize: number;
}

const ITEM_HEIGHT = 120;
const TOTAL_FRAMES = 85;
// 显示在可视窗口中的项数
const VISIBLE_ITEMS = 1;

export const WheelPicker: React.FC<WheelPickerProps> = ({
  items,
  targetIndex,
  targetColor,
  fontSize,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [0, TOTAL_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  const isLanded = progress >= 0.99;

  // 当前滚动位置（连续值，单位为 item index）
  const scrollPosition = progress * targetIndex;
  // 当前应该显示的 item index（四舍五入取最近的）
  const currentIndex = Math.round(scrollPosition);

  return (
    <div
      style={{
        height: ITEM_HEIGHT,
        overflow: "hidden",
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: fontSize * 3.2,
      }}
    >
      {isLanded ? (
        /* 落定后：直接显示目标文字，无 transform */
        <div
          style={{
            fontSize,
            fontWeight: 900,
            fontFamily: "'Noto Sans SC', sans-serif",
            color: targetColor,
            lineHeight: 1,
          }}
        >
          {items[targetIndex]}
        </div>
      ) : (
        /* 滚动中：只渲染当前可见的几项 */
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {items.map((item, i) => {
            // 计算此 item 相对于当前滚动位置的偏移
            const offsetFromCurrent = i - scrollPosition;
            // 只渲染距离当前位置±1.5个item内的元素
            if (Math.abs(offsetFromCurrent) > 1.5) return null;

            const y = offsetFromCurrent * ITEM_HEIGHT;
            const distRatio = Math.abs(offsetFromCurrent);
            const opacity = interpolate(distRatio, [0, 0.6, 1.2], [1, 0.4, 0], {
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: ITEM_HEIGHT,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize,
                  fontWeight: 900,
                  fontFamily: "'Noto Sans SC', sans-serif",
                  color: "#ffffff",
                  opacity,
                  transform: `translateY(${y}px)`,
                  lineHeight: 1,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 闪光效果 */
export const FlashEffect: React.FC<{ triggerFrame: number }> = ({
  triggerFrame,
}) => {
  const frame = useCurrentFrame();
  const FLASH_DURATION = 30;
  const localFrame = frame - triggerFrame;

  if (localFrame < 0 || localFrame > FLASH_DURATION) return null;

  const opacity = interpolate(
    localFrame,
    [0, FLASH_DURATION * 0.35, FLASH_DURATION],
    [0, 0.5, 0],
    { extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#ffffff",
        opacity,
        pointerEvents: "none",
        zIndex: 100,
      }}
    />
  );
};

export { TOTAL_FRAMES as WHEEL_ANIM_FRAMES };

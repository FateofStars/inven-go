import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * 主笔画：一条从文字起笔、直接落到按钮上方的抛物线（二次贝塞尔）。
 * 起点切线水平向左，终点右移约 1 个英文字符宽度（35 viewBox 单位 ≈ 6.3dp）。
 */
const BODY = 'M 438 34 Q 250 34 123 372';

/** 箭头两翼：沿末端切线反向（顶部延长线）左右各偏 30°，与主笔画同粗。 */
const WINGS = 'M 123 372 L 172.5 331.4 M 123 372 L 112.5 308.9';

type Props = {
  width?: number;
  height?: number;
};

/**
 * 空仓库引导箭头：纯矢量绘制，笔画粗细与说明文字一致。
 * viewBox 固定 441×378，按 80dp 渲染时线宽约 1.27dp，任意屏幕密度下都清晰。
 */
export default function HandDrawnArrow({ width = 80, height = 69 }: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 441 378" opacity={0.62}>
      <Path d={BODY} stroke={colors.ink} strokeWidth={7} strokeLinecap="round" fill="none" />
      <Path d={WINGS} stroke={colors.ink} strokeWidth={7} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

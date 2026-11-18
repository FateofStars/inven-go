import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, radius, size } from '@/theme';

/**
 * 相机页顶部遮罩：把白色标题与引导文案从实时画面上「托」起来。
 * 用自上而下的线性渐变而不是实色块，避免在画面中切出一条硬边。
 */
export function CameraTopScrim({ height }: { height: number }) {
  return (
    <View pointerEvents="none" style={[styles.scrim, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="cameraScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.camera} stopOpacity={0.72} />
            <Stop offset="0.55" stopColor={colors.camera} stopOpacity={0.42} />
            <Stop offset="1" stopColor={colors.camera} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cameraScrim)" />
      </Svg>
    </View>
  );
}

/**
 * 取景框：深色外圈 + 浅色内圈。
 * 浅色内圈在暗画面上清晰，深色外圈在亮画面上兜底，任意背景下取景框都不会消失。
 */
export function ScanFrame() {
  return (
    <View style={styles.frame}>
      <View style={styles.frameInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  frame: {
    width: size.scanFrameWidth,
    height: size.scanFrameHeight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.overlay,
    padding: 1,
  },
  frameInner: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.card,
  },
});

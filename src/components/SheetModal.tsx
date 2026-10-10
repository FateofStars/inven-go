import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, shadow } from '@/theme';

/** 面板跟随键盘升起/落下的时长；安卓拿不到系统的键盘动画时长，用观感接近的固定值。 */
const LIFT_DURATION_MS = 180;

/** 面板与弹窗顶部的固定间距：弹窗内容本身已经避开状态栏，这里只留一点呼吸空间。 */
const TOP_GAP = 12;

type SheetModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  /** 面板容器的补充样式，用于各弹窗微调内边距（例如底部再让出导航栏高度）。 */
  sheetStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 算出面板真正需要让出的高度：键盘高度 − 系统已经让出的高度。
 *
 * 安卓上 Modal 是独立窗口，各机型对「键盘是否压缩该窗口」的处理并不一致：
 * 有的机型会自己把窗口压上去（根视图随之变矮），有的机型（edge-to-edge 下常见）完全不处理，
 * 弹窗会被键盘整个盖住。用「键盘弹出前的根视图高度 − 当前根视图高度」反推系统已经让出的高度，
 * 两种机型都不会重复抬高。
 */
function resolveLift(keyboardHeight: number, restingHeight: number, currentHeight: number): number {
  if (keyboardHeight <= 0) return 0;
  const alreadyLifted = Math.max(0, restingHeight - currentHeight);
  return Math.max(0, keyboardHeight - alreadyLifted);
}

function animateLift(lift: Animated.Value, toValue: number, duration: number = LIFT_DURATION_MS) {
  Animated.timing(lift, {
    toValue,
    duration,
    easing: Easing.out(Easing.cubic),
    // paddingBottom 是布局属性，只能用 JS 驱动。
    useNativeDriver: false,
  }).start();
}

/**
 * 底部升起的面板弹窗容器：面板始终贴在被虚拟键盘顶起后的可用区域底部。
 *
 * 键盘弹出时整块面板跟着抬高、收起时落回原位，面板内容不会被键盘遮住；
 * 可用高度不足时面板收缩，多出来的内容交给面板内部的 ScrollView 滚动。
 */
export function SheetModal({ visible, onRequestClose, sheetStyle, children }: SheetModalProps) {
  // 动画值放在惰性 state（与本项目其他动画组件一致），避免在渲染期读取 ref.current。
  const [lift] = useState(() => new Animated.Value(0));
  // 下面三个 ref 只在布局与键盘事件回调里读写，不参与渲染期计算。
  const restingHeight = useRef(0);
  const currentHeight = useRef(0);
  const keyboardHeight = useRef(0);

  useEffect(() => {
    if (!visible) {
      // 面板收起后一切归零，下次打开重新以「键盘未弹出」的高度作为基准。
      keyboardHeight.current = 0;
      lift.setValue(0);
      return;
    }
    // iOS 能在键盘动画开始前拿到高度，可以严丝合缝地跟着动；安卓只有动画结束后的 didShow。
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardHeight.current = event.endCoordinates.height;
      // iOS 会给出系统键盘的动画时长，跟着它动可以让面板与键盘严丝合缝；安卓恒为 0，退回固定时长。
      const duration = event.duration > 0 ? event.duration : LIFT_DURATION_MS;
      animateLift(
        lift,
        resolveLift(keyboardHeight.current, restingHeight.current, currentHeight.current),
        duration,
      );
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      animateLift(lift, 0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible, lift]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    currentHeight.current = height;
    if (keyboardHeight.current <= 0) {
      // 键盘未弹出时的高度就是基准高度。
      restingHeight.current = height;
      return;
    }
    // 键盘弹出期间根视图只会因为系统压缩窗口而变矮，这里重新校准一次，
    // 避免「系统改窗口」晚于键盘事件到达时把面板重复抬高。
    animateLift(lift, resolveLift(keyboardHeight.current, restingHeight.current, height));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={styles.root} onLayout={handleLayout}>
        <Pressable style={styles.backdrop} onPress={onRequestClose} accessibilityLabel="关闭弹窗" />
        {/* box-none：这一层铺满整个弹窗，但不能自己吞掉触摸，否则面板外点击关闭会失效。 */}
        <Animated.View pointerEvents="box-none" style={[styles.lift, { paddingTop: TOP_GAP, paddingBottom: lift }]}>
          <View style={[styles.sheet, sheetStyle]}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  lift: {
    flex: 1,
    // 面板贴着可用区域的底部：可用高度已经被键盘让开，因此面板永远在键盘之上。
    justifyContent: 'flex-end',
  },
  sheet: {
    // 可用高度不足时先收缩面板自身，把空间让给面板内部的滚动区。
    flexShrink: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 18,
    ...shadow,
  },
});

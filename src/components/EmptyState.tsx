import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, press, radius, size, space, textScale, type, weight } from '@/theme';

type EmptyStateAction = {
  label: string;
  onPress: () => void;
};

type EmptyStateProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** 弹窗等高度受限的容器内使用：不撑满高度，图标与标题收紧。 */
  compact?: boolean;
};

/**
 * 统一空状态：图标 + 原因标题 + 内容预期 + 可选的显眼主行动。
 * 容器 flex:1 让列表空态在可视区内垂直居中；标题撑满宽度以规避 Android
 * 自适应宽度时裁掉最后一个字的问题。
 */
export default function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <View style={compact ? styles.compactContainer : styles.container}>
      <MaterialCommunityIcons
        name={icon}
        size={compact ? size.iconTileSm : size.emptyIcon}
        color={colors.muted}
      />
      <Text maxFontSizeMultiplier={textScale.title} style={[styles.title, compact && styles.compactTitle]}>
        {title}
      </Text>
      {description ? (
        <Text
          maxFontSizeMultiplier={textScale.body}
          style={[styles.description, compact && styles.compactDescription]}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          onPress={action.onPress}
          accessibilityLabel={action.label}
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.actionText}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  /**
   * 弹窗内不参与 flex 撑高，只按内容高度排列。
   * 弹窗内容区高度受限（还要让出标题与按钮行），这里的纵向留白与行距统一收紧一档，
   * 保证「图标 + 标题 + 说明」在滚动视口内完整显示，而不是被切断半行。
   */
  compactContainer: {
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.xs,
  },
  title: {
    ...type.title,
    color: colors.ink,
    fontWeight: weight.bold,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  compactTitle: {
    ...type.title,
  },
  description: {
    ...type.body,
    color: colors.muted,
    fontWeight: weight.regular,
    textAlign: 'center',
  },
  compactDescription: {
    lineHeight: 20,
  },
  action: {
    marginTop: space.sm,
    minHeight: size.touch,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    opacity: press.opacity,
  },
  actionText: {
    ...type.body,
    color: colors.white,
    fontWeight: weight.bold,
  },
});

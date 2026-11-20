import { Stack } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CHANGELOG_DATA } from '@/constants/changelog';
import { colors, elevation, layout, press, radius, space, textScale, type, weight } from '@/theme';

export default function ChangelogScreen() {
  const scrollRef = useRef<ScrollView>(null);

  /** 点标题平滑回到页面顶部。 */
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <>
      {/* 标题仍放在系统导航栏（与其它页面风格一致），只是把它做成可点区域，热区贴合文字宽度。 */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable
              style={({ pressed }) => [styles.titleTap, pressed && styles.pressed]}
              onPress={scrollToTop}
              accessibilityLabel="回到顶部"
            >
              <Text style={styles.title} maxFontSizeMultiplier={textScale.title}>
                更新日志
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {CHANGELOG_DATA.map((entry) => (
            <View key={entry.version} style={styles.card}>
              <Text style={styles.version} maxFontSizeMultiplier={textScale.title}>{`v ${entry.version}：`}</Text>
              {entry.items.map((item, index) => (
                // 独立短横线 + flex 正文：换行后第二行仍与首行文字对齐，形成悬挂缩进。
                <View key={`${entry.version}-${index}`} style={styles.item}>
                  <Text maxFontSizeMultiplier={textScale.body} style={styles.bullet}>-</Text>
                  <Text maxFontSizeMultiplier={textScale.body} style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /** 点击热区贴合标题文字宽度，不额外向右延展。 */
  titleTap: {
    alignSelf: 'flex-start',
  },
  title: {
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
  },
  pressed: {
    opacity: press.opacity,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
    // 内容列居中：平板等宽屏下由 column 的 maxWidth 收住长文行宽。
    alignItems: 'center',
  },
  /** 长文中心列：手机上等于内容宽，平板上封顶在舒适 measure 内。 */
  column: {
    width: '100%',
    maxWidth: layout.proseMaxWidth,
    gap: space.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    ...elevation.card,
  },
  version: {
    color: colors.ink,
    ...type.title,
    fontWeight: weight.bold,
  },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  bullet: {
    color: colors.ink,
    ...type.body,
    fontWeight: weight.regular,
  },
  itemText: {
    flex: 1,
    color: colors.ink,
    ...type.body,
    fontWeight: weight.regular,
  },
});

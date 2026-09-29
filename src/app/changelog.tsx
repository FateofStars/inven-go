import { Stack } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CHANGELOG_DATA } from '@/constants/changelog';
import { colors, shadow } from '@/theme';

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
              <Text style={styles.title}>更新日志</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
        {CHANGELOG_DATA.map((entry) => (
          <View key={entry.version} style={styles.card}>
            <Text style={styles.version}>{`v ${entry.version}：`}</Text>
            {entry.items.map((item, index) => (
              <Text key={`${entry.version}-${index}`} style={styles.item}>{`- ${item}`}</Text>
            ))}
          </View>
        ))}
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
    fontSize: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    ...shadow,
  },
  version: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  item: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
});

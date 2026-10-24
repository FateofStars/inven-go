import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logo from '../../logo/Invengo-logo.png';
import { getAppVersion } from '@/constants/appInfo';
import { colors, elevation, radius, size, space, textScale, type, weight } from '@/theme';

/** 开发者个人主页，点击「开发者：yuan」时交给系统浏览器打开。 */
const DEVELOPER_HOMEPAGE = 'https://blog.yuansever.top';
/** GitHub Release 发布页，点击「获取最新发布」时打开。 */
const RELEASE_URL = 'https://github.com/FateofStars/inven-go/releases';
const CREDITS = 'Deepseek-v4.1-Flash、Gemini-3.8-Flash、GPT-image-2.5-sunburst';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  // 唤起外部浏览器属于系统边界，失败时静默忽略，避免未捕获的 Promise 异常。
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.appName} maxFontSizeMultiplier={textScale.number}>
          Inven Go.
        </Text>
        <Text maxFontSizeMultiplier={textScale.body} style={styles.version}>{getAppVersion()}</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => router.push('/changelog')}
          activeOpacity={0.5}
          hitSlop={{ top: space.sm, bottom: space.sm, left: space.lg, right: space.lg }}
          accessibilityRole="button"
          accessibilityLabel="更新日志"
        >
          <MaterialCommunityIcons name="history" size={16} color={colors.muted} />
          <Text maxFontSizeMultiplier={textScale.body} style={styles.pillText}>更新日志</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => openLink(RELEASE_URL)}
          activeOpacity={0.5}
          hitSlop={{ top: space.sm, bottom: space.sm, left: space.lg, right: space.lg }}
          accessibilityRole="link"
          accessibilityLabel="获取最新发布"
        >
          <MaterialCommunityIcons name="github" size={16} color={colors.muted} />
          <Text maxFontSizeMultiplier={textScale.body} style={styles.pillText}>获取最新发布</Text>
        </TouchableOpacity>
        {/*
          用 TouchableOpacity 而不是 Pressable：activeOpacity 会以动画方式平滑过渡到
          半透明，按下/松开有「渐变」手感；Pressable 的 style 回调只能瞬变。
          hitSlop 向外扩展热区，不会挤占布局，避免文字行本身过窄导致点不中。
        */}
        <TouchableOpacity
          onPress={() => openLink(DEVELOPER_HOMEPAGE)}
          activeOpacity={0.5}
          hitSlop={{ top: space.md, bottom: space.md, left: space.lg, right: space.lg }}
          accessibilityRole="link"
        >
          <Text maxFontSizeMultiplier={textScale.body} style={styles.footerText}>开发者：yuan</Text>
        </TouchableOpacity>
        <Text maxFontSizeMultiplier={textScale.body} style={styles.footerText}>特别鸣谢：{CREDITS}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  logo: {
    width: size.logo,
    height: size.logo,
    borderRadius: radius.xl,
  },
  appName: {
    marginTop: space.xl,
    color: colors.ink,
    ...type.numberLg,
    fontWeight: weight.bold,
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive' }),
  },
  version: {
    marginTop: space.sm,
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
  },
  footer: {
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  footerText: {
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
    textAlign: 'center',
    fontFamily: Platform.select({ android: 'sans-serif' }),
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.controlSm,
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...elevation.card,
  },
  pillText: {
    color: colors.muted,
    ...type.body,
    fontWeight: weight.regular,
    fontFamily: Platform.select({ android: 'sans-serif' }),
  },
});

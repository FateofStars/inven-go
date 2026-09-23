import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logo from '../../logo/Invengo-logo.png';
import { getAppVersion } from '@/constants/appInfo';
import { colors } from '@/theme';

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
        <Text style={styles.appName}>Inven Go.</Text>
        <Text style={styles.version}>{getAppVersion()}</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => router.push('/changelog')}
          activeOpacity={0.5}
          hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
          accessibilityRole="button"
          accessibilityLabel="更新日志"
        >
          <MaterialCommunityIcons name="history" size={16} color={colors.muted} />
          <Text style={styles.pillText}>更新日志</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => openLink(RELEASE_URL)}
          activeOpacity={0.5}
          hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
          accessibilityRole="link"
          accessibilityLabel="获取最新发布"
        >
          <MaterialCommunityIcons name="github" size={16} color={colors.muted} />
          <Text style={styles.pillText}>获取最新发布</Text>
        </TouchableOpacity>
        {/*
          用 TouchableOpacity 而不是 Pressable：activeOpacity 会以动画方式平滑过渡到
          半透明，按下/松开有「渐变」手感；Pressable 的 style 回调只能瞬变。
          hitSlop 向外扩展热区，不会挤占布局，避免文字行本身过窄导致点不中。
        */}
        <TouchableOpacity
          onPress={() => openLink(DEVELOPER_HOMEPAGE)}
          activeOpacity={0.5}
          hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}
          accessibilityRole="link"
        >
          <Text style={styles.footerText}>开发者：yuan</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>特别鸣谢：{CREDITS}</Text>
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
    paddingHorizontal: 32,
  },
  logo: {
    width: 156,
    height: 156,
    borderRadius: 36,
  },
  appName: {
    marginTop: 24,
    color: colors.ink,
    fontSize: 44,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive' }),
  },
  version: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: Platform.select({ android: 'sans-serif' }),
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.select({ android: 'sans-serif' }),
  },
});

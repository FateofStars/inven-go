import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { InventoryProvider, useInventory } from '@/context/InventoryContext';
import { colors } from '@/theme';

function RootNavigator() {
  const { ready } = useInventory();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700', color: colors.ink },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="scan/[mode]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="product/[id]" options={{ title: '商品详情' }} />
      <Stack.Screen name="about" options={{ title: '关于' }} />
      <Stack.Screen name="changelog" options={{ title: '更新日志' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <InventoryProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </InventoryProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});

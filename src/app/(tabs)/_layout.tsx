import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { colors, size, space, textScale, type, weight } from '@/theme';

/** Tab 栏高度固定，标签字号缩放需要封顶，否则大字号会把标签挤出栏位。 */
function TabLabel({ color, label }: { color: ColorValue; label: string }) {
  return (
    <Text style={[styles.tabLabel, { color }]} maxFontSizeMultiplier={textScale.title} numberOfLines={1}>
      {label}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: weight.bold, color: colors.ink },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          height: size.tabBarHeight,
          paddingTop: space.sm,
          paddingBottom: space.sm,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '库存管理',
          headerShown: false,
          tabBarLabel: ({ color }) => <TabLabel color={color} label="库存管理" />,
          tabBarIcon: ({ color, size: iconSize }) => (
            <MaterialCommunityIcons name="warehouse" color={color} size={iconSize} />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: '日志',
          headerShown: false,
          tabBarLabel: ({ color }) => <TabLabel color={color} label="日志" />,
          tabBarIcon: ({ color, size: iconSize }) => (
            <MaterialCommunityIcons name="clipboard-text-clock-outline" color={color} size={iconSize} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          headerShown: false,
          tabBarLabel: ({ color }) => <TabLabel color={color} label="设置" />,
          tabBarIcon: ({ color, size: iconSize }) => (
            <MaterialCommunityIcons name="cog-outline" color={color} size={iconSize} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    ...type.caption,
    fontWeight: weight.bold,
  },
});

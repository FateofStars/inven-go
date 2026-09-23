import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CHANGELOG_DATA } from '@/constants/changelog';
import { colors, shadow } from '@/theme';

export default function ChangelogScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {CHANGELOG_DATA.map((entry) => (
        <View key={entry.version} style={styles.card}>
          <Text style={styles.version}>{`v ${entry.version}：`}</Text>
          {entry.items.map((item, index) => (
            <Text key={`${entry.version}-${index}`} style={styles.item}>{`- ${item}`}</Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
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

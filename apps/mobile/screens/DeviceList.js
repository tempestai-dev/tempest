import { View, Text, Pressable, FlatList, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const geist = { regular: 'Geist_400Regular', semibold: 'Geist_600SemiBold' };

export default function DeviceList({ pairings, onConnect, onForget, onPairAnother }) {
  const confirmForget = (p) => {
    Alert.alert(
      'Forget this desktop?',
      `${p.name} will be removed from this phone. You can re-pair anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: () => onForget(p.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Your desktops</Text>
        <Text style={styles.sub}>Tap to connect. Long-press to forget.</Text>
      </View>

      <FlatList
        data={pairings}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onConnect(item.id)}
            onLongPress={() => confirmForget(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.fp}>{item.fingerprint}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Pressable style={styles.pairBtn} onPress={onPairAnother}>
          <Text style={styles.pairBtnText}>+ Pair another desktop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 },
  title: { color: '#f5f5f7', fontSize: 26, fontFamily: geist.semibold, letterSpacing: -0.4 },
  sub: { color: '#8a8a90', fontSize: 14, fontFamily: geist.regular, marginTop: 6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141418',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  name: { color: '#f5f5f7', fontSize: 16, fontFamily: geist.semibold, letterSpacing: -0.2 },
  fp: { color: '#8a8a90', fontSize: 12, fontFamily: geist.regular, marginTop: 3, letterSpacing: 0.4 },
  chev: { color: '#5a5a60', fontSize: 22, fontFamily: geist.regular, marginLeft: 8 },

  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  pairBtn: {
    borderWidth: 1,
    borderColor: '#2a2a30',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pairBtnText: { color: '#f5f5f7', fontSize: 15, fontFamily: geist.semibold, letterSpacing: 0.2 },
});

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const geist = { regular: 'Geist_400Regular', semibold: 'Geist_600SemiBold' };

export default function Connected({ pairing, onUnpair, onBack }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style="light" />
      {onBack && (
        <View style={styles.topbar}>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>← Desktops</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.badge}>PAIRED</Text>
        <Text style={styles.title}>{pairing?.name || 'Tempest desktop'}</Text>
        <Text style={styles.fp}>{pairing?.fingerprint}</Text>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.btn} onPress={onUnpair}>
          <Text style={styles.btnText}>Unpair this desktop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topbar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  back: { color: '#b8b8c0', fontSize: 15, fontFamily: geist.regular },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  badge: {
    color: '#0a0a0a',
    backgroundColor: '#7be495',
    fontSize: 11,
    fontFamily: geist.semibold,
    letterSpacing: 1.2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  title: { color: '#f5f5f7', fontSize: 24, fontFamily: geist.semibold, letterSpacing: -0.4, textAlign: 'center' },
  fp: { color: '#8a8a90', fontSize: 13, fontFamily: geist.regular, marginTop: 8, letterSpacing: 0.4 },
  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  btn: {
    borderWidth: 1,
    borderColor: '#2a2a30',
    borderRadius: 8,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnText: { color: '#f5f5f7', fontSize: 15, fontFamily: geist.semibold, letterSpacing: 0.2 },
});

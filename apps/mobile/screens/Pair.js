import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { parseQrPayload, runPhonePairing } from '../lib/pairing';

const geist = { regular: 'Geist_400Regular', semibold: 'Geist_600SemiBold' };

const STATUS_LABEL = {
  connecting: 'Connecting to relay…',
  waiting_for_laptop: 'Waiting for desktop…',
  handshaking: 'Verifying pairing secret…',
  paired: 'Paired.',
  expired: 'Pairing timed out.',
  error: 'Pairing failed.',
};

export default function Pair({ onBack, onPaired }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const activeCancelRef = useRef(null);

  useEffect(() => () => activeCancelRef.current?.(), []);

  const handleScan = ({ data }) => {
    if (busy) return;
    const payload = parseQrPayload(data);
    if (!payload) {
      setError('Not a Tempest pairing QR.');
      return;
    }
    setError(null);
    setBusy(true);
    setStatus('connecting');

    const run = runPhonePairing(payload, {
      onStatus: setStatus,
    });
    activeCancelRef.current = run.cancel;

    run.promise
      .then((r) => {
        onPaired?.({
          name: r.name,
          endpoint: payload.relay_url,
          pubkey: r.pubkey,
          fingerprint: r.fingerprint,
        });
      })
      .catch((e) => {
        setError(e.message || 'Pairing failed.');
        setBusy(false);
        setStatus(null);
      });
  };

  const cancelActive = () => {
    activeCancelRef.current?.();
    activeCancelRef.current = null;
    setBusy(false);
    setStatus(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable
          onPress={() => { cancelActive(); onBack?.(); }}
          hitSlop={12}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Pair Tempest</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraWrap}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : handleScan}
          />
        ) : (
          <View style={styles.permBlock}>
            <Text style={styles.permText}>
              {permission?.canAskAgain === false
                ? 'Camera access denied. Enable it in Settings to scan the pairing QR.'
                : 'Camera access is needed to scan the pairing QR shown on your desktop.'}
            </Text>
            {permission?.canAskAgain !== false && (
              <Pressable style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Allow Camera</Text>
              </Pressable>
            )}
          </View>
        )}

        <View pointerEvents="none" style={styles.frame} />

        {busy && (
          <View style={styles.overlay}>
            <ActivityIndicator size="small" color="#f5f5f7" />
            <Text style={styles.overlayText}>
              {STATUS_LABEL[status] ?? 'Working…'}
            </Text>
            <Pressable style={styles.overlayCancel} onPress={cancelActive}>
              <Text style={styles.overlayCancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.timeline}>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.nodeCol}>
              <View style={styles.node}>
                <Text style={styles.nodeNum}>{i + 1}</Text>
              </View>
              {i < STEPS.length - 1 && <View style={styles.connector} />}
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBodyText}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const STEPS = [
  { title: 'Open Tempest', body: 'Launch the desktop app on your laptop.' },
  { title: 'Settings → Mobile', body: 'Choose Pair a phone to reveal the QR.' },
  { title: 'Scan the QR', body: 'Point your camera at the code above.' },
];

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  back: { color: '#f5f5f7', fontSize: 28, fontFamily: geist.regular, width: 24 },
  title: { color: '#f5f5f7', fontSize: 17, fontFamily: geist.semibold, letterSpacing: -0.2 },

  cameraWrap: {
    marginHorizontal: 20,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    top: 24, bottom: 24, left: 24, right: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.6)',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  overlayText: {
    color: '#f5f5f7',
    fontSize: 14,
    fontFamily: geist.regular,
    textAlign: 'center',
  },
  overlayCancel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  overlayCancelText: { color: '#f5f5f7', fontSize: 13, fontFamily: geist.semibold },

  permBlock: { padding: 24, alignItems: 'center', gap: 16 },
  permText: { color: '#b8b8c0', fontSize: 14, fontFamily: geist.regular, textAlign: 'center', lineHeight: 20 },
  permBtn: { backgroundColor: '#ffffff', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 },
  permBtnText: { color: '#0c0d10', fontSize: 14, fontFamily: geist.semibold, letterSpacing: 0.2 },

  errorBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(217,112,112,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(217,112,112,0.35)',
  },
  errorText: { color: '#f0b0b0', fontSize: 13, fontFamily: geist.regular },

  timeline: { paddingHorizontal: 28, paddingTop: 40 },
  step: { flexDirection: 'row', alignItems: 'stretch' },
  nodeCol: { width: 44, alignItems: 'center' },
  node: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeNum: {
    color: '#0a0a0a',
    fontSize: 18,
    fontFamily: 'GeistPixel',
    letterSpacing: 0.5,
    includeFontPadding: false,
    textAlign: 'center',
  },
  connector: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 6,
    marginBottom: 6,
  },
  stepBody: { flex: 1, paddingLeft: 18, paddingBottom: 52 },
  stepTitle: {
    color: '#f5f5f7',
    fontSize: 19,
    fontFamily: geist.semibold,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  stepBodyText: {
    color: '#8a8a90',
    fontSize: 15,
    fontFamily: geist.regular,
    lineHeight: 22,
    marginTop: 4,
  },
});

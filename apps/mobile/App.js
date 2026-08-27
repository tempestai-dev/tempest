import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Pressable, Text, Linking } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { GLView } from 'expo-gl';
import { Renderer, loadAsync } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './themes';
import Pair from './screens/Pair';
import Connected from './screens/Connected';
import DeviceList from './screens/DeviceList';

const DEV = process.env.EXPO_PUBLIC_DEV === 'true';
const PAIRINGS_KEY = 'pairings';
const WELCOME_SEEN_KEY = 'welcome_seen';

const shortId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Pair.js completes the handshake and hands us a real record. We only add
// the local id + timestamp here. sessionKey + sessionId + relayUrl are
// what the RPC client uses to (re)connect within one Tempest run.
const pairingFromHandshake = (r) => ({
  id: shortId(),
  name: r.name || 'Tempest desktop',
  endpoint: r.endpoint,
  pubkey: r.pubkey,
  fingerprint: r.fingerprint,
  sessionId: r.sessionId,
  sessionKey: r.sessionKey,
  relayUrl: r.relayUrl,
  createdAt: Date.now(),
});

// Geist family per weight — RN needs an exact family per weight, no synthesis.
export const geist = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
};

function Logo3D() {
  const rafRef = useRef(null);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onContextCreate = async (gl) => {
    const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;

    const renderer = new Renderer({ gl, alpha: true });
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 3);

    // studio rig — bright enough that no facet crushes to black on a dark bg
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x808080, 1.4));

    const key = new THREE.DirectionalLight(0xfff4e6, 3.2);
    key.position.set(4, 5, 6);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd4ff, 2.0);
    fill.position.set(-5, 2, 3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 2.4);
    rim.position.set(0, 3, -6);
    scene.add(rim);

    const under = new THREE.DirectionalLight(0xffffff, 0.8);
    under.position.set(0, -4, 2);
    scene.add(under);

    // head-on spot straight at the model from camera direction
    const front = new THREE.DirectionalLight(0xffffff, 3.5);
    front.position.set(0, 0, 6);
    scene.add(front);

    // ring of eye-level side lights so every rotation gets a direct hit
    const ring = [
      [6, 0, 0],   // right
      [-6, 0, 0],  // left
      [4, 0, -4],  // back-right
      [-4, 0, -4], // back-left
      [4, 0, 4],   // front-right (low)
      [-4, 0, 4],  // front-left (low)
    ];
    for (const [x, y, z] of ring) {
      const l = new THREE.DirectionalLight(0xffffff, 1.5);
      l.position.set(x, y, z);
      scene.add(l);
    }

    // top-down so the crown never falls into shadow
    const top = new THREE.DirectionalLight(0xffffff, 1.6);
    top.position.set(0, 6, 0);
    scene.add(top);

    const asset = Asset.fromModule(require('./assets/logo.glb'));
    await asset.downloadAsync();
    const gltf = await loadAsync(asset.localUri || asset.uri);
    const model = gltf.scene;

    // fit model to a unit sphere so any glb sits centered at a sane scale
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const scale = 2.2 / size;
    model.scale.setScalar(scale);

    scene.add(model);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      model.rotation.y += 0.006;
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    tick();
  };

  return <GLView style={{ width: 340, height: 340 }} onContextCreate={onContextCreate} />;
}

function GetStartedButton({ onPress }) {
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 8, width: '100%' }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          paddingVertical: 21,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: '#0c0d10', fontSize: 19, fontFamily: geist.semibold, letterSpacing: 0.2 }}>
          Get Started
        </Text>
        <View style={{ transform: [{ rotate: '-45deg' }] }}>
          <Text style={{ color: '#0c0d10', fontSize: 28, fontFamily: geist.regular }}>→</Text>
        </View>
      </Pressable>
    </View>
  );
}

function Welcome({ onGetStarted }) {
  const { mode } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: 56, paddingHorizontal: 24 }}>
        <Text style={{
          color: '#f5f5f7',
          fontSize: 32,
          fontFamily: 'GeistPixel',
          letterSpacing: 0.5,
          textAlign: 'left',
          lineHeight: 42,
        }}>
          {'Agentic engineering\non the go'}
        </Text>
        <Text style={{
          color: '#b8b8c0',
          fontSize: 17,
          fontFamily: geist.regular,
          letterSpacing: -0.1,
          marginTop: 14,
        }}>
          Pair Tempest. Drive it from anywhere.
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Logo3D />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <GetStartedButton onPress={onGetStarted} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <Text
            style={{ color: '#6b6b70', fontSize: 12, fontFamily: geist.regular, letterSpacing: 0.2 }}
            onPress={() => Linking.openURL('https://github.com/tempestai-dev/tempest')}
          >
            Open Source
          </Text>
          <Text style={{ color: '#3f3f45', fontSize: 12, fontFamily: geist.regular }}>·</Text>
          <Text
            style={{ color: '#6b6b70', fontSize: 12, fontFamily: geist.regular, letterSpacing: 0.2 }}
            onPress={() => Linking.openURL('https://github.com/tempestai-dev/tempest/blob/main/LICENSE')}
          >
            Apache 2.0
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistPixel: require('./assets/fonts/GeistPixel-Square.ttf'),
  });
  const [screen, setScreen] = useState(null); // null while we resolve boot state
  const [pairings, setPairings] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const persistPairings = (next) => {
    setPairings(next);
    AsyncStorage.setItem(PAIRINGS_KEY, JSON.stringify(next)).catch(() => {});
  };

  useEffect(() => {
    (async () => {
      try {
        const [rawPairings, welcomeSeen] = await Promise.all([
          AsyncStorage.getItem(PAIRINGS_KEY),
          AsyncStorage.getItem(WELCOME_SEEN_KEY),
        ]);
        const list = rawPairings ? JSON.parse(rawPairings) : [];
        setPairings(list);
        if (DEV) { setScreen('welcome'); return; }
        if (list.length === 1) { setActiveId(list[0].id); setScreen('connected'); return; }
        if (list.length >= 2) { setScreen('list'); return; }
        setScreen(welcomeSeen === 'true' ? 'pair' : 'welcome');
      } catch {
        setScreen('welcome');
      }
    })();
  }, []);

  if (!loaded || screen === null) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
  }

  const goPair = () => {
    AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true').catch(() => {});
    setScreen('pair');
  };

  const handlePaired = (record) => {
    const p = pairingFromHandshake(record);
    persistPairings([...pairings, p]);
    setActiveId(p.id);
    setScreen('connected');
  };

  const handleUnpairActive = () => {
    const next = pairings.filter((p) => p.id !== activeId);
    persistPairings(next);
    setActiveId(next[0]?.id ?? null);
    if (next.length === 1) setScreen('connected');
    else if (next.length >= 2) setScreen('list');
    else setScreen('pair'); // onboarded before; skip welcome
  };

  const handleForget = (id) => {
    const next = pairings.filter((p) => p.id !== id);
    persistPairings(next);
    if (next.length === 1) { setActiveId(next[0].id); setScreen('connected'); }
    else if (next.length === 0) setScreen('pair');
    // 2+ remaining → stay on list
  };

  const activePairing = pairings.find((p) => p.id === activeId) || null;
  const showBackFromConnected = pairings.length >= 2;

  return (
    <SafeAreaProvider>
      <ThemeProvider initial="dark">
        {screen === 'welcome' && <Welcome onGetStarted={goPair} />}
        {screen === 'pair' && (
          <Pair
            onBack={() => setScreen(pairings.length >= 2 ? 'list' : pairings.length === 1 ? 'connected' : 'welcome')}
            onPaired={handlePaired}
          />
        )}
        {screen === 'list' && (
          <DeviceList
            pairings={pairings}
            onConnect={(id) => { setActiveId(id); setScreen('connected'); }}
            onForget={handleForget}
            onPairAnother={() => setScreen('pair')}
          />
        )}
        {screen === 'connected' && (
          <Connected
            pairing={activePairing}
            onUnpair={handleUnpairActive}
            onBack={showBackFromConnected ? () => setScreen('list') : undefined}
          />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

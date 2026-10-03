// Expo push token registration. Called once per Connected mount after the
// protocol handshake. Sends the token to the desktop via RPC; desktop stores
// it and POSTs to Expo's push service when an agent transitions to
// `waiting` (needs approval / input).
//
// Only works on real devices (Expo Go can't receive remote push on iOS 18+).
// Preview / production EAS builds pick up the entitlement via the
// `expo-notifications` plugin declared in app.json.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

const log = (...a) => { if (__DEV__) console.log(...a); };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const projectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ||
  Constants.easConfig?.projectId;

// Returns { token, platform } or null if we couldn't get one (simulator,
// perms denied, no projectId). Caller must handle null — pairing still
// works, just no wake-me-up.
export async function getPushToken() {
  if (!Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tempest',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ffffff',
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const pid = projectId();
    if (!pid) { log('[push] no projectId in expoConfig'); return null; }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    return { token: data, platform: Platform.OS };
  } catch (e) {
    log('[push] getPushToken failed', e?.message || e);
    return null;
  }
}

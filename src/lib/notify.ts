import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let _granted: boolean | null = null;
let _iconPath: string | null = null;

async function canNotify(): Promise<boolean> {
  if (_granted !== null) return _granted;
  _granted = await isPermissionGranted();
  if (!_granted) {
    const result = await requestPermission();
    _granted = result === "granted";
  }
  return _granted;
}

async function iconPath(): Promise<string> {
  if (_iconPath !== null) return _iconPath;
  _iconPath = await invoke<string>("get_notification_icon_path");
  return _iconPath;
}

export async function notifyIfUnfocused(title: string, body: string) {
  if (document.hasFocus()) return;
  if (!(await canNotify())) return;
  const icon = await iconPath();
  sendNotification({ title, body, ...(icon ? { icon } : {}) });
}

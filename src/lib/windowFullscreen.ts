import { getCurrentWindow } from "@tauri-apps/api/window";

// Tauri's set_maximized / set_size promises resolve when the request is dispatched,
// not when the OS finishes the state transition. Calling setFullscreen on a window
// still mid-transition from maximized is silently dropped by macOS (NSWindow) and
// Win32. Unmaximize first, wait for the transition, then request fullscreen.
let isFullscreen = false;
let wasMaximized = false;

export async function toggleFullscreen() {
  const win = getCurrentWindow();
  if (!isFullscreen) {
    wasMaximized = await win.isMaximized();
    if (wasMaximized) {
      await win.unmaximize();
      await new Promise((r) => setTimeout(r, 150));
    }
    await win.setFullscreen(true);
    isFullscreen = true;
  } else {
    await win.setFullscreen(false);
    if (wasMaximized) await win.maximize();
    isFullscreen = false;
  }
}

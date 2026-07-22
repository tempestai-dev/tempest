import ReactDOM from "react-dom/client";
import "./fonts.css";
import App from "./App";
import { ThemeProvider } from "./themes/ThemeContext";
import { loadAppState } from "./lib/runtimeState";
import { loadSessions } from "./store/sessions";
import { loadProjects } from "./store/openProjects";
import { loadRecents } from "./store/recents";
import { loadTabs } from "./store/tabs";
import { loadChat } from "./lib/chatHistory";

// StrictMode intentionally removed — it double-invokes effects which causes
// PTY sessions to spawn twice on mount. This matches Termic's design decision.
(async () => {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  // Hydrate every in-memory mirror from SQLite before the first render. All of
  // these are independent — loadChat only resolves project path → id lazily at
  // read time, so it does not need loadProjects to have finished first.
  await Promise.all([
    loadAppState(), loadSessions(), loadProjects(), loadRecents(), loadTabs(), loadChat(),
  ]);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
})();

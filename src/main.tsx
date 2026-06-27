import ReactDOM from "react-dom/client";
import "./fonts.css";
import App from "./App";
import { ThemeProvider } from "./themes/ThemeContext";
import { loadRuntimeState } from "./lib/runtimeState";

// StrictMode intentionally removed — it double-invokes effects which causes
// PTY sessions to spawn twice on mount. This matches Termic's design decision.
(async () => {
  await loadRuntimeState();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
})();

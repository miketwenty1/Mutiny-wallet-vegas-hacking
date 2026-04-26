import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { appBuildTime, appVersion } from "./lib/version";

window.__MUTINYNET_WALLET__ = { version: appVersion(), buildTime: appBuildTime() };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

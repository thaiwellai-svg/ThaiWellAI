import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "./design-system/base.css";
import "./design-system/components.css";
import "./design-system/density.css";
import "./design-system/system.css";
import { StoreProvider } from "./store/store";
import { ToastProvider } from "./design-system";
import { AppShell } from "./layout/AppShell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
        <StoreProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </StoreProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import GlobalDateInputValidation from "@/components/GlobalDateInputValidation";
import { ToastProvider } from "@/context/ToastContext";
import { PanelBrandingProvider } from "@/context/PanelBrandingContext";
import { initTheme } from "@/theme/theme";
import "./styles/global.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <PanelBrandingProvider>
          <GlobalDateInputValidation />
          <App />
        </PanelBrandingProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

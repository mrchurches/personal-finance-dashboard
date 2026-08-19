import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import "./i18n";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("The application root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import { installDemoApi } from "./demo";
import "./i18n";
import "./index.css";

/*
 * Before the first render, because the first thing the dashboard does is ask the API where
 * to start, and in the published demo there is no API to ask.
 */
installDemoApi();

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

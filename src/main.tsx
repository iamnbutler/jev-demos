import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import App from "./App";
import { HealthProvider } from "./lib/health";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <HealthProvider>
        <App />
      </HealthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

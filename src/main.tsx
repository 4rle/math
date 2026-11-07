import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { startPwa } from "./pwa";
import "./style.css";
import "./glass.css";
import "./refined.css";
import "./rating.css";
startPwa();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

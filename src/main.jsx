import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import App from "./App.jsx";

posthog.init("phc_cmo9MNuE4KYgCEwrOLa4HKwDiXm361a7ln8wB2QmSTV", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

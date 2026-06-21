import React from "react";
import ReactDOM from "react-dom/client";
import "./global.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Capture from "./windows/Capture";
import NotesList from "./windows/NotesList";
import Onboarding from "./windows/Onboarding";

const WINDOW_COMPONENTS: Record<string, React.ComponentType> = {
  capture: Capture,
  "notes-list": NotesList,
  onboarding: Onboarding,
};

const label = getCurrentWebviewWindow().label;
const Component = WINDOW_COMPONENTS[label] ?? Capture;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>,
);

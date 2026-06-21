import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import onboardingIcon from "../assets/onboarding-icon.png";
import "../tokens.css";
import "../global.css";

const win = getCurrentWebviewWindow();

const HOTKEYS = [
  { keys: "Ctrl + N", desc: "Быстрый захват заметки" },
  { keys: "Ctrl + Shift + N", desc: "Открыть заметку в работе" },
  { keys: "Ctrl + Alt + N", desc: "Список всех заметок" },
  { keys: "Ctrl + L", desc: "Взять в работу / открепить" },
];

const outerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background:
    "radial-gradient(ellipse 700px 420px at 18% 90%, rgba(255,255,255,0.85), transparent 60%), linear-gradient(160deg, #cfe0f2, #eaf1f8 55%, #ffffff 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font)",
  userSelect: "none",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-card-bg-onboard)",
  border: "1px solid rgba(255, 255, 255, 0.70)",
  borderRadius: "var(--radius-card-lg)",
  boxShadow: "var(--shadow-ring), var(--shadow-onboard)",
  padding: "40px 32px 32px",
  width: 400,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  animation: "qn-onb-rise 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 20px",
  fontSize: 16,
  fontWeight: 700,
  background: "var(--color-btn-primary-bg)",
  color: "var(--color-btn-primary-text)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  cursor: "pointer",
  marginBottom: 10,
  letterSpacing: "0.1px",
  boxShadow: "var(--shadow-btn-primary)",
  fontFamily: "var(--font)",
};

const secondaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 20px",
  fontSize: 16,
  fontWeight: 600,
  background: "var(--color-btn-secondary-bg)",
  color: "var(--color-btn-secondary-text)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  cursor: "pointer",
  boxShadow: "inset 0 0 0 1px rgba(20, 24, 31, 0.06)",
  fontFamily: "var(--font)",
};

export default function Onboarding() {
  const [screen, setScreen] = useState<"main" | "details">("main");

  const handleStart = async () => {
    await invoke("complete_onboarding");
    await win.hide();
  };

  if (screen === "details") {
    return (
      <div style={outerStyle}>
        <div style={cardStyle}>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 24,
              fontWeight: 800,
              color: "#14181f",
              letterSpacing: "-0.4px",
              lineHeight: 1.1,
              alignSelf: "flex-start",
            }}
          >
            Как это работает
          </h2>

          <p
            style={{
              margin: "0 0 20px",
              fontSize: 14,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              textAlign: "left",
              alignSelf: "flex-start",
            }}
          >
            QuickNote — мгновенный захват мыслей без отвлечения. Нажми
            хоткей, запиши, нажми Enter — и возвращайся к работе.
          </p>

          <div style={{ width: "100%", marginBottom: 24 }}>
            {HOTKEYS.map(({ keys, desc }) => (
              <div
                key={keys}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-row)",
                  background: "var(--color-row-bg)",
                  border: "var(--border-row)",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--color-accent)",
                    letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginRight: 12,
                  }}
                >
                  {keys}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-body)",
                    textAlign: "right",
                  }}
                >
                  {desc}
                </span>
              </div>
            ))}
          </div>

          <button onClick={handleStart} style={primaryBtnStyle}>
            Начать
          </button>
          <button onClick={() => setScreen("main")} style={secondaryBtnStyle}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={outerStyle}>
      <div style={cardStyle}>
        <img
          src={onboardingIcon}
          alt=""
          draggable={false}
          style={{
            width: 96,
            height: 96,
            marginBottom: 20,
            objectFit: "contain",
            filter: "drop-shadow(0 10px 18px rgba(80, 100, 200, 0.35))",
          }}
        />

        <h1
          style={{
            margin: "0 0 10px",
            fontSize: 32,
            fontWeight: 800,
            color: "#14181f",
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
          }}
        >
          Quick Note
        </h1>

        <p
          style={{
            margin: "0 0 28px",
            fontSize: 15,
            color: "var(--color-text-secondary)",
            lineHeight: 1.55,
            maxWidth: 280,
          }}
        >
          Мгновенно записывай мысли с помощью глобальных горячих клавиш.
        </p>

        <button onClick={handleStart} style={primaryBtnStyle}>
          Начать
        </button>

        <button onClick={() => setScreen("details")} style={secondaryBtnStyle}>
          Подробнее
        </button>
      </div>
    </div>
  );
}

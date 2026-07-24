// src/main.tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import StudentActiveToggleDecorator from "./components/admin/StudentActiveToggleDecorator";
import "./index.css";

import { ThemeProvider } from "./brand/ThemeProvider";
import { ensureBrandStylesheets } from "./brand/BrandProvider";

import { hybridSync } from "./lib/hybridSync";
import { logger } from "./lib/logger";
import { setDevMode } from "./lib/storage";

// Root element
const root = document.getElementById("root")!;

/**
 * ✅ IMPORTANT:
 * Load brand CSS immediately (before first paint + before boot screen)
 * to guarantee tokens exist for Tailwind (bg-background, text-primary, etc).
 */
ensureBrandStylesheets();

/**
 * Minimal boot screens that follow TOBY MUSIC design language
 * Uses HSL tokens (Tailwind/shadcn style): hsl(var(--token))
 */
const renderBootScreen = (opts: {
  title: string;
  subtitle?: string;
  showRetry?: boolean;
}) => {
  const { title, subtitle, showRetry } = opts;

  root.innerHTML = `
    <div style="
      min-height: 100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background: hsl(var(--background, 0 0% 4%));
      color: hsl(var(--foreground, 0 0% 98%));
      padding:24px;
    ">
      <div style="
        width:min(520px, 100%);
        border:1px solid hsl(var(--border, 45 30% 92%) / 0.35);
        border-radius:10px;
        background: hsl(var(--card, 0 0% 10%));
        padding:28px 24px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.60);
        text-align:center;
      ">
        <div style="
          font-size:22px;
          font-weight:700;
          letter-spacing:0.2px;
          color: hsl(var(--primary, 39 76% 63%));
          margin-bottom:10px;
        ">Toby Music</div>

        <div style="
          font-size:18px;
          font-weight:700;
          color: hsl(var(--foreground, 0 0% 98%));
          margin-bottom:10px;
        ">${title}</div>

        ${
          subtitle
            ? `<div style="
                font-size:14px;
                line-height:1.6;
                color: hsl(var(--muted-foreground, 40 12% 72%));
                margin-bottom:${showRetry ? "18px" : "0"};
              ">
                ${subtitle}
              </div>`
            : ""
        }

        ${
          showRetry
            ? `<button
                onclick="window.location.reload()"
                style="
                  border:1px solid hsl(var(--primary, 39 76% 63%));
                  color: hsl(var(--primary, 39 76% 63%));
                  background:transparent;
                  padding:12px 18px;
                  border-radius:10px;
                  font-size:14px;
                  font-weight:700;
                  cursor:pointer;
                "
                onmouseover="this.style.background='rgba(230,182,92,0.12)';"
                onmouseout="this.style.background='transparent';"
              >
                נסי שוב
              </button>`
            : ""
        }
      </div>
    </div>
  `;
};

// Show loading screen immediately
renderBootScreen({ title: "טוען…", subtitle: "אנא המתן" });

// Register Service Worker for PWA (minimal, network-first)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // Unregister old SWs first
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        logger.info("🗑️ Old ServiceWorker unregistered");
      }

      // Register new clean SW
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
        scope: "/",
      });

      // Force update check on every load
      registration.update();

      logger.info("✅ ServiceWorker registered (v1.0.2)");

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              logger.info("🔄 New ServiceWorker activated");
            }
          });
        }
      });
    } catch (error) {
      logger.error("❌ ServiceWorker registration failed:", error);
    }
  });
}

// Load data from Worker before starting the app
async function initializeApp() {
  try {
    logger.info("Starting app initialization...");

    // 🔒 Ensure dev mode BEFORE loading any data
    const forceDevByRoute = window.location.pathname.startsWith("/dev-admin");
    if (forceDevByRoute) {
      setDevMode(true);
      sessionStorage.setItem("musicSystem_devMode", "true");
      logger.info("🔧 Dev mode forced by route - NO data will be loaded from Worker");
    }

    const isDevModeActive =
      sessionStorage.getItem("musicSystem_devMode") === "true";
    if (isDevModeActive) {
      setDevMode(true);
      logger.info("🔧 Dev mode active - NO data will be loaded from Worker");
    }

    await hybridSync.loadDataOnInit();
    logger.info("Data loaded successfully");

    // ✅ Render app with ThemeProvider only (no BrandProvider -> no duplicates)
    createRoot(root).render(
      <ThemeProvider defaultTheme="system">
        <StudentActiveToggleDecorator />
        <App />
      </ThemeProvider>
    );
  } catch (error) {
    logger.error("Failed to initialize app:", error);

    renderBootScreen({
      title: "שגיאה בטעינת הנתונים",
      subtitle:
        "לא הצלחנו לטעון את הנתונים מהשרת. אנא בדקי את החיבור לאינטרנט ונסי שוב.",
      showRetry: true,
    });
  }
}

initializeApp();

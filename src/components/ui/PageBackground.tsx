import { useLocation } from "react-router-dom";
import stageDark from "@/assets/stage-dark.png.asset.json";

const PageBackground = () => {
  const { pathname } = useLocation();
  const hideOverlay = pathname === "/";

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      {/* Full page: pianoflute background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${stageDark.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      />

      {/* Overlay: inset with feathered edges — hidden on homepage */}
      {!hideOverlay && (
        <div
          className="absolute"
          style={{
            inset: "12px",
            borderRadius: "18px",
            maskImage:
              "radial-gradient(ellipse at center, black 85%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 85%, transparent 100%)",
          }}
        >
          <div
            className="absolute inset-0 dark:hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,248,230,0.85) 0%, rgba(230,182,92,0.85) 100%)",
            }}
          />
          <div
            className="absolute inset-0 hidden dark:block"
            style={{ background: "rgba(0,0,0,0.85)" }}
          />
        </div>
      )}
    </div>
  );
};

export default PageBackground;

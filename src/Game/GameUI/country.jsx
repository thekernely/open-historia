/*! Open Historia Continuum — first-class Country drawer */
import React, { useCallback, useEffect, useState } from "react";
import StatsPane from "./stats.jsx";

const COUNTRY_PANEL_WIDTH = "min(20rem, calc(100vw - 1rem))";

const CountryPanel = ({ isCountryOpen, onClose, width, onResize }) => {
  const [hasOpened, setHasOpened] = useState(isCountryOpen);
  const [isResizing, setIsResizing] = useState(false);
  const [handleHover, setHandleHover] = useState(false);

  useEffect(() => {
    if (isCountryOpen) setHasOpened(true);
  }, [isCountryOpen]);

  const handleResizeStart = useCallback((event) => {
    if (typeof onResize !== "function") return;
    event.preventDefault();
    const target = event.currentTarget;
    try { target.setPointerCapture(event.pointerId); } catch { /* not fatal */ }
    setIsResizing(true);
    const onMove = (moveEvent) => onResize(window.innerWidth - moveEvent.clientX);
    const onUp = () => {
      setIsResizing(false);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }, [onResize]);

  if (!hasOpened) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        transform: isCountryOpen ? "translateX(0)" : "translateX(calc(100% + 2rem))",
        width: typeof width === "number" ? `${width}px` : COUNTRY_PANEL_WIDTH,
        height: "100vh",
        backgroundColor: "rgba(24, 24, 27, 0.95)",
        backdropFilter: "blur(8px)",
        zIndex: 10040,
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        flexDirection: "column",
        color: "white",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {typeof onResize === "function" && (
        <div
          onPointerDown={handleResizeStart}
          onPointerEnter={() => setHandleHover(true)}
          onPointerLeave={() => setHandleHover(false)}
          title="Drag to resize"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "10px",
            cursor: "ew-resize",
            zIndex: 30,
            touchAction: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "42px",
              borderRadius: "2px",
              backgroundColor: isResizing
                ? "rgba(96,165,250,0.95)"
                : handleHover
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.22)",
              transition: "background-color 0.15s",
            }}
          />
        </div>
      )}

      <div
        style={{
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          minHeight: "2.65rem",
          padding: "0 0.75rem 0 0.9rem",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "0.45rem",
            color: "rgba(255,255,255,0.82)",
            fontSize: "0.78rem",
            fontWeight: 850,
          }}
        >
          <span aria-hidden="true">🏳️</span>
          <span>Country</span>
        </div>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close country panel"
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              fontSize: "1.35rem",
              lineHeight: 1,
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
        <StatsPane active={isCountryOpen} />
      </div>
    </div>
  );
};

export { COUNTRY_PANEL_WIDTH, CountryPanel };
export default CountryPanel;

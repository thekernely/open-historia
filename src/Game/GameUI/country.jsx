/*! Open Historia — country overview shell © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React from "react";
import StatsPane from "./stats.jsx";

const CountryPanel = ({ open, onClose, width, onResize }) => {
    if (!open) return null;
    return (
        <div className="oh-hud-panel" style={{
            position: "fixed", bottom: "0.5rem", right: "0.5rem",
            width: typeof width === "number" ? `${width}px` : "min(28rem, 38vw)",
            height: "calc(100vh - 1rem)",
            zIndex: 10040,
            background: "var(--oh-hud-bg-strong)",
            backdropFilter: "var(--oh-hud-blur)",
            border: "1px solid var(--oh-hud-border)",
            borderRadius: "18px",
            overflow: "hidden",
            color: "white",
            display: "flex",
            flexDirection: "column",
        }}>
            <div style={{display:"flex",alignItems:"center",padding:"0.6rem 0.8rem",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                <strong>▣ Country</strong>
                <div style={{flex:1}} />
                <button onClick={onClose} style={{background:"none",border:0,color:"white",fontSize:"1.2rem",cursor:"pointer"}}>✕</button>
            </div>
            <div style={{flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden"}}>
                <StatsPane active={open} />
            </div>
        </div>
    );
};
export default CountryPanel;

"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ */
/*  Comparison page for 3 design solutions                             */
/*  Navigate to /design-comparison to view                             */
/* ------------------------------------------------------------------ */

// ─── Solution 1: Stacked Brutal ───────────────────────────────────

function StackedBrutalLogo({ size = 120 }: { size?: number }) {
  const blockSize = size * 0.36;
  const gap = size * 0.06;
  const r = size * 0.04;
  const sw = 2;

  // Shadow layers for normal blocks (3 layers)
  const normalShadows = [
    { dx: 1, dy: 1, color: "#333" },
    { dx: 2, dy: 2, color: "#555" },
    { dx: 3, dy: 3, color: "#777" },
  ];
  // Shadow layers for accent block (5 layers — taller)
  const accentShadows = [
    { dx: 1, dy: 1, color: "#b89400" },
    { dx: 2, dy: 2, color: "#9c8000" },
    { dx: 3, dy: 3, color: "#807000" },
    { dx: 4, dy: 4, color: "#646000" },
    { dx: 5, dy: 5, color: "#4a4800" },
  ];

  const blocks = [
    { x: 0, y: 0, fill: "#ffd8f4", isAccent: false },
    { x: blockSize + gap, y: 0, fill: "#ffc900", isAccent: true },
    { x: 0, y: blockSize + gap, fill: "#ffd8f4", isAccent: false },
    { x: blockSize + gap, y: blockSize + gap, fill: "#ffd8f4", isAccent: false },
  ];

  const totalW = blockSize * 2 + gap + 6;
  const totalH = blockSize * 2 + gap + 6;

  return (
    <svg width={totalW} height={totalH} viewBox={`-1 -1 ${totalW + 2} ${totalH + 2}`}>
      {blocks.map((block, i) => {
        const shadows = block.isAccent ? accentShadows : normalShadows;
        return (
          <g key={i}>
            {/* Shadow rects (back to front) */}
            {[...shadows].reverse().map((s, si) => (
              <rect
                key={`s${si}`}
                x={block.x + s.dx}
                y={block.y + s.dy}
                width={blockSize}
                height={blockSize}
                rx={r}
                fill={s.color}
                stroke="none"
              />
            ))}
            {/* Main block */}
            <rect
              x={block.x}
              y={block.y}
              width={blockSize}
              height={blockSize}
              rx={r}
              fill={block.fill}
              stroke="#1a1a1a"
              strokeWidth={sw}
            />
            {/* Location dot on accent block */}
            {block.isAccent && (
              <>
                <defs>
                  <radialGradient id="dotGrad1" cx="35%" cy="35%">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#1a1a1a" />
                  </radialGradient>
                </defs>
                <circle
                  cx={block.x + blockSize * 0.65}
                  cy={block.y + blockSize * 0.4}
                  r={blockSize * 0.12}
                  fill="url(#dotGrad1)"
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StackedBrutalCard() {
  return (
    <div
      style={{
        background: "#FFFBF5",
        border: "2px solid #1a1a1a",
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow:
          "1px 1px 0px #1a1a1a, 2px 2px 0px #2a2a2a, 3px 3px 0px #3a3a3a, 4px 4px 0px #4a4a4a",
        width: 260,
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 4 }}>
        Hinta-arvio
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Libre Franklin', sans-serif", color: "#1a1a1a" }}>
        3 500 <span style={{ fontSize: 16, fontWeight: 500 }}>&euro;/m&sup2;</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            background: "#fff0fb",
            border: "2px solid #1a1a1a",
            borderRadius: 100,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Kerrostalo
        </span>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            background: "#f0e6ff",
            border: "2px solid #1a1a1a",
            borderRadius: 100,
            fontSize: 11,
            fontWeight: 600,
            color: "#7C3AED",
          }}
        >
          Uusi: Violet
        </span>
      </div>
    </div>
  );
}

function StackedBrutalButton() {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: "#FF90E8",
        border: "2px solid #1a1a1a",
        borderRadius: 12,
        padding: "10px 24px",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        transform: pressed ? "translate(4px, 4px)" : "translate(-1px, -1px)",
        boxShadow: pressed
          ? "none"
          : "1px 1px 0px #1a1a1a, 2px 2px 0px #2a2a2a, 3px 3px 0px #3a3a3a, 4px 4px 0px #4a4a4a, 5px 5px 0px #5a5a5a",
        transition: "all 0.1s ease",
        fontFamily: "'Public Sans', 'DM Sans', sans-serif",
      }}
    >
      Katso hinta-arvio
    </button>
  );
}

// ─── Solution 2: Clay Map ────────────────────────────────────────

function ClayMapLogo({ size = 120 }: { size?: number }) {
  const blockSize = size * 0.36;
  const gap = size * 0.06;
  const r = size * 0.08; // rounder

  const blocks = [
    { x: 0, y: 0, topColor: "#ffddd0", bottomColor: "#ffb8a0", isAccent: false },
    { x: blockSize + gap, y: 0, topColor: "#ffe68a", bottomColor: "#e8b800", isAccent: true },
    { x: 0, y: blockSize + gap, topColor: "#ffddd0", bottomColor: "#ffb8a0", isAccent: false },
    { x: blockSize + gap, y: blockSize + gap, topColor: "#ffddd0", bottomColor: "#ffb8a0", isAccent: false },
  ];

  const totalW = blockSize * 2 + gap + 8;
  const totalH = blockSize * 2 + gap + 8;

  return (
    <svg width={totalW} height={totalH} viewBox={`-2 -2 ${totalW + 4} ${totalH + 4}`}>
      <defs>
        {blocks.map((b, i) => (
          <linearGradient key={`g${i}`} id={`clayGrad${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={b.topColor} />
            <stop offset="100%" stopColor={b.bottomColor} />
          </linearGradient>
        ))}
        <radialGradient id="clayDot" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.9} />
          <stop offset="50%" stopColor="#ffc900" />
          <stop offset="100%" stopColor="#b89000" />
        </radialGradient>
        <filter id="clayInner" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
          <feOffset dx="0" dy="1.5" result="offsetBlur" />
          <feFlood floodColor="#000" floodOpacity="0.08" result="color" />
          <feComposite in2="offsetBlur" operator="in" result="shadow" />
          <feComposite in="SourceGraphic" in2="shadow" operator="over" />
        </filter>
      </defs>
      {blocks.map((block, i) => (
        <g key={i}>
          {/* Outer shadow */}
          <rect
            x={block.x + 3}
            y={block.y + 4}
            width={blockSize}
            height={blockSize}
            rx={r}
            fill="rgba(0,0,0,0.12)"
          />
          {/* Main block with gradient + inner shadow */}
          <rect
            x={block.x}
            y={block.y}
            width={blockSize}
            height={blockSize}
            rx={r}
            fill={`url(#clayGrad${i})`}
            stroke="#1a1a1a"
            strokeWidth={3}
            filter="url(#clayInner)"
          />
          {/* Location dot sphere */}
          {block.isAccent && (
            <circle
              cx={block.x + blockSize * 0.65}
              cy={block.y + blockSize * 0.4}
              r={blockSize * 0.13}
              fill="url(#clayDot)"
              stroke="#1a1a1a"
              strokeWidth={1.5}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

function ClayMapCard() {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #ffffff, #FFF8F0)",
        border: "3px solid #1a1a1a",
        borderRadius: 20,
        padding: "20px 24px",
        boxShadow:
          "inset 0 2px 6px rgba(0,0,0,0.06), 4px 4px 0px #1a1a1a",
        width: 260,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>
        Hinta-arvio
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", color: "#1a1a1a" }}>
        3 500 <span style={{ fontSize: 16, fontWeight: 400 }}>&euro;/m&sup2;</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            padding: "4px 14px",
            background: "#FFDDD0",
            border: "3px solid #1a1a1a",
            borderRadius: 100,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Kerrostalo
        </span>
      </div>
    </div>
  );
}

function ClayMapButton() {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: "linear-gradient(180deg, #FF8A8A, #FF6B6B)",
        border: "3px solid #1a1a1a",
        borderRadius: 20,
        padding: "10px 24px",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        transform: pressed ? "translate(2px, 2px) scale(0.97)" : "translate(0, 0)",
        boxShadow: pressed
          ? "inset 0 3px 8px rgba(0,0,0,0.15)"
          : "inset 0 -2px 4px rgba(0,0,0,0.08), 4px 4px 0px #1a1a1a",
        transition: "all 0.2s ease-out",
        fontFamily: "'Fredoka', sans-serif",
        color: "#fff",
      }}
    >
      Katso hinta-arvio
    </button>
  );
}

// ─── Solution 3: Neon District ────────────────────────────────────

function NeonDistrictLogo({ size = 120 }: { size?: number }) {
  const blockSize = size * 0.3;
  const gap = size * 0.04;
  const sideH = blockSize * 0.35; // isometric side height

  const blocks = [
    { x: 0, y: sideH, fill: "#ffd8f4", side: "#e8b0d8", isAccent: false },
    { x: blockSize + gap, y: sideH, fill: "#FF1493", side: "#cc1076", isAccent: true },
    { x: 0, y: blockSize + gap + sideH, fill: "#ffd8f4", side: "#e8b0d8", isAccent: false },
    { x: blockSize + gap, y: blockSize + gap + sideH, fill: "#ffd8f4", side: "#e8b0d8", isAccent: false },
  ];

  const totalW = blockSize * 2 + gap + 12;
  const totalH = blockSize * 2 + gap + sideH + 12;

  return (
    <svg width={totalW} height={totalH} viewBox={`-4 -4 ${totalW + 8} ${totalH + 8}`}>
      <defs>
        <filter id="neonGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#FF1493" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {blocks.map((block, i) => (
        <g key={i} filter={block.isAccent ? "url(#neonGlow)" : undefined}>
          {/* Isometric side (bottom face) */}
          <polygon
            points={`
              ${block.x},${block.y + blockSize}
              ${block.x + blockSize},${block.y + blockSize}
              ${block.x + blockSize},${block.y + blockSize + sideH}
              ${block.x},${block.y + blockSize + sideH}
            `}
            fill={block.side}
            stroke="#1a1a1a"
            strokeWidth={2}
          />
          {/* Top face */}
          <rect
            x={block.x}
            y={block.y}
            width={blockSize}
            height={blockSize}
            rx={3}
            fill={block.fill}
            stroke="#1a1a1a"
            strokeWidth={2}
          />
          {/* Location dot on accent */}
          {block.isAccent && (
            <>
              <circle
                cx={block.x + blockSize * 0.6}
                cy={block.y + blockSize * 0.45}
                r={blockSize * 0.14}
                fill="#00E5FF"
                stroke="#1a1a1a"
                strokeWidth={1.5}
              />
              <circle
                cx={block.x + blockSize * 0.6}
                cy={block.y + blockSize * 0.45}
                r={blockSize * 0.06}
                fill="#fff"
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

function NeonDistrictCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#FAFAFA",
        border: "2px solid #1a1a1a",
        borderRadius: 10,
        padding: "20px 24px",
        boxShadow: hovered
          ? "4px 4px 0px #FF1493, 0 0 20px rgba(255,20,147,0.25)"
          : "4px 4px 0px #FF1493",
        width: 260,
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 4, fontFamily: "'Public Sans', sans-serif" }}>
        Hinta-arvio
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Lexend Mega', sans-serif", color: "#1a1a1a", letterSpacing: "-0.03em" }}>
        3 500 <span style={{ fontSize: 16, fontWeight: 500 }}>&euro;/m&sup2;</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            background: "#FF1493",
            border: "2px solid #1a1a1a",
            borderRadius: 100,
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          Kerrostalo
        </span>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            background: "#00E5FF",
            border: "2px solid #1a1a1a",
            borderRadius: 100,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Cyan
        </span>
      </div>
    </div>
  );
}

function NeonDistrictButton() {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        background: "#FF1493",
        border: "2px solid #1a1a1a",
        borderRadius: 10,
        padding: "10px 24px",
        fontWeight: 800,
        fontSize: 14,
        cursor: "pointer",
        color: "#fff",
        transform: pressed ? "translate(4px, 4px)" : "translate(0, 0)",
        boxShadow: pressed
          ? "none"
          : hovered
          ? "4px 4px 0px #1a1a1a, 0 0 16px rgba(255,20,147,0.4)"
          : "4px 4px 0px #1a1a1a",
        transition: "all 0.15s ease",
        fontFamily: "'Lexend Mega', sans-serif",
        letterSpacing: "-0.02em",
      }}
    >
      Katso hinta-arvio
    </button>
  );
}

// ─── Color Scale Preview ──────────────────────────────────────────

function ColorScale({ colors, label }: { colors: string[]; label: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 24, border: "2px solid #1a1a1a" }}>
        {colors.map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>
    </div>
  );
}

function ColorPalette({ colors }: { colors: { hex: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      {colors.map((c, i) => (
        <div key={i} style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: c.hex,
              border: "2px solid #1a1a1a",
              boxShadow: "2px 2px 0px rgba(0,0,0,0.15)",
            }}
          />
          <div style={{ fontSize: 9, color: "#999", marginTop: 3, fontFamily: "monospace" }}>{c.hex}</div>
          <div style={{ fontSize: 9, color: "#666", fontWeight: 600 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function DesignComparisonPage() {
  return (
    <>
      {/* Load all candidate fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@900&family=Public+Sans:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&family=Lexend+Mega:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          minHeight: "100vh",
          background: "#f4f4f4",
          padding: "40px 20px",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Title */}
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              fontFamily: "'Libre Franklin', sans-serif",
              textAlign: "center",
              marginBottom: 8,
              color: "#1a1a1a",
            }}
          >
            Neliöt — Design Comparison
          </h1>
          <p
            style={{
              textAlign: "center",
              color: "#666",
              fontSize: 16,
              marginBottom: 48,
            }}
          >
            3 directions for the UI refresh. Click buttons to feel the interactions.
          </p>

          {/* 3-column grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
          >
            {/* ═══ SOLUTION 1 ═══ */}
            <div
              style={{
                background: "#FFFBF5",
                border: "2px solid #1a1a1a",
                borderRadius: 16,
                padding: 32,
                boxShadow:
                  "1px 1px 0px #1a1a1a, 2px 2px 0px #2a2a2a, 3px 3px 0px #3a3a3a, 4px 4px 0px #4a4a4a",
              }}
            >
              <div
                style={{
                  background: "#FF90E8",
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 100,
                  border: "2px solid #1a1a1a",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                RECOMMENDED
              </div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  fontFamily: "'Libre Franklin', sans-serif",
                  marginBottom: 4,
                }}
              >
                1. Stacked Brutal
              </h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.5 }}>
                Multi-layer stacked shadows create 3D extruded building blocks. Each shadow layer = 1px offset. Accent block is &quot;taller&quot; (more layers).
              </p>

              {/* Logo */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Logo
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <StackedBrutalLogo size={100} />
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    fontFamily: "'Libre Franklin', sans-serif",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Neliöt
                </span>
              </div>

              {/* Fonts */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Fonts
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Libre Franklin', sans-serif", fontWeight: 900, fontSize: 20 }}>
                  Libre Franklin 900
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>display (keep)</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Public Sans', sans-serif", fontWeight: 400, fontSize: 16 }}>
                  Public Sans Regular
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>body (new)</span>
              </div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, fontSize: 16 }}>
                  IBM Plex Mono 500
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>data (keep)</span>
              </div>

              {/* Colors */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                Palette
              </div>
              <ColorPalette
                colors={[
                  { hex: "#FFFBF5", label: "cream" },
                  { hex: "#FF90E8", label: "pink" },
                  { hex: "#7C3AED", label: "violet" },
                  { hex: "#23C8A0", label: "mint" },
                  { hex: "#FFC900", label: "yellow" },
                ]}
              />

              {/* Map scale */}
              <ColorScale
                colors={["#a8e8d0", "#b0e4c0", "#c8e4a8", "#dce498", "#ecdca0", "#f0cca0", "#f0b8b0", "#eca8c0", "#e898c4", "#e088c0"]}
                label="Map price scale (no change)"
              />

              {/* Card */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8 }}>
                Card
              </div>
              <StackedBrutalCard />

              {/* Button */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8 }}>
                Button (click me!)
              </div>
              <StackedBrutalButton />
            </div>

            {/* ═══ SOLUTION 2 ═══ */}
            <div
              style={{
                background: "#FFF8F0",
                border: "3px solid #1a1a1a",
                borderRadius: 20,
                padding: 32,
                boxShadow:
                  "inset 0 2px 6px rgba(0,0,0,0.05), 4px 4px 0px #1a1a1a",
              }}
            >
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: "'Fredoka', sans-serif",
                  marginBottom: 4,
                }}
              >
                2. Clay Map
              </h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.5, fontFamily: "'Nunito', sans-serif" }}>
                Claymorphism hybrid — soft 3D via inner+outer shadows, gradient fills, rounder corners (20px). Warm, tactile, like a clay model.
              </p>

              {/* Logo */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'Nunito', sans-serif" }}>
                Logo
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <ClayMapLogo size={100} />
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontFamily: "'Fredoka', sans-serif",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Neliöt
                </span>
              </div>

              {/* Fonts */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'Nunito', sans-serif" }}>
                Fonts
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 20 }}>
                  Fredoka Bold
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>display (new)</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 400, fontSize: 16 }}>
                  Nunito Regular
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>body (new)</span>
              </div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, fontSize: 16 }}>
                  IBM Plex Mono 500
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>data (keep)</span>
              </div>

              {/* Colors */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>
                Palette
              </div>
              <ColorPalette
                colors={[
                  { hex: "#FFF8F0", label: "cream" },
                  { hex: "#FF6B6B", label: "coral" },
                  { hex: "#FFD93D", label: "gold" },
                  { hex: "#34D399", label: "sage" },
                  { hex: "#FDBCB4", label: "peach" },
                ]}
              />

              {/* Map scale */}
              <ColorScale
                colors={["#a8e8c8", "#b0e0b0", "#c8dca0", "#e0d898", "#e8cc98", "#f0b8a0", "#f0a098", "#e88888", "#e07070", "#d85858"]}
                label="Map price scale (sage → coral)"
              />

              {/* Card */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8, fontFamily: "'Nunito', sans-serif" }}>
                Card
              </div>
              <ClayMapCard />

              {/* Button */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8, fontFamily: "'Nunito', sans-serif" }}>
                Button (click me!)
              </div>
              <ClayMapButton />
            </div>

            {/* ═══ SOLUTION 3 ═══ */}
            <div
              style={{
                background: "#FAFAFA",
                border: "2px solid #1a1a1a",
                borderRadius: 10,
                padding: 32,
                boxShadow: "4px 4px 0px #FF1493",
              }}
            >
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  fontFamily: "'Lexend Mega', sans-serif",
                  marginBottom: 4,
                  letterSpacing: "-0.03em",
                }}
              >
                3. Neon District
              </h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.5, fontFamily: "'Public Sans', sans-serif" }}>
                Electric neobrutalism — accent-colored shadows, neon glow on hover, isometric 3D logo. Vivid, digital, high-energy.
              </p>

              {/* Logo */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'Public Sans', sans-serif" }}>
                Logo
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <NeonDistrictLogo size={110} />
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    fontFamily: "'Lexend Mega', sans-serif",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Neliöt
                </span>
              </div>

              {/* Fonts */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'Public Sans', sans-serif" }}>
                Fonts
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Lexend Mega', sans-serif", fontWeight: 900, fontSize: 18 }}>
                  Lexend Mega 900
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>display (new)</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Public Sans', sans-serif", fontWeight: 400, fontSize: 16 }}>
                  Public Sans Regular
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>body (new)</span>
              </div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 16 }}>
                  JetBrains Mono 500
                </span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>data (new)</span>
              </div>

              {/* Colors */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: "'Public Sans', sans-serif" }}>
                Palette
              </div>
              <ColorPalette
                colors={[
                  { hex: "#FAFAFA", label: "white" },
                  { hex: "#FF1493", label: "hot pink" },
                  { hex: "#00E5FF", label: "cyan" },
                  { hex: "#84FF57", label: "lime" },
                  { hex: "#1a1a1a", label: "black" },
                ]}
              />

              {/* Map scale */}
              <ColorScale
                colors={["#00E5FF", "#40D8E0", "#80D0B0", "#A0CC90", "#C8C860", "#E0C040", "#E8A030", "#F08028", "#F05050", "#FF1493"]}
                label="Map price scale (cyan → hot pink)"
              />

              {/* Card */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8, fontFamily: "'Public Sans', sans-serif" }}>
                Card (hover me!)
              </div>
              <NeonDistrictCard />

              {/* Button */}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 24, marginBottom: 8, fontFamily: "'Public Sans', sans-serif" }}>
                Button (hover + click!)
              </div>
              <NeonDistrictButton />
            </div>
          </div>

          {/* Key differences summary */}
          <div
            style={{
              marginTop: 40,
              background: "#fff",
              border: "2px solid #1a1a1a",
              borderRadius: 12,
              padding: 32,
              boxShadow: "3px 3px 0px #1a1a1a",
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 900,
                fontFamily: "'Libre Franklin', sans-serif",
                marginBottom: 16,
              }}
            >
              Key Differences
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #1a1a1a" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>Aspect</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>1. Stacked Brutal</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>2. Clay Map</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>3. Neon District</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["3D technique", "Stacked shadow layers", "Inner + outer shadows", "Isometric perspective + glow"],
                  ["Border radius", "12px (keep)", "20px (rounder)", "10px (sharper)"],
                  ["Border width", "2px (keep)", "3px (thicker)", "2px (keep)"],
                  ["Background", "#FFFBF5 cream", "#FFF8F0 warm cream", "#FAFAFA near-white"],
                  ["Primary color", "#FF90E8 pink (keep)", "#FF6B6B coral (new)", "#FF1493 hot pink (new)"],
                  ["Display font", "Libre Franklin (keep)", "Fredoka (new)", "Lexend Mega (new)"],
                  ["Body font", "Public Sans (new)", "Nunito (new)", "Public Sans (new)"],
                  ["Map palette", "No change", "Full recolor", "Full recolor"],
                  ["Code impact", "Low (token swaps)", "High (palette + fonts + radii)", "High (palette + fonts + logo)"],
                  ["Vibe", "Professional + bold", "Warm + playful", "Electric + vivid"],
                ].map(([label, ...vals], i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#1a1a1a" }}>{label}</td>
                    {vals.map((v, j) => (
                      <td key={j} style={{ padding: "8px 12px", color: "#555" }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

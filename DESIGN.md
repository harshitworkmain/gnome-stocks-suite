# Phase 2 Desktop Widget — Design System (DESIGN.md)

This document defines the design language, color palette, typography, and layout guidelines for the GNOME Stocks Desktop Widget (Phase 2). 

> **Important:** This file is intended to be used as a source of truth for **Stitch MCP** when generating the HTML/CSS/JS frontend components for the WebKit view.

## 1. Aesthetic Goal
**"Google Finance Beta" Dark Mode.**
The UI must feel highly sophisticated, professional, yet clean and beginner-friendly. It should prioritize readability of complex financial data using high-contrast text, smooth rounded cards, and absolute minimal clutter. 

## 2. Color Palette

Based on the Google Finance dark mode aesthetic:

### Backgrounds & Surfaces
- **App Background:** `#202124` (Deep dark gray/black)
- **Card/Container Surface:** `#303134` (Slightly lighter gray to elevate above background)
- **Search Bar / Input Fields:** `#414347` (Noticeably lighter than card surface)
- **Hover States:** `rgba(255, 255, 255, 0.04)` (Subtle white overlay)
- **Dividers / Borders:** `#3C4043`

### Text & Typography Colors
- **Primary Text:** `#E8EAED` (Off-white for high contrast but soft reading)
- **Secondary Text (Labels, timestamps):** `#9AA0A6` (Muted gray)
- **Disabled/Placeholder:** `#80868B`

### Brand & Status Indicators (Neon/Pastel for Dark Mode)
- **Positive (Bullish / Up):** `#81C995` (Soft neon green)
- **Negative (Bearish / Down):** `#F28B82` (Soft pastel red)
- **Brand Identity / Links:** `#8AB4F8` (Google pastel blue)
- **Focus Ring / Active state:** `#8AB4F8`

## 3. Typography

**Font Family:** `Roboto`, `Inter`, `Google Sans`, or system default sans-serif (e.g., `Cantarell` on GNOME).

### Sizing Scale
- **H1 (Main Ticker Price):** `32px` or `36px`, Font Weight: `400` or `500`
- **H2 (Section Headers, Ticker Symbol):** `20px` or `24px`, Font Weight: `500`
- **Body / Normal Text:** `14px`, Font Weight: `400`
- **Secondary / Captions / Micro-data:** `12px`, Font Weight: `400`

### Formatting Rules
- Market figures >999 must use comma separators (e.g., `23,002.15`).
- Prices must include currency symbols as a prefix (e.g., `$248.08`, `₹1,384.80`).
- Percentage changes must include arrows (▲/▼) and +/- sign (e.g., `+0.49% ▲`).

## 4. Tonal Depth & Surface Hierarchy (The "No-Line" Rule)
Traditional structural lines are replaced by a **Layering Principle** based on Stitch MCP's "Market Signal" design system. Explicit 1px solid borders are strictly forbidden for sectioning layout areas.
- **Base Layer:** `surface` (`#121316`) for the global background.
- **Sectional Layer:** `surface-container-low` (`#1a1b1e`) for side navigation.
- **Actionable Layer:** `surface-container` (`#1e2022`) for dashboard cards.
- **Prominent Layer:** `surface-container-high` (`#292a2d`) for active states.
- **Ghost Borders:** In high-density data tables, use `rgba(66, 71, 80, 0.15)` (felt, not seen).

## 5. UI Components (Phase 2 & Phase 3)

### 5.1 Widget Core Panels (Phase 2)
- **Search Bar:** Glassmorphism dropdown (`backdrop-filter: blur(20px)`), pill-shaped input.
- **Market Cards:** Colored top-highlight bars indicating green (▲) or red (▼).
- **Manage Portfolio:** Button with a signature lithographic gradient (`#b5cfff` to `#8ab4f8`).

### 5.2 Educational Chatbot UI (Phase 3)
- **Container:** Accessible via a "Market AI" FAB or dedicated sidebar tab. Slides in from the right over `surface-container-low`.
- **Message Bubbles:**
  - **User:** Primary gradient background, dark text (`#003061`), aligned right.
  - **AI:** `surface-container-highest` background, primary text (`#E8EAED`), aligned left.
- **Input Area:** `surface-container` fill with a `2px` bottom-stroke of `outline`. No 4-sided borders.

### 5.3 Beginner Mode Explanations (Phase 3)
- **Trigger:** Dashed underline (ghost border color) on financial metrics (e.g., P/E Ratio).
- **Popover:** Glassmorphism tooltip floating above the metric.
- **Shadows:** Floating elements must use a `24px` blur with 6% opacity (tinted with `on-surface`, not muddy black).

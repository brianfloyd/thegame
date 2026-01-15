# 🎨 DESIGN CANON: PHOSPHOR TERMINAL AESTHETIC

> **Design Philosophy:** *Old-school soul, modern execution. CRT nostalgia meets contemporary UX.*

This document establishes the canonical visual design language for The Game and related AI-powered applications. The aesthetic is called **Phosphor Terminal** — a retro-futuristic design system that evokes 1980s terminal interfaces while leveraging modern CSS capabilities for smooth, polished experiences.

---

## 🌑 CORE PALETTE

### Primary Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-void` | `#000000` | Terminal/console areas, deep backgrounds |
| `--bg-obsidian` | `#0a0a0a` | Editor surfaces, input fields |
| `--bg-charcoal` | `#1a1a1a` | Primary surfaces, cards, widgets |
| `--bg-slate` | `#111111` | Section containers, secondary surfaces |

### Phosphor Greens (Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--phosphor-bright` | `#00ff00` | Primary accent, active states, success |
| `--phosphor-glow` | `rgba(0, 255, 0, 0.5)` | Glow effects, shadows |
| `--phosphor-dim` | `#006600` | Subtle borders, inactive states |
| `--phosphor-subtle` | `#003300` | Hover backgrounds, selected states |
| `--phosphor-whisper` | `#002200` | Very subtle backgrounds |

### Terminal Cyans (Secondary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--cyan-bright` | `#00ffff` | Labels, links, info text |
| `--cyan-glow` | `rgba(0, 255, 255, 0.5)` | Info glows |
| `--cyan-dim` | `#006666` | Secondary borders |

### Alert Yellows (Emphasis)

| Token | Hex | Usage |
|-------|-----|-------|
| `--amber-bright` | `#ffff00` | Headings, important labels, gold accents |
| `--amber-glow` | `rgba(255, 255, 0, 0.5)` | Emphasis glows |
| `--amber-warm` | `#ffcc00` | Items, rewards, special highlights |

### Resonance Magentas (Special)

| Token | Hex | Usage |
|-------|-----|-------|
| `--magenta-bright` | `#ff00ff` | Private messages, special broadcasts |
| `--magenta-glow` | `rgba(255, 0, 255, 0.5)` | Ethereal effects |

### Factory Oranges (Industrial)

| Token | Hex | Usage |
|-------|-----|-------|
| `--factory-bright` | `#ff8800` | Factory widgets, NPC states, warnings |
| `--factory-glow` | `rgba(255, 136, 0, 0.6)` | Factory emphasis |
| `--factory-dim` | `#663300` | Factory borders |

### Danger Reds (Critical)

| Token | Hex | Usage |
|-------|-----|-------|
| `--danger-bright` | `#ff4444` | Errors, destructive actions |
| `--danger-soft` | `#ff6666` | Error text |
| `--danger-dim` | `#660000` | Danger backgrounds |
| `--danger-glow` | `rgba(255, 68, 68, 0.5)` | Critical shadows |

### Neutral Grays

| Token | Hex | Usage |
|-------|-----|-------|
| `--neutral-bright` | `#cccccc` | Headers, neutral text |
| `--neutral-dim` | `#888888` | Secondary text, disabled |
| `--neutral-dark` | `#666666` | Muted text |
| `--neutral-border` | `#333333` | Default borders |

---

## 🌈 LIGHT SCREEN MODE (Login/Registration)

For authentication and splash screens, we break from the terminal aesthetic to provide welcoming, modern contrast:

| Token | Hex | Usage |
|-------|-----|-------|
| `--light-bg` | `#ffffff` | Modal/card backgrounds |
| `--light-gradient-start` | `#667eea` | Purple-violet gradient start |
| `--light-gradient-end` | `#764ba2` | Purple-magenta gradient end |
| `--light-text` | `#333333` | Primary text on light |
| `--light-muted` | `#666666` | Secondary text on light |
| `--light-border` | `#dddddd` | Input borders |

```css
/* Light screen gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

---

## 📝 TYPOGRAPHY

### Font Stack

```css
/* Terminal / Game Interface */
font-family: 'Courier New', Consolas, 'Andale Mono', monospace;

/* Light Screens / Authentication */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
```

### Type Scale

| Element | Size | Weight | Transform | Tracking |
|---------|------|--------|-----------|----------|
| H1 (Title) | 2.5em | bold | — | — |
| H2 (Section) | 16px | bold | uppercase | 1px |
| H3 (Widget Header) | 0.85em | bold | uppercase | — |
| Body | 14px | normal | — | — |
| Small/Label | 11-12px | normal/bold | uppercase | 0.5px |
| Micro | 10px | normal | — | — |

### Text Colors by Context

```css
/* Primary content */
color: #00ff00;

/* Labels and metadata */
color: #00ffff;

/* Headings and emphasis */
color: #ffff00;

/* Muted/secondary */
color: #888888;

/* Error states */
color: #ff6666;
```

---

## 🪟 SURFACES & ELEVATION

### Terminal Container

```css
.terminal {
    background: #000000;
    border: 2px solid #00ff00;
    font-family: 'Courier New', monospace;
    color: #00ff00;
}
```

### Widget Cards

```css
.widget {
    background: #1a1a1a;
    border: 2px solid #00ff00;
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
}
```

### Elevation Layers

| Level | Shadow | Use Case |
|-------|--------|----------|
| 0 | none | Flat elements |
| 1 | `0 0 10px rgba(0, 255, 0, 0.3)` | Cards, widgets |
| 2 | `0 0 15px rgba(0, 255, 0, 0.5)` | Active/hover states |
| 3 | `0 20px 60px rgba(0, 0, 0, 0.3)` | Modals (light screens) |

---

## ✨ GLOW EFFECTS

The phosphor glow is the signature effect of this design system. Use sparingly for maximum impact.

### Text Glow (Animated)

```css
.glow-text {
    text-shadow: 
        0 0 5px currentColor,
        0 0 10px currentColor,
        0 0 15px currentColor,
        0 0 20px currentColor;
    animation: phosphor-pulse 2s ease-in-out 3;
}

@keyframes phosphor-pulse {
    0%, 100% {
        text-shadow: 
            0 0 5px currentColor,
            0 0 10px currentColor,
            0 0 15px currentColor;
        opacity: 1;
    }
    50% {
        text-shadow: 
            0 0 10px currentColor,
            0 0 20px currentColor,
            0 0 30px currentColor,
            0 0 40px currentColor;
        opacity: 0.9;
    }
}
```

### Border Glow (Hover/Focus)

```css
.glow-border:focus,
.glow-border:hover {
    border-color: #00ff00;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
}
```

### Inset Glow (Progress Bars)

```css
.progress-fill {
    background: linear-gradient(90deg, #00ff00, #00cc00);
    box-shadow: 0 0 8px #00ff00 inset;
}
```

---

## 🎛️ COMPONENT PATTERNS

### Buttons

#### Terminal Button (Primary)

```css
.btn-terminal {
    background: #1a1a1a;
    border: 2px solid #00ff00;
    color: #00ff00;
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    font-weight: bold;
    padding: 8px 16px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-terminal:hover {
    background: #003300;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    transform: translateY(-2px);
}

.btn-terminal:active {
    transform: translateY(0);
}

.btn-terminal:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
```

#### Light Mode Button (Auth Screens)

```css
.btn-auth {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    font-size: 1.1em;
    border-radius: 8px;
    font-weight: bold;
    transition: transform 0.2s, box-shadow 0.2s;
}

.btn-auth:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}
```

#### Danger Button

```css
.btn-danger {
    background: #330000;
    border: 2px solid #ff4444;
    color: #ff6666;
}

.btn-danger:hover {
    background: #440000;
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
}
```

### Inputs

```css
.input-terminal {
    background: #0a0a0a;
    border: 1px solid #333;
    color: #00ff00;
    font-family: 'Courier New', monospace;
    padding: 8px 12px;
    font-size: 12px;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.input-terminal:focus {
    outline: none;
    border-color: #00ff00;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
}

.input-terminal::placeholder {
    color: #666;
}
```

### Toggle Switch

```css
.toggle-switch {
    --toggle-width: 44px;
    --toggle-height: 22px;
    --toggle-knob-size: 16px;
}

.toggle-slider {
    width: var(--toggle-width);
    height: var(--toggle-height);
    background-color: rgba(0, 0, 0, 0.5);
    border: 2px solid #333;
    border-radius: var(--toggle-height);
    transition: all 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
    background-color: rgba(0, 255, 0, 0.2);
    border-color: #00ff00;
}
```

### Progress Bars

```css
.progress-container {
    width: 100%;
    height: 12px;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    transition: width 0.3s ease, background 0.3s ease;
}

/* Variants */
.progress-fill.standard { background: linear-gradient(90deg, #00ff00, #00cc00); }
.progress-fill.warning { background: linear-gradient(90deg, #ffaa00, #ffcc00); }
.progress-fill.danger { background: linear-gradient(90deg, #ff4444, #ff6666); }
.progress-fill.cooldown { background: linear-gradient(90deg, #ff6600, #ff9900); }
```

---

## 🎭 WIDGET THEMES

Widgets can take on different "personalities" while maintaining the core aesthetic:

### Standard (Green)
```css
.widget-theme-standard {
    border-color: #00ff00;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
}
```

### Factory (Orange)
```css
.widget-theme-factory {
    border-color: #ff8800;
    box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
    background: #0a0a0a;
}
```

### God Mode (Gold)
```css
.widget-theme-godmode {
    border-color: #ffcc00;
    box-shadow: 0 0 15px rgba(255, 204, 0, 0.5);
}
```

---

## 📜 SCROLLBARS

Custom scrollbars maintain the terminal aesthetic:

```css
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: #000;
}

::-webkit-scrollbar-thumb {
    background: #00ff00;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #00cc00;
}
```

---

## 🎬 MOTION & ANIMATION

### Timing Functions

```css
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Standard Durations

| Intent | Duration |
|--------|----------|
| Micro-interactions | 0.15s |
| Standard transitions | 0.2s |
| Complex animations | 0.3s |
| Dramatic effects | 0.5s+ |

### Common Animations

```css
/* Slide in from right (notifications) */
@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

/* Pulse glow (important items) */
@keyframes phosphor-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.9; }
}

/* Flash (alerts) */
@keyframes flash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}
```

---

## 📐 SPACING SCALE

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 20px;
--space-2xl: 30px;
--space-3xl: 40px;
```

### Border Radius

```css
--radius-sm: 2px;    /* Subtle rounding */
--radius-md: 4px;    /* Standard elements */
--radius-lg: 8px;    /* Cards, widgets */
--radius-xl: 16px;   /* Large modals */
--radius-full: 9999px; /* Pills, toggles */
```

---

## 🖼️ ICONOGRAPHY

### Style Guidelines

- Use simple, geometric shapes
- Prefer outlined/stroke style over filled
- Match phosphor green (#00ff00) for default state
- Use currentColor to inherit text color
- 20-24px for standard icons

### SVG Color Treatment

```css
.icon {
    fill: currentColor; /* Inherits text color */
    stroke: none;
}

.icon-outlined {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
}
```

---

## 🌐 RESPONSIVE BREAKPOINTS

```css
/* Mobile-first approach */
@media (max-width: 600px) {
    /* Collapse to single column */
}

@media (max-width: 800px) {
    /* Tablet adjustments */
}

@media (max-width: 1200px) {
    /* Desktop adjustments */
}
```

---

## ✅ ACCESSIBILITY NOTES

1. **Contrast Ratios**
   - Green on black: 15.3:1 ✓ (AAA)
   - Yellow on charcoal: 12.5:1 ✓ (AAA)
   - Cyan on black: 13.3:1 ✓ (AAA)

2. **Focus States**
   - Always use visible glow effects for focus
   - Never rely on color alone

3. **Motion Sensitivity**
   ```css
   @media (prefers-reduced-motion: reduce) {
       * {
           animation-duration: 0.01ms !important;
           animation-iteration-count: 1 !important;
           transition-duration: 0.01ms !important;
       }
   }
   ```

---

## 🎯 DESIGN PRINCIPLES

### 1. **Glow Responsibly**
The phosphor glow is powerful. Use it for:
- Focus states
- Important information
- Success confirmations
- Active/selected states

Never for:
- Body text
- Every button
- Decorative purposes only

### 2. **Monospace is Sacred**
Terminal interfaces MUST use monospace. Sans-serif is only for authentication/splash screens.

### 3. **Dark by Default**
This design system is built for dark mode. Light mode exists only for welcoming users before entering the terminal world.

### 4. **Color = Meaning**
- Green = Primary, success, active
- Cyan = Info, labels, links  
- Yellow = Emphasis, headings, warnings
- Orange = Factory/NPC states, alerts
- Magenta = Special communications
- Red = Errors, destructive actions

### 5. **Borders Define Space**
Unlike modern flat design, this aesthetic uses visible borders. They're part of the identity, not legacy.

---

## 📎 CSS VARIABLE TEMPLATE

```css
:root {
    /* Backgrounds */
    --bg-void: #000000;
    --bg-obsidian: #0a0a0a;
    --bg-charcoal: #1a1a1a;
    --bg-slate: #111111;
    
    /* Phosphor Greens */
    --phosphor-bright: #00ff00;
    --phosphor-glow: rgba(0, 255, 0, 0.5);
    --phosphor-dim: #006600;
    --phosphor-subtle: #003300;
    
    /* Cyans */
    --cyan-bright: #00ffff;
    --cyan-glow: rgba(0, 255, 255, 0.5);
    
    /* Ambers */
    --amber-bright: #ffff00;
    --amber-warm: #ffcc00;
    
    /* Magentas */
    --magenta-bright: #ff00ff;
    
    /* Factory Oranges */
    --factory-bright: #ff8800;
    --factory-glow: rgba(255, 136, 0, 0.6);
    
    /* Danger Reds */
    --danger-bright: #ff4444;
    --danger-soft: #ff6666;
    --danger-dim: #660000;
    
    /* Neutrals */
    --neutral-bright: #cccccc;
    --neutral-dim: #888888;
    --neutral-border: #333333;
    
    /* Light Mode */
    --light-gradient-start: #667eea;
    --light-gradient-end: #764ba2;
    
    /* Typography */
    --font-terminal: 'Courier New', Consolas, monospace;
    --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    
    /* Spacing */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 20px;
    
    /* Radii */
    --radius-sm: 2px;
    --radius-md: 4px;
    --radius-lg: 8px;
}
```

---

## 🔮 APPLYING TO NEW AI PRODUCTS

When building new AI-powered applications with this aesthetic:

1. **Terminal Chat Interface** - Use the void background with phosphor green responses
2. **AI Processing States** - Use pulsing glow animations during inference
3. **Success/Error States** - Green glow for success, red for errors
4. **Code Blocks** - Already perfect in this aesthetic
5. **Data Visualizations** - Limit to palette colors with glow accents
6. **Loading States** - Animated phosphor pulse or classic cursor blink

---

*This design canon ensures visual consistency across all applications while celebrating the timeless beauty of the terminal aesthetic—now with modern polish.*

**Classification:** 🟢 CANON APPLY (Reference Document)

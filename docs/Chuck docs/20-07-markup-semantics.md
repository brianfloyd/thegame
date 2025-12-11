# 17A – Markup Semantics

*All markup syntax is escaped using backslashes to prevent accidental rendering.*

---

## 1. Overview
The **Markup System** provides a universal text-styling language used throughout the game—NPC dialogue, system messages, terminal output, comms, widgets, and editors. It turns plain text with markup conventions into styled HTML with color, glow, animation, and special effects.

This section defines **canonical semantics only**:
- Core built-in conventions
- Custom conventions
- Formatting rules
- Processing order (semantic, not architectural)
- Effects

> **17B** (separate document) will cover **architecture, routing, Alpine.js integration, and client/server parsing pipelines.**

---

## 2. Built-In Markup Conventions (Canonical)
The game ships with **three permanent built-in conventions**. These conventions:
- Cannot have their logic changed
- Can have their display syntax edited (syntax field only)
- Always apply the same semantics

All examples below use backslashes to escape markup.

### 2.1 Angle Brackets – Keywords & Focus Terms
**Syntax:** `\<text\>`

**Effects:**
- Color: **keyword color** (NPC or system-defined, usually magenta \#ff00ff)
- Glow: **true**

**Intended Uses:**
- NPC names
- Important nouns
- Puzzle keywords
- Harvestable creature names

**Example:**
```
You begin harvesting the \<Pulse Beetle\>.
```

---

### 2.2 Square Brackets – Subtle Emphasis
**Syntax:** `\[text\]`

**Effects:**
- Color: **inherit** (keeps parent color)
- Glow: **true** (soft glow)

**Intended Uses:**
- Atmospheric emphasis
- Echoes of lore
- Narrative tone-setting

**Example:**
```
A whisper rises... \[just beyond hearing\].
```

---

### 2.3 Exclamation Marks – Alerts & Warnings
**Syntax:** `\!text\!`

**Effects:**
- Color: **red** (\#ff0000)
- Glow: **true**

**Intended Uses:**
- Warnings
- Danger
- Urgency indicators

**Example:**
```
\!Vitalis critically low\!
```

---

## 3. Typewriter Effect
The typewriter system is a special wrapper applied **before** standard markup parsing.

**Syntax:**
```
\{\{typewriter:delay\}\}text\{\{/typewriter\}\}
```
Where **delay** = ms per character.

**Behavior:**
- Text inside typewriter is parsed for normal markup after extraction
- The effect animates text character-by-character
- HTML tags inside are typed as atomic units

**Example:**
```
\{\{typewriter:50\}\}Welcome...\{\{/typewriter\}\}
```

---

## 4. Custom Markup Conventions
Custom conventions are stored in the **markup_conventions** table and allow game designers or ZORK to introduce new syntaxes.

### 4.1 Structure of Custom Conventions
Each convention defines:
- **syntax** – Human-friendly syntax form (display only)
- **opening** – Raw opening token (e.g., `**`)
- **closing** – Raw closing token (e.g., `**`)
- **color** – Hex, keyword, or inherit
- **effects** – JSON describing styling
- **example** – Shown in reference modal
- **description** – What this convention is for

### 4.2 Allowed Effects
Effects are stored in JSON (effects column). Supported:

- `glow: true`
- `bold: true`
- `italic: true`
- `flash: true`
- `pulse: true` (3-phase pulse)
- `fontSize: "1.2em"`
- `typewriter: true`
- `typewriterDelay: 75`

### 4.3 Nesting Support
Nesting is fully supported. Examples with escapes:
```
\!Danger: \<Core Node\> destabilizing\!
```

The parser processes longest patterns first to preserve correct nesting.

---

## 5. Built-In Convention Edits
The **markup_builtin_edits** table allows editing the **syntax** and **example** for built-ins.

You **cannot** modify:
- Opening token
- Closing token
- Color
- Effects
- Semantic behavior

This protects canonical consistency across the game.

---

## 6. Processing Rules (Semantic Layer)
This describes the conceptual order in which markup semantics apply. Implementation details live in **17B**.

1. **Extract typewriter blocks** (protect inner content)
2. **Process custom conventions** (sorted longest to shortest)
3. **Process built-in conventions**
4. **Escape HTML** to prevent XSS
5. **Convert placeholders into styled `<span>` elements**
6. **Apply line-start patterns** (for conventions like `^` if defined)
7. **Convert line breaks** (`\n` → `<br>`)
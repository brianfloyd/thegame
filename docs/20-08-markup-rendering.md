# 17B – Rendering Architecture & Integration
*All markup syntax examples are escaped using backslashes to prevent accidental parsing.*

---

# 1. Rendering Pipeline (Client)
The client is the **primary renderer** of markup. It converts raw text + markup syntax into styled HTML elements and animates effects such as glow, pulse, and typewriter.

All client rendering flows through:
```
parseMarkup(text, keywordColor)
initializeTypewriterEffects(element)
```

### 1.1 Client Processing Steps (Canonical)
The client follows a fixed pipeline:

1. **Extract typewriter blocks** 
   - Syntax: `\\{\\{typewriter:delay\\}\\}text\\{\\{/typewriter\\}\\}`
   - Temporarily replaced with placeholder IDs

2. **Process custom conventions**
   - Loaded from `markup_conventions`
   - Processed longest-opening-token → shortest for proper nesting
   - All conventions (including `< >`, `[]`, `! !`) are treated as custom conventions

3. **Escape HTML** (XSS protection)
   - Raw `<`, `>`, `&`, etc. are safely encoded
   - Markup placeholders are preserved

4. **Replace placeholders with `<span>` elements**
   - Span includes: `style`, `class`, and effect attributes

5. **Process line-start conventions**
   - Example: `^` (if custom-defined)

6. **Convert line breaks**
   - `\\n` → `<br>`

7. **Initialize typewriter effects**
   - After innerHTML insertion: `initializeTypewriterEffects(element)`

### 1.2 Where Client Parsing Occurs
Client-side rendering is used by:
- Terminal window
- NPC talk messages
- Player talk/resonate/telepath messages
- Room description rendering
- NPC status/UI readouts
- Comms widget (talk/resonate/telepath history)

### 1.3 Important: Alpine.js does **not** parse markup by itself
When markup is inserted via Alpine's `x-html`, the developer must:
```
element.innerHTML = parseMarkup(text, color);
initializeTypewriterEffects(element);
```
Otherwise typewriter blocks will display raw instead of animating.

---

# 2. Rendering Pipeline (Server)
The server provides **optional** markup rendering for terminal-only system messages or places where HTML output is desired before reaching the client.

Server rendering uses:
```
formatMessageForTerminal(text, type, keywordColor)
```

### 2.1 Server Processing Steps
Server follows the same semantic rules as the client:
- Typewriter extraction
- Custom conventions (all conventions, including `< >`, `[]`, `! !`, are treated as custom)
- HTML escaping
- Placeholder conversion
- Line-start processing
- Line break conversion

Differences:
- Server output is *final HTML* (no animations applied)
- Server never runs `initializeTypewriterEffects()`

### 2.2 Where Server Rendering Occurs
- System messages (player enter/leave, errors)
- Debug/ticket editor terminal output
- Certain NPC/system-generated text sequences

### 2.3 Server Never Renders:
- Player talk
- Telepath messages
- Room descriptions
- LoreKeeper puzzle interactions

These always render in the client.

---

# 3. Alpine.js Integration Rules
Alpine is used lightly and **must not bypass markup parsing rules**.

### 3.1 Safe Pattern (Required)
```html
<div x-html="render(text)"></div>
```
Where `render(text)` is:
```js
render(text) {
    const html = window.parseMarkup(text || '', '#00ffff');
    // use nextTick or mutation observer to run typewriter after insertion
    this.$nextTick(() => initializeTypewriterEffects(this.$el));
    return html;
}
```

### 3.2 Unsafe Pattern (Forbidden)
```html
<div x-html="text"></div>
```
This will:
- expose raw markup
- fail to escape HTML properly
- break nested effects

### 3.3 Alpine-only Markup Considerations
- Alpine’s `x-text` must **never** be used for text that contains markup
- `x-show` and `x-if` do not affect markup safety

---

# 4. Component System Integration
Most rendering happens inside custom Component classes, not Alpine.

### 4.1 Terminal Component
File: `public/js/widgets/Terminal.js`

Uses:
```
import { parseMarkup } from '../utils/Markup.js';
...
terminalLine.innerHTML = parseMarkup(text, '#00ffff');
initializeTypewriterEffects(terminalLine);
```

### 4.2 CommsWidget Component
Handles:
- talk
- resonate
- telepath
- loreKeeperMessage

Each message is passed through:
```
msgDiv.innerHTML = parseMarkup(message, color);
initializeTypewriterEffects(msgDiv);
```

### 4.3 NPC / Room Rendering Components
Room descriptions, NPC indicators, exit lists all follow:
```
innerHTML = parseMarkup(text, roomColor);
```

This ensures consistency across all content.

---

# 5. Message Router Integration
Message routing dictates **where markup is allowed**.

### 5.1 Messages That Support Markup
| Message Type | Markup Allowed | Notes |
|--------------|----------------|-------|
| talk | Yes | Rendered via CommsWidget |
| resonate | Yes | World broadcast |
| telepath | Yes | Direct 1-to-1 PM |
| loreKeeperMessage | Yes | Puzzle/clue formatting |
| systemMessage | Yes | Server may pre-render |
| terminal message | Yes | Animations allowed |

### 5.2 Messages That MUST Stay Plain
| Message Type | Notes |
|--------------|-------|
| Movement outputs | Colorized but not markup aware |
| Harvest result messages | Inserted raw (no markup support yet) |
| Factory/crafting outputs | May receive markup support later |

### 5.3 Router Flow (Canonical)
1. Client receives JSON message
2. Router dispatches to correct handler
3. Handler calls `parseMarkup()`
4. Handler inserts HTML
5. Typewriter initializes

---

# 6. Universal Usage Patterns
This defines the **required contract** for every subsystem.

### 6.1 ALWAYS parse before display
```
const html = parseMarkup(rawText, color);
element.innerHTML = html;
initializeTypewriterEffects(element);
```

### 6.2 NEVER render raw markup without parsing
Bad:
```
element.innerHTML = rawText;
```

### 6.3 Editors Store Raw Text Only
Editors must **never** store HTML.
They store:
- raw markup syntax
- unescaped characters

Parsing only happens during rendering.

### 6.4 Keyword Color Rules
| Context | Color Passed to Parser |
|---------|------------------------|
| NPC message | npcColor |
| LoreKeeper | keywordColor |
| Terminal text | \#00ffff |
| Talk/resonate/telepath | \#00ffff |

---

# 7. Typewriter Initialization Requirements
Typewriter is **not automatic**.
It must be initialized after markup is injected.

### 7.1 Canonical Contract
```
container.innerHTML = parseMarkup(text, color);
initializeTypewriterEffects(container);
```

### 7.2 Must Occur After DOM Update
In Alpine:
```
this.$nextTick(() => initializeTypewriterEffects(this.$el));
```

In Components:
- Always call after setting innerHTML

---

# 8. Edge Cases & Correct Rendering Behavior
### 8.1 Nested Markup
Supported:
```
\\!Warning: \\<Core Node\\> destabilizing\\!
```

### 8.2 Typewriter with Nested Markup
Example:
```
\\{\\{typewriter:60\\}\\}System: \\<Boot Sequence\\> Initializing...\\{\\{/typewriter\\}\\}
```
Behavior:
- text typed char-by-char
- markup applied *before* animation

### 8.3 Unknown Syntax
Unknown syntax is treated as plain text and safely escaped.

### 8.4 Broken or Unmatched Tags
Examples like:
```
\\<test
[test
!alert
```
Are rendered safely as plain escaped text.

### 8.5 HTML Safety
Markup engine escapes HTML **before** inserting spans.
Safe:
```
\\<script>alert('x')\\<\\/script>
```
Displays literally, not executed.

### 8.6 Large Documents
Markup parser handles:
- thousands of characters
- deeply nested sequences
- multi-line inputs

Performance remains stable via placeholder + regex batching.

---

# END OF 17B — Rendering Architecture & Integration
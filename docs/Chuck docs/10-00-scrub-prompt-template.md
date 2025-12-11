

# ✅ **CURSOR: Canonical Spec Scrub Prompt**

**Analyze the actual codebase and answer the following questions STRICTLY based on what is explicitly implemented in code.**

**Do NOT infer, assume, hallucinate, or extrapolate features that are not directly validated by code.**

If any answer cannot be directly confirmed from reading the code, respond with:

> **"Not found in codebase."**

When providing file references, include:
- file name
- line numbers
- function names or blocks
- SQL migrations when relevant

Your output must be:
- Exhaustive
- Code‑linked
- Precise
- Neutral (no assumptions)
- Fully grounded in the codebase

---
**IMPORTANT RULE CURSOR MUST FOLLOW**
When finished write entire repopnse to a file.md in  /docs/Chuck\ docs and title appropriate  but start title with 999- as they are reference specs not the cannonical library refrence we are building. 
Cursor is in ASK mode but user will APPROVE cursor to write file
---

# 🔍 **SCRUB STEPS YOU MUST FOLLOW**

## **Step 1 — Identify the Single Source of Truth**
- Which database tables define this subsystem?
- Which fields are required, optional, constrained, or defaulted?
- Which migrations alter this subsystem?

## **Step 2 — Enumerate All Read/Write Operations**
For every function that interacts with the subsystem, identify:
- Read patterns
- Write patterns
- Validation logic
- Update atomicity (transactional or not)
- Missing validations
- Branching or special cases

## **Step 3 — Identify All Subsystems That Touch This One**
List all cross‑dependencies:
- Game handlers
- Editors
- NPC engine
- Factory engine
- Automation engine
- Broadcast/serialization layer
- Server session state

## **Step 4 — Extract Invariants & Behavioral Rules**
Document all rules that **must always be true**, based solely on code.
If a rule is not enforced anywhere, explicitly state:
> “Invariant NOT enforced in code.”

## **Step 5 — Identify Failure States & Recovery Paths**
- All reasons operations can fail
- All error messages emitted
- States that cause desync
- Missing or partial failure handling

## **Step 6 — Identify Serialization Paths**
Detail:
- What data is sent to the client
- What data is omitted
- Where formatting differences exist
- Any mismatches between server model and UI expectations

## **Step 7 — Identify Missing or Partial Implementations**
Anything referenced but not implemented must be listed.
Examples: cooldowns, buffs, inventory capacity, use-item system.

---

# 🧩 **OUTPUT STRUCTURE (MANDATORY)**
Your final output should use this exact structure:

```
1. <Subsystem> Schema / Source of Truth
2. All fields, defaults, nullability, constraints
3. All subsystem operations (read/write/mutate)
4. Validations + Missing Validations
5. Behavioral rules / invariants
6. State transitions (with file references)
7. Interactions with other systems
8. Failure states and messages
9. Serialization paths
10. Known gaps, missing features, or TODOs
11. Summary of strengths, weaknesses, risks
```

Each section must:
- Cite specific files & line numbers
- Reflect exactly what the code does
- Not speculate

---

# 📌 **RESPONSE REQUIREMENTS**
Cursor must:
- Provide **only facts proven in code**
- Cite every finding with file paths + lines
- Avoid incorrect assumptions
- Explicitly call out missing or incomplete implementations

---

# 🧪 **TEST FOR COMPLIANCE BEFORE RESPONDING**
Cursor should internally verify:
- "Did I infer anything?" → If yes, remove it.
- "Can I point to the exact file + line?" → If no, answer "Not found in codebase."

---

# ✔️ **END OF PROMPT**


# 🧠 CURSOR GOVERNANCE RULES

### Canon-First, Growth-Aware, Drift-Resistant

> **Mission:**
> Cursor exists to **extend, maintain, and protect canon** while allowing **explicit, intentional evolution**.
> Cursor must never invent canon — but must never block growth either.

**🚨 CRITICAL: Cursor MUST IGNORE `/docs/Chuck docs/` when referencing canon. Only numbered documents in `docs/` root (00-XX, 10-XX, 20-XX, 30-XX, 50-XX) are canonical. Documents in `/docs/Chuck docs/` are reference materials (999-*) and are NOT canonical sources.**

---

## 🔴 VISUAL DRIFT CUE (MANDATORY)

Every Cursor response MUST internally classify its actions using **exactly one** of the following markers:

### 🟢 CANON APPLY

* Applying existing canon
* Normalizing docs to known standards
* Implementing behavior already defined
* Filling gaps where canon already exists

→ Safe to execute immediately

---
## 🧠 Canon Creation & Update Flow (MANDATORY)

**CRITICAL: Cursor MUST ignore `/docs/Chuck docs/` when referencing canon. Documents in `/docs/Chuck docs/` are reference materials (999-*) and are NOT canonical sources of truth.**

Cursor must follow this sequence exactly:

1. **Consult existing canon** (via **`00-01-INDEX.MD`** for document catalog, or this README for governance)
   - **ONLY reference documents in `docs/` root (numbered: 00-XX, 10-XX, 20-XX, 30-XX, 50-XX)**
   - **NEVER reference documents in `/docs/Chuck docs/` as canon**
   - Use **`00-01-INDEX.MD`** to find relevant canonical documents by domain or topic
2. If canon exists → apply or propose changes
3. If canon is missing or unclear:
   - Use **01-00-scrub-prompt-template.md**
   - Produce a `999-` reference document in `/docs/Chuck docs/`
4. Canon may ONLY be created or updated using:
   - **01-01-scrub-add-cannon-template.md**
5. No other process may introduce canonical rules
---

### 🟡 CANON PROPOSE

* Suggesting a *new* rule, pattern, or invariant
* Recommending architectural changes
* Identifying a missing abstraction
* Proposing canon expansion

→ **DO NOT APPLY**
→ Present as a proposal only

---

### 🔴 CANON BLOCK

* Action would invent behavior
* Action would contradict existing canon
* Action would mix document intent (gameplay ↔ architecture)
* Action would silently redefine invariants

→ Stop and explain why

---

## 🧭 CANON DECISION LADDER (HOW CURSOR THINKS)

Cursor MUST follow this ladder **top to bottom**:

1. **Is this already defined in canon?**

   * Yes → 🟢 CANON APPLY
   * No → continue

2. **Did the user explicitly instruct a change to canon?**

   * Yes → 🟡 CANON PROPOSE (wait for approval)
   * No → continue

3. **Would this improve clarity, safety, or scalability?**

   * Yes → 🟡 CANON PROPOSE
   * No → 🔴 CANON BLOCK

Cursor must NEVER skip steps.

---

## 🧭 PLAN / ASK MODE ENTRY RULE (NEW – MANDATORY)

When Cursor is operating in **PLAN mode** or **ASK mode**, the **very first step** in the response MUST be:

> **“Checking canon for relevance…”**

Cursor must then:

1. Consult **`00-01-INDEX.MD`** to identify relevant canonical documents
2. Explicitly list **which canonical documents are relevant** to the request
3. State **whether existing canon fully covers the request, partially covers it, or does not cover it at all**
4. Only after this check may Cursor:

   * Apply canon (🟢)
   * Propose canon changes (🟡)
   * Block the action (🔴)

If no relevant canon exists, Cursor must state:

> **“No applicable canon found — proposal required.”**

This rule exists to ensure **canon awareness precedes action**, not the other way around.

---

## 📚 DOCUMENT INTENT GUARDRAILS

Each document has ONE intent:

* **Gameplay Canon** → rules, mechanics, player/NPC behavior
* **Architecture Canon** → systems, boundaries, runtime responsibilities
* **Schema Canon** → tables, fields, constraints, migrations
* **Reference (999-)** → analysis, findings, non-authoritative notes

### Rules:

* Never mix intents
* Never “helpfully” move content across intents
* If a change belongs elsewhere → flag it, don’t migrate it

---

## ✍️ CANON UPDATE FLOW (CONTROLLED GROWTH)

When the user says things like:

* “we should probably…”
* “I think this needs…”
* “let’s change how…”

Cursor MUST:

1. Restate the proposed canon change
2. Classify it as 🟡 CANON PROPOSE
3. Identify:

   * Which canon docs are affected
   * Which invariants change (if any)
4. WAIT for explicit approval before updating canon

Once approved:

* Update canon cleanly
* Scrub surrounding docs for alignment
* No partial or silent updates

---

## 🧹 CONTINUOUS CANON HYGIENE

After any approved canon change, Cursor must:

* Re-scan affected documents
* Flag outdated or conflicting sections
* Propose cleanup in 🟡 CANON PROPOSE mode
* Never auto-fix silently

Canon grows **clean or not at all**.

---

## 🧪 ANTI-SPAGHETTI RULES

Cursor must NEVER:

* Add exceptions without documenting invariants
* Introduce “special cases” without justification
* Create parallel patterns solving the same problem
* Encode rules in prose that belong in schema or code

If forced into any of the above:
→ 🔴 CANON BLOCK + explanation

---

## 🧰 MCP TOOLING RULES (NEW – MANDATORY)

Cursor has access to a defined set of MCP tools intended to **support disciplined development, testing, and debugging**.

### ✅ ALLOWED MCP TOOL CATEGORIES

#### 🔌 Connection & Session Tools

* `test_connect`
* `test_disconnect`
* `test_get_session_state`

Use these to:

* Verify server availability
* Validate session lifecycle assumptions
* Confirm clean startup / teardown states

---

#### 🎮 Gameplay & World State Validation

* `test_send_command`
* `test_wait_for_message`
* `test_get_message_history`
* `test_verify_player_stats`
* `test_verify_room_state`
* `test_verify_inventory`
* `test_verify_message_received`

Use these to:

* Validate gameplay canon against runtime behavior
* Prove invariants through execution, not assumption
* Confirm serialization correctness

---

#### 🧱 Test Data & World Setup

* `test_setup_player`
* `test_setup_npc`
* `test_setup_item`
* `test_cleanup`

Use these to:

* Create controlled, repeatable test scenarios
* Avoid polluting long-lived game state
* Ensure tests are isolated and deterministic

---

#### 🗄️ SQL & Persistence Inspection

* `sql_query`
* `sql_execute`
* `sql_get_tables`
* `sql_get_player`
* `sql_get_npcs`
* `sql_get_rooms`
* `sql_get_items`
* `sql_update_player_stat`
* `sql_get_form_configs`

Use these to:

* Inspect schema reality
* Validate data invariants
* Confirm migrations and defaults

SQL tools are **read-first** unless explicitly instructed otherwise by the user.

---

#### 🐞 Debug & Work Tracking

* `debug_start_session`
* `debug_end_session`
* `debug_add_todo`
* `debug_list_todos`
* `debug_get_todo`
* `debug_update_todo`
* `debug_get_session`
* `work_tickets_start`
* `work_tickets_check`
* `work_tickets_update`
* `auto_tickets_check`

Use these to:

* Track investigation scope
* Prevent lost context
* Keep development work auditable and intentional

---

### 🚫 FORBIDDEN MCP TOOLS (STRICT)

The following MCP tools are **explicitly DISABLED at this time**:

* `knowledge_search`
* `knowledge_list`
* `knowledge_get`
* `knowledge_add`
* `knowledge_update`
* `knowledge_delete`

Cursor MUST NOT:

* Read from knowledge MCP
* Write to knowledge MCP
* Suggest using knowledge MCP

If knowledge persistence is required:
→ 🟡 CANON PROPOSE only
→ Wait for explicit user approval

---

## 🧠 MCP USAGE PRINCIPLES

* MCP tools exist to **prove truth**, not invent it
* Prefer execution evidence over reasoning alone
* Use MCP to validate canon, not redefine it
* Never allow MCP side effects without approval

---

## 🗂️ FILE & WRITE RULES

**CRITICAL RULE: Cursor MUST IGNORE `/docs/Chuck docs/` when referencing canon.**

* Canon docs live in their canonical locations (`docs/` root, numbered: 00-XX, 10-XX, 20-XX, 30-XX, 50-XX)
* Reference docs MUST:

  * Start with `999-`
  * Live in `/docs/Chuck docs/`
  * **NEVER be cited as source of truth**
  * **NEVER be treated as canonical specifications**
  * **MUST be ignored when determining canonical rules or specifications**

**File Structure:** Cursor MUST follow **`20-00-file-structure-canonical.md`** when creating, moving, or organizing files. This document defines:
  * Directory structure and purpose
  * File naming conventions
  * Archive policies and organization
  * Documentation organization rules
  * Root directory cleanup rules

Cursor remains in **ASK mode** until explicitly approved.

---

## 🧠 PRIME DIRECTIVE (NON-NEGOTIABLE)

> **Scrubs (01-00) produce evidence.**
> **Canon (01-01) produces law.**
> **Governance rules decide when each is allowed.**

> **Cursor exists to make the system more legible over time.**
> If an action increases ambiguity, drift, or silent complexity — it is wrong.

---

## 🧪 FINAL SELF-CHECK (REQUIRED)

Before responding, Cursor must ask internally:

* Did I invent anything?
* Did I blur document intent?
* Did I apply canon without approval?
* Did I misuse MCP tools?
* Did I miss a chance to validate with MCP?

If yes → stop and correct.

---

# ✔️ END OF RULES

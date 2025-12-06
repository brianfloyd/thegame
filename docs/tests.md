Testing Checklist
Pulse Echo Progression System
Basic Functionality
[ ] Harvest an NPC successfully — verify pulse echoes are awarded
[ ] Check pulse echo message appears: "You feel the pulse resonate. +X Pulse Echoes gained. (Total: Y)"
[ ] Verify pulse echoes increment in Stats Widget under "Progression" section
[ ] Run pulse echo (or pe, p) command — verify table shows correct echoes and tier
[ ] Harvest multiple times — verify echoes accumulate correctly
Tier Progression
[ ] Accumulate enough echoes to reach tier 2 — verify tier-up message appears
[ ] Verify tier increases in Stats Widget
[ ] Verify tier increases in pulse echo command output
[ ] Test multi-tier progression (if enough echoes for multiple tiers at once)
NPC-Specific Yield
[ ] Edit an NPC in NPC Editor — verify "Pulse Echo Yield" field exists
[ ] Set different NPCs to different yield values (e.g., 1, 5, 10)
[ ] Harvest NPCs with different yields — verify higher yield NPCs give more echoes
[ ] Verify yield field saves correctly in NPC editor
Resonance Bonus
[ ] Test with low resonance (5) — verify base echo yield
[ ] Test with high resonance (50+) — verify resonance bonus increases yield
[ ] Verify formula configs in NPC Editor → Global Formulas for pulse echo formulas
Edge Cases
[ ] Harvest miss — verify no pulse echoes awarded
[ ] Vitalis depletion during harvest — verify no echoes awarded
[ ] Harvest during cooldown/grace period — verify no echoes awarded
[ ] Encumbrance causing item drop to ground — verify echoes still awarded (harvest was successful)
Attunement Feature Upgrade
Basic Attunement
[ ] Use attune command — verify typewriter effect message appears
[ ] Verify message format: "You kneel and attune to the pulse beneath your feet. Your Vitalis surges. (X / Y)"
[ ] Wait for delay — verify Vitalis actually increases after the delay period
[ ] Check cooldown — try to attune again immediately, verify cooldown message
Formula-Based Calculations
[ ] Test with low Resonance (5) — verify longer cooldown
[ ] Test with high Resonance (50+) — verify shorter cooldown
[ ] Test with low Fortitude (5) — verify less Vitalis restored
[ ] Test with high Fortitude (50+) — verify more Vitalis restored
[ ] Test delay reduction — verify delay is shorter with higher Resonance + Fortitude average
Player Editor Settings
[ ] Open Player Editor — verify "Attunement Settings" section exists
[ ] Verify three fields: "Base Points", "Cooldown (ms)", "Delay (ms)"
[ ] Modify base values — verify they save correctly
[ ] Test attunement with modified base values — verify new values are used
[ ] Click "Edit Global Formulas" button — verify formula config modal opens (if implemented)
Global Formula Configs
[ ] In NPC Editor → Global Formulas — verify 3 attunement formulas exist:
attunement_cooldown_reduction
attunement_restore_bonus
attunement_delay_reduction
[ ] Modify formula values — verify changes affect attunement behavior
UI/Display Elements
Stats Widget
[ ] Verify "Progression" section appears in player stats widget
[ ] Verify "Pulse Echoes: X" displays with cyan color (#00ffff)
[ ] Verify "Echo Tier: Y" displays with magenta color (#ff00ff)
[ ] Harvest and verify stats update in real-time without page refresh
Typewriter Effect
[ ] Verify attunement message types out character-by-character
[ ] Verify nested markup (if any) works within typewriter effect
[ ] Test with different delay values (if configurable)
Database Persistence
Player Stats
[ ] Harvest to gain pulse echoes — log out and back in — verify echoes persist
[ ] Gain a tier — log out and back in — verify tier persists
[ ] Use attunement — verify last_attune_time updates correctly
NPC Settings
[ ] Set NPC pulse_echo_yield to custom value — restart server — verify value persists
Integration Tests
Combined Systems
[ ] Harvest → gain pulse echoes → use attune → verify both systems work together
[ ] Verify Vitalis drain still works correctly during harvest (should not be affected)
[ ] Verify harvest messages still display correctly alongside pulse echo messages
Command Testing
[ ] Test all pulse echo command aliases: pulse echo, pulseecho, pulse, pe, p
[ ] Verify command output format matches other commands (like who, inventory)
Performance & Edge Cases
[ ] Rapid harvesting — verify no race conditions with pulse echo updates
[ ] Multiple players harvesting simultaneously — verify atomic updates work
[ ] Very high echo counts (1000+) — verify display formatting (commas, etc.)
[ ] Very high tier (10+) — verify tier progression still calculates correctly
Quick Test Script
Harvest an NPC 5 times → check pulse echoes increment
Use pe command → verify display
Use attune → verify typewriter message and Vitalis increase
Check Stats Widget → verify Progression section shows correct values
Edit NPC → set pulse_echo_yield to 5 → harvest → verify more echoes
Edit Player → modify attunement base values → attune → verify new values used
All core functionality should be working. Report any issues you find.
# Aura Off — Codex Task Runner

Use one task at a time.
Do not combine tasks unless explicitly noted.
Always read AGENTS.md and docs before making changes.

---

## Working rule
Only work on one task at a time.
Do not expand scope beyond the selected task.
If a future improvement is discovered, note it separately instead of implementing it immediately.

---

## TASK 1 — Controls Polish

Read AGENTS.md and docs before making changes.

Improve the control feel and input responsiveness for Aura Off.

Focus on:
- making movement feel responsive and precise
- making charging feel intentional and slightly risky
- making release feel instant and satisfying
- reducing frustration through input forgiveness

Required changes:

1. Movement
- ensure responsive acceleration and deceleration
- prevent sliding or floaty movement
- normalize diagonal movement
- slightly smooth direction changes if helpful

2. Charging
- holding charge should slightly reduce movement speed
- charging should feel immediate
- charging should feel slightly weighty without becoming sluggish

3. Release
- release should trigger instantly with no noticeable delay
- optionally add a very short movement lock for impact feel

4. Break
- add a short control interruption on break
- ensure break feels like a clear interruption

5. Input forgiveness
- add a small buffer or grace window where helpful
- prevent missed inputs from tight timing windows
- make release timing feel fair, not brittle

Constraints:
- do not add new gameplay systems
- do not change core mechanics
- keep the code modular and clean
- avoid overengineering

After implementation:
- summarize files changed
- list tuning values for movement, charge slowdown, and timing
- provide manual test steps

---

## TASK 2 — Stage Presence and Attention

Read AGENTS.md and docs before making changes.

Improve the sense of stage presence and attention in the current top-down view.

Focus on:
- making the player feel like the center of attention
- making NPCs feel like a reacting audience
- making high-aura states feel more intense and focused
- making break and release feel like public moments

Add:
- subtle camera zoom based on aura
- stronger aura visual scaling
- NPC attention behavior such as turning, clustering, or pausing
- slight vignette or edge darkening during high tension
- stronger release spacing change in the crowd

Do not change:
- camera perspective
- core architecture
- gameplay systems

Goal:
make the current view feel dramatic and socially tense without adding complexity

After implementation:
- summarize files changed
- explain what improved
- list tuning knobs
- provide manual test steps

---

## TASK 3 — Feel and Clarity Pass

Read AGENTS.md and docs before making changes.

Polish the current Aura Off vertical slice without expanding scope much.

Focus on improving:
- charging tension
- break readability
- release payoff
- NPC reaction clarity
- HUD readability
- fast replay feel

Required improvements:
1. Charging feedback
- make charging visually stronger
- make aura tiers more readable
- make high-pressure charging feel dangerous

2. Break feedback
- add a clearer unstable warning before break
- make break feel public, funny, and readable
- add stronger visual feedback for breaking

3. Release payoff
- make strong release feel much bigger than weak release
- improve shockwave, crowd reaction, and camera feedback
- add lightweight juice like screen shake or hit stop where appropriate

4. NPC readability
- make NPC glance/facing behavior clearer
- make step-back behavior more obvious
- make reactions to strong release and visible break more dramatic

5. HUD clarity
- improve aura and pressure readability
- improve state and callout readability without clutter
- keep the HUD minimal

Rules:
- do not add multiplayer
- do not add backend
- do not add session lore
- do not add chaos hazards yet
- do not overengineer
- keep the code modular and clean

After implementation:
- summarize files changed
- explain what improved in feel/readability
- list tuning knobs
- provide manual test steps

---

## TASK 4 — Fair Hazard Pass

Read AGENTS.md and docs before making changes.

Implement the first fair hazard system addition for Aura Off.

Goals:
- make the aura loop more tense and replayable
- preserve readability
- avoid chaos overload
- keep the implementation modular and configurable

Required implementation:
- add one fair hazard: Noise Pulse or Spotlight
- add telegraph / readable warning
- integrate hazard effects with pressure and break systems
- ensure the hazard affects positioning or timing in a meaningful way
- centralize tuning values in hazard config

Constraints:
- do not add chaos hazards yet
- do not add multiplayer
- do not add multiple hazards in this pass
- keep architecture clean and easy to extend

After implementation:
- summarize files changed
- explain hazard architecture changes
- list tuning knobs
- provide manual test steps

---

## TASK 5 — Rare Chaos Hazard

Read AGENTS.md and docs before making changes.

Add one rare chaos hazard to Aura Off.

Target hazard:
- Launch Pad / Catapult, or another equally dramatic rare chaos event

Goals:
- create occasional story-worthy funny moments
- keep chaos rare and readable
- avoid turning the game into random nonsense

Requirements:
- the hazard must have a telegraph or recognizable cue
- the hazard must be visually dramatic
- the hazard must be rare
- the hazard must not dominate round outcomes
- integrate with existing hazard architecture cleanly

Constraints:
- do not add multiple chaos hazards
- do not add multiplayer
- do not add session lore yet
- keep the code modular

After implementation:
- summarize files changed
- list probability/cooldown tuning knobs
- provide manual test steps
- explain how chaos frequency is controlled

---

## TASK 6 — Multiplayer Readiness Refactor

Read AGENTS.md and docs before making changes.

Refactor Aura Off only where necessary to make future lightweight multiplayer easier, without adding actual networking yet.

Goals:
- preserve the current single-player build
- improve separation between gameplay state and presentation
- make core aura, pressure, break, and release state easier to synchronize later
- define shared multiplayer contracts in a dedicated location
- keep the architecture lightweight and understandable

Do not add:
- server code
- networking libraries
- room logic
- persistence
- accounts
- matchmaking

After coding:
- summarize architectural changes
- explain why they help future multiplayer
- confirm single-player still works
- provide manual test steps

---

## TASK 7 — Private Room Multiplayer

Read AGENTS.md and docs before making changes.

Add a minimal private-room multiplayer mode to Aura Off.

Constraints:
- browser client remains primary
- multiplayer scope must stay very small
- optimize for friend-group sessions
- backend should be Railway-friendly
- do not rewrite the whole project

Target mode:
- 2 to 4 players
- room code or invite link
- one short round mode
- instant rematch flow
- win condition: highest aura at round end or last unbroken player

Networking scope:
- sync player movement
- sync charge state
- sync aura state
- sync break/release states
- sync round timer/state
- keep NPC/hazard behavior simple and deterministic where possible

Do not add:
- public lobbies
- matchmaking
- persistence
- progression
- cosmetics
- accounts

Implementation requirements:
- explain authoritative boundaries clearly
- keep client-side presentation decoupled from server-owned game state
- keep protocol definitions explicit and typed
- provide clear local run instructions for both client and server
- provide Railway deployment instructions

After coding:
- summarize files changed
- explain server vs client responsibilities
- provide local multiplayer test steps
- provide Railway setup steps

---

## TASK 8 — Session Lore / Callback Humor

Read AGENTS.md and docs before making changes.

Add a lightweight session-lore system to Aura Off that creates callback humor across rounds without becoming intrusive or overly text-heavy.

Goals:
- track a small set of funny gameplay-relevant session stats
- surface them in short end-of-round summaries or labels
- keep the humor dry, brief, and readable
- support future extension without overbuilding

Good examples of tracked stats:
- broke first
- highest peak aura
- released too early
- almost had it
- ruined someone else's moment
- survived longest under pressure

Do not add:
- AI generation
- permanent user profiles
- account-based history
- creepy personal memory
- excessive text spam during gameplay

Requirements:
- keep lore session-scoped
- make the system easy to disable
- centralize title/summary generation logic
- preserve existing gameplay clarity

After coding:
- summarize files changed
- list tracked session stats
- show how summaries/titles are produced
- provide manual test steps
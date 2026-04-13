# Hazard System Spec

## Goal
Hazards exist to make the aura loop more tense, readable, funny, and replayable.

Hazards should support three roles:
1. core pressure
2. social chaos
3. rare story moments

Hazards should not overwhelm the core skill loop.

---

## Hazard Design Principles

### 1. Hazards must serve the core loop
A hazard should affect:
- pressure
- positioning
- timing
- break risk
- release opportunity

If a hazard does not create an interesting choice, it is probably not useful.

### 2. Hazards should be readable
Players should usually understand:
- what is happening
- where the danger is
- how it affects charging
- when it starts and ends

### 3. Rare chaos is allowed
Some hazards can be mildly unfair if they are:
- rare
- dramatic
- funny
- not constant
- not the only deciding factor

### 4. Hazards should be categorized
Use separate categories so tuning stays clean.

---

## Hazard Categories

## A. Core Pressure Hazards
These are the main predictable hazards that support the skill loop.

Examples:
- noise pulse
- spotlight
- shrinking comfort zone
- crowd compression wave

Role:
- increase pressure
- encourage movement/timing decisions
- make charging more interesting

Frequency:
- common

Fairness:
- mostly fair and readable

---

## B. Social Sabotage Hazards
These are player-triggered or player-influenced later in multiplayer.

Examples:
- taunt burst near another player
- pressure spike beacon
- attention bait
- local shove pulse

Role:
- give players ways to interfere
- create clutch/funny denial moments

Frequency:
- moderate

Fairness:
- should feel intentional, not random

---

## C. Chaos Hazards
These are the rare "what just happened" moments.

Examples:
- launch pad / catapult
- random crowd stampede
- spotlight betrayal
- freak stage pulse
- sudden panic surge

Role:
- create story moments
- add humor and unpredictability
- keep matches memorable

Frequency:
- low

Fairness:
- slightly unfair is acceptable if rare and funny

---

## Hazard Scheduling Rules

### Base rule
The game should always have:
- a stable core pressure environment
- optional scheduled hazard pulses
- only occasional chaos hazards

### Recommended weighting by round
- core pressure hazards: frequent
- sabotage hazards: later in multiplayer
- chaos hazards: rare

### Example round composition
In a 60-second round:
- 2 to 4 core hazard events
- 0 to 2 sabotage events per player later
- 0 to 1 chaos event normally
- very small chance of 2 chaos events for funny outlier rounds

### Important rule
If chaos hazards occur too often, the game becomes exhausting and stupid.
Keep them rare enough to feel like stories.

---

## Hazard Lifecycle

Every hazard should support these phases:
1. telegraph
2. active
3. resolution
4. cooldown/cleanup

### Telegraph
Players should be warned visually, and optionally with audio/UI.

### Active
The hazard applies its effect.

### Resolution
The hazard ends with a readable fade or impact result.

### Cooldown
The system prevents immediate repetition unless explicitly allowed.

---

## Base Hazard Interface

Each hazard should define:
- id
- category
- weight
- cooldown
- telegraphDuration
- activeDuration
- intensity
- areaOfEffect
- targeting rules
- fairness rating
- rareEvent flag
- effect application logic
- visual/audio hooks

Suggested responsibilities:
- describe what the hazard does
- expose configuration
- apply gameplay consequences
- trigger FX hooks

---

## Suggested Hazard Types

```ts
export type HazardCategory = "core_pressure" | "social_sabotage" | "chaos";

export interface HazardConfig {
  id: string;
  category: HazardCategory;
  weight: number;
  cooldownMs: number;
  telegraphMs: number;
  activeMs: number;
  intensity: number;
  rareEvent: boolean;
  canTargetLeadingPlayer: boolean;
  canTargetRandomPlayer: boolean;
  canAffectArenaZone: boolean;
}

export interface HazardContext {
  elapsedRoundMs: number;
  alivePlayers: string[];
  leadingPlayerId?: string;
  rngSeed?: string;
}

export interface HazardResult {
  pressureDelta?: number;
  auraDelta?: number;
  forcedMovement?: { x: number; y: number };
  stunnedMs?: number;
  launchImpulse?: { x: number; y: number };
  calloutText?: string;
}


Core hazard list:

```md
---

## Core Hazard Designs

## 1. Noise Pulse
### Category
core_pressure

### Description
A visible ring or sound wave expands across part or all of the arena.
Players caught while charging gain pressure sharply.

### Gameplay effect
- increases pressure
- may briefly destabilize near-break players
- rewards timing and positioning

### Why it works
Simple, readable, fair.

### Required visuals
- telegraph ring
- expanding wave
- small pressure hit flash

### Required audio hooks
- warning chirp
- pulse burst

---

## 2. Spotlight
### Category
core_pressure

### Description
A cone or circle briefly locks onto an area or player and makes charging there riskier.

### Gameplay effect
- increased attention pressure
- crowd reacts faster
- higher aura gain possible if endured
- greater break risk

### Why it works
Feels social and dramatic.

### Required visuals
- spotlight cone/circle
- visible tracking or lock
- crowd attention flare

---

## 3. Crowd Surge
### Category
core_pressure or chaos-lite depending on tuning

### Description
The crowd shifts in one direction, compressing space and forcing repositioning.

### Gameplay effect
- pushes players
- changes nearby NPC pressure density
- may interrupt ideal charge positioning

### Why it works
Makes the arena feel alive and socially hostile.

### Required visuals
- directional crowd lean
- motion lanes
- floor arrows or push lines if needed

---

## 4. Center Pressure Zone
### Category
core_pressure passive

### Description
The center of the arena always provides higher pressure and faster aura gain.

### Gameplay effect
- edge is safer/slower
- center is riskier/faster

### Why it works
Makes positioning strategic with minimal complexity.

### Required visuals
- subtle center floor treatment
- pressure shimmer or marker

---

## Chaos Hazard Designs

## 5. Launch Pad / Catapult
### Category
chaos

### Description
A rare arena event launches a player unexpectedly, often at a terrible time.

### Gameplay effect
- forced reposition
- interrupts charging
- can increase embarrassment/fumble chance
- may occasionally create a comeback or miracle release setup

### Fairness note
This is intentionally a bit unfair.
It must be rare enough to stay funny.

### Required rule
Do not allow it to happen too often.
A player being hit multiple times in one session is funny.
A player being hit constantly is bad design.

### Recommended use
- low probability
- strong telegraph or absurd cue
- dramatic animation and sound

### Required visuals
- launch telegraph
- launch arc trail
- landing burst

---

## 6. Panic Wave
### Category
chaos

### Description
A sudden panic spreads through the crowd, causing erratic NPC movement and pressure spikes.

### Gameplay effect
- NPC pressure becomes unstable
- local movement lanes become messy
- one player's perfect setup may collapse

### Why it works
Funny and dramatic without always being fatal.

### Required visuals
- crowd ripple
- panic particles
- quick motion burst

---

## 7. Betrayal Spotlight
### Category
chaos

### Description
A spotlight chooses the worst possible moment to expose a player who looked safe.

### Gameplay effect
- sudden attention spike
- faster pressure gain
- possible break if already unstable

### Why it works
Feels targeted in a funny way.

### Required rule
Use sparingly.

---

## 8. Arena Snap
### Category
chaos

### Description
A weird pulse shakes the arena and mildly disrupts everyone.

### Gameplay effect
- brief wobble or forced interruption
- not always catastrophic
- can create chain-reaction laughs

### Why it works
Shared chaos is easier to accept than personal random punishment.

---

## Hazard Tuning Rules

## Core Rules
- predictable hazards should drive the gameplay backbone
- chaos hazards should provide memorable spikes, not define every round
- hazards should not fully replace player sabotage later

## Frequency Guidance
### Single-player prototype
- use 1 to 2 hazard types at first
- mostly predictable hazards
- optionally 1 rare chaos hazard disabled by default until core loop works

### Multiplayer early
- 2 to 3 core hazards
- 1 sabotage interaction type
- 1 chaos hazard with low weight

## Cooldown Guidance
Chaos hazards need longer cooldowns than core hazards.

## Anti-frustration Rules
- avoid full hard-CC too often
- avoid unavoidable instant-loss hazards
- avoid overlapping too many strong hazards at once
- avoid targeting the same player too frequently unless done intentionally as a very rare funny outlier

## Fairness Rule
A little unfairness is allowed when:
- the event is rare
- the event is highly readable
- the event is funny to witnesses
- the event does not erase all skill across the whole game

---

## Hazard Scheduler Guidance

Use weighted random selection with:
- category caps
- recent-history suppression
- cooldown checks
- round-phase logic

### Example scheduler rules
- no duplicate chaos hazard back-to-back
- no more than 1 major chaos hazard active at a time
- increase hazard intensity slightly later in round
- optionally bias one funny outlier round every few matches

### Suggested controls
- maxConcurrentHazards
- chaosHazardBaseChance
- repeatedTargetProtection
- roundTimeIntensityScale
- leadingPlayerTargetBias
- underdogMercyBias

### Important note
Leading-player bias can be funny, but too much rubber-banding feels cheap.
Keep it mild.

---

## Hazard Testing Checklist

For each hazard:
- [ ] telegraph is readable
- [ ] effect is understandable
- [ ] effect changes gameplay decisions
- [ ] visuals clearly communicate state
- [ ] audio hooks exist or are stubbed
- [ ] cooldown works
- [ ] scheduler does not spam it
- [ ] frustration is acceptable in repeated tests
- [ ] funny value is noticeable in multiplayer observation later

## Test questions
- Did the hazard create tension?
- Did it create a funny story?
- Was it too common?
- Did it erase player agency too often?
- Did it make the match better or just noisier?
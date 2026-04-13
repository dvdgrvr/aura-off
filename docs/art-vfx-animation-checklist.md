# Art / VFX / Animation Asset Checklist

## Goal
Use simple, readable, replaceable assets that support:
- strong silhouettes
- comedic overreaction
- readable aura states
- fast implementation
- easy future replacement

This project should not depend on polished art early.
The first version should be expressive, not beautiful.

---

## Visual Style Direction

### Recommended style
- minimalist 2D
- simple geometric or low-detail stylized characters
- readable contrast
- bold aura shapes
- exaggerated reaction poses
- strong screen-space feedback
- effects-driven readability

### Do not prioritize
- realistic art
- detailed character rendering
- complex sprite sheets
- large environment tile pipelines
- heavy cinematic art production

---

## Asset Priority Tiers

### Tier 1 - Required for first playable
These assets are needed to make the prototype understandable and fun.

#### Player visuals
- [ ] player base sprite or shape
- [ ] player outline or shadow
- [ ] charge pose variant or charge scale effect
- [ ] unstable/break warning visual
- [ ] release pose / release burst anchor

#### NPC visuals
- [ ] 1 base NPC sprite/shape
- [ ] 3 to 5 simple NPC variants
- [ ] glance/head-turn indicator
- [ ] step-back / recoil pose
- [ ] panic/freeze pose
- [ ] blown-back pose or motion treatment

#### Arena visuals
- [ ] arena floor/background
- [ ] edge boundary treatment
- [ ] center-zone emphasis
- [ ] hazard telegraph markers
- [ ] simple environmental props if needed for depth

#### UI visuals
- [ ] aura bar
- [ ] pressure / break danger bar
- [ ] round timer
- [ ] restart prompt
- [ ] short callout text styling
- [ ] round summary card layout

#### Core VFX
- [ ] aura charge ring
- [ ] aura pulse
- [ ] unstable wobble / flicker
- [ ] break burst
- [ ] release shockwave
- [ ] NPC reaction burst
- [ ] hit spark / pressure spike flash
- [ ] hazard telegraph effect

---

### Tier 2 - Strongly recommended for polish
These are not required for the first build, but add a lot of feel.

#### Player polish
- [ ] idle confidence motion
- [ ] movement lean
- [ ] minor breathing pulse
- [ ] aura tier color/shape differences
- [ ] release recovery transition

#### NPC polish
- [ ] subtle idle sways
- [ ] attention shift animation
- [ ] crowd bunching motion
- [ ] stumble animation
- [ ] exaggerated fear/recoil movement

#### Arena polish
- [ ] subtle floor pulse under high aura
- [ ] ambient particles
- [ ] background crowd energy hints
- [ ] light flicker or distortion near major release
- [ ] hazard-specific world reactions

#### UI polish
- [ ] aura tier label
- [ ] end-of-round mini badges
- [ ] pressure danger vignette
- [ ] pulse effect on important callouts
- [ ] spectator-friendly state indicator

#### VFX polish
- [ ] layered shockwave
- [ ] directional dust streaks
- [ ] radial line burst
- [ ] subtle time-distortion feedback
- [ ] crowd panic burst particles
- [ ] spotlight cone / noise ring visuals
- [ ] launch trail for chaos hazards

---

### Tier 3 - Future enhancements
These are optional later.

#### Character identity
- [ ] lightweight accessories or silhouettes to distinguish players
- [ ] alternate player archetype visuals
- [ ] custom aura signatures
- [ ] title / label visual treatments

#### Session lore visuals
- [ ] round-end callback title cards
- [ ] crowd memory icon
- [ ] "fraud concerns" / "crowd remembers" style micro-badges
- [ ] small portrait panel for room summary later

#### Multiplayer spectacle
- [ ] clearer remote player effect layers
- [ ] win-state banner
- [ ] room-ready lobby visuals
- [ ] shared arena event spectacle

---

## Asset Breakdown by Category

## 1. Character Assets

### Player
The player must be instantly readable in motion and during charging.
Detailed art is not necessary.

#### Required pieces
- [ ] base body shape
- [ ] facing direction treatment
- [ ] shadow ellipse
- [ ] charge visual overlay
- [ ] unstable state overlay
- [ ] break overlay
- [ ] release anchor point for effects

#### Nice-to-have
- [ ] simple arm/torso pose shift while charging
- [ ] subtle scale-up during higher aura
- [ ] posture change by aura tier

### NPCs
NPCs exist to sell pressure and reaction.

#### Required pieces
- [ ] neutral NPC base
- [ ] at least 3 visual variants using:
  - shape
  - color
  - accessory
  - body size
- [ ] readable glance direction
- [ ] back-away / recoil state
- [ ] panic / freeze state

#### Nice-to-have
- [ ] bobbing idle
- [ ] exaggerated group recoil
- [ ] crowd compression visual treatment

---

## 2. Arena Assets

### Required
- [ ] single arena background
- [ ] center-zone marker or floor variation
- [ ] boundary collision representation
- [ ] hazard telegraph decals
- [ ] optional wall/fence/edge accents
- [ ] optional crowd lane or attention ring

### Nice-to-have
- [ ] subtle parallax background
- [ ] floor cracks or stress marks triggered by high aura
- [ ] dynamic light pulse near climax moments

---

## 3. UI Assets

### Required
- [ ] aura bar frame
- [ ] aura fill treatment
- [ ] pressure frame
- [ ] pressure danger fill
- [ ] round timer display
- [ ] short callout text style
- [ ] round-end summary panel
- [ ] restart prompt

### Nice-to-have
- [ ] aura tier badge
- [ ] hazard warning icon
- [ ] session lore tag cards
- [ ] player mini-state markers for multiplayer later

---

## 4. VFX Assets

### Aura charge VFX
- [ ] base aura glow
- [ ] low-tier aura ring
- [ ] mid-tier aura pulse
- [ ] high-tier layered aura ring
- [ ] charge sparks
- [ ] local dust / floor response
- [ ] screen-space pulse on threshold increases

### Break VFX
- [ ] unstable jitter
- [ ] warning flicker
- [ ] tension spike flash
- [ ] break pop / collapse burst
- [ ] small embarrassment burst or fumble cloud
- [ ] crowd reaction flash

### Release VFX
- [ ] radial shockwave
- [ ] emission burst
- [ ] impact ring
- [ ] crowd knockback burst
- [ ] edge distortion or fake chromatic effect if lightweight
- [ ] release afterglow

### Hazard VFX
- [ ] hazard warning flash
- [ ] telegraph zone pulse
- [ ] activation burst
- [ ] expiration fade
- [ ] hazard-specific particles

---

## 5. Audio Hook Checklist
Real sound assets are not required at first, but hooks should exist.

### Charge hooks
- [ ] charge start
- [ ] charge loop low
- [ ] charge loop high
- [ ] unstable warning pulse

### Break hooks
- [ ] warning tick
- [ ] break burst
- [ ] brief humiliation/fumble sting

### Release hooks
- [ ] weak release
- [ ] strong release
- [ ] max release climax

### Crowd hooks
- [ ] crowd murmur low
- [ ] crowd notice swell
- [ ] crowd recoil gasp
- [ ] crowd panic flare

### Hazard hooks
- [ ] hazard telegraph
- [ ] hazard trigger
- [ ] hazard resolve

---

## Animation Checklist

## Core Animation Priority
If time is limited, prioritize:
1. charge-up readability
2. break readability
3. release payoff
4. NPC reaction readability
5. hazard telegraph readability

---

## Player Animation Set

### Required
- [ ] idle
- [ ] move
- [ ] charge start
- [ ] charging hold
- [ ] unstable charging
- [ ] break/fumble
- [ ] release
- [ ] short recovery

### Nice-to-have
- [ ] turn-in-place
- [ ] micro pose shifts by aura tier
- [ ] confidence posture ramp
- [ ] shaky composure animation before breaking

---

## NPC Animation Set

### Required
- [ ] idle wander
- [ ] glance
- [ ] watch / stare
- [ ] step back
- [ ] freeze
- [ ] panic / flee
- [ ] blown back

### Nice-to-have
- [ ] stumble
- [ ] chain reaction recoil
- [ ] crowd compression response
- [ ] synchronized head-turn moments

---

## Hazard Animation Set

### Required
- [ ] telegraph start
- [ ] active state loop
- [ ] impact/trigger
- [ ] fade/end

### Nice-to-have
- [ ] anticipation squash/stretch
- [ ] environment response
- [ ] player hit reaction alignment
- [ ] crowd response sync

---

## Camera / Screen Feedback Checklist

### Required
- [ ] slight zoom during charge
- [ ] stronger zoom near high aura
- [ ] screen shake on break
- [ ] larger shake on strong release
- [ ] hit stop on peak release
- [ ] mild danger vignette or equivalent

### Nice-to-have
- [ ] slow time pulse on near-break threshold
- [ ] camera recoil after chaos hazard
- [ ] focus emphasis when the room "notices"

---

## Art Pipeline Rule
All early assets should be:
- easy to replace
- named clearly
- centralized in a manifest/config
- not deeply coupled to logic

Do not build a heavy art pipeline before the game is fun.
## Prompt — add placeholder art / VFX / animation pass
Read AGENTS.md and docs before making changes.

Implement a lightweight placeholder art, VFX, and animation pass for Aura Off that improves readability and game feel without creating a heavy asset pipeline.

Goals:
- improve silhouette clarity
- improve aura readability
- improve NPC reaction readability
- improve break/release spectacle
- keep all assets easy to replace later

Requirements:
- use simple geometric or minimal placeholder visuals
- centralize asset references in an asset manifest where helpful
- add clear effects for:
  - charging
  - unstable/break warning
  - break
  - release
  - hazard telegraphs
- improve NPC readability for:
  - glance
  - back away
  - panic/freeze/blown back
- keep the implementation lightweight and modular

Do not add:
- a large art production pipeline
- complex sprite systems unless necessary
- unnecessary dependencies
- polished final art expectations

After coding:
- summarize files changed
- list placeholder assets/effects added
- explain what is easy to replace later
- provide manual test steps

## Prompt - add hazard system cleanly
Read AGENTS.md and docs before making changes.

Implement the first clean hazard system for Aura Off.

Goals:
- make the aura loop more tense and replayable
- keep hazards modular and configurable
- support both predictable pressure hazards and rare chaos hazards
- preserve readability

Required implementation:
- hazard categories
- base hazard contract or interface
- hazard controller
- hazard scheduler with cooldowns and weighted selection
- at least 2 hazards:
  1. one core pressure hazard
  2. one optional rare chaos hazard
- visual telegraph for hazards
- integration with pressure/break systems
- clear tuning values in config

Recommended first hazards:
- Noise Pulse
- Launch Pad or Spotlight

Rules:
- hazards must not dominate every round
- chaos hazards must be rare
- no repeated chaos spam
- keep implementation modular and easy to extend

After coding:
- summarize files changed
- explain hazard architecture
- list tuning knobs
- provide manual test steps
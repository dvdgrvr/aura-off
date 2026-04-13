# Architecture

## Goals
- fast iteration
- clear modular boundaries
- future multiplayer support
- easy tuning
- low mess

## Core layers

### Config
Centralized tuning values and feature flags.

### Core
Shared types, utilities, event contracts, math, random helpers.

### State / Models
Pure or mostly pure gameplay state containers:
- aura
- pressure
- score
- session lore
- run state

### Entities
Domain objects and local behavior wrappers:
- player
- NPCs
- hazards

### Systems
Rules that transform state:
- aura gain
- pressure accumulation
- breaking
- release payoff
- NPC reactions
- round flow

### Presentation
Phaser scenes, UI widgets, camera effects, particles, sound hooks.

## Important rule
Do not bury all gameplay rules inside `ArenaScene.ts`.

## Multiplayer readiness principle
Systems should be written so the important gameplay state can later be driven by authoritative server updates with minimal rewriting.# aura-off

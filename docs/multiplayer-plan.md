# Multiplayer Plan

## Goal
Support private-room browser multiplayer with minimal scope.

## Target
- 2 to 4 players
- one room code
- one short round mode
- instant rematch

## Join flow
- player creates room
- game returns room code and/or shareable link
- friends join by code or link
- host starts round

## Server-authoritative later
The server should later own:
- round timer
- player aura state
- pressure state if shared
- break/release decisions
- winner

The client should own:
- local feedback
- interpolation
- camera
- particles
- HUD

## Sync only essentials
- position
- charge state
- aura tier/value
- break status
- release event
- round state

## Anti-scope
Do not add:
- persistence
- accounts
- public lobbies
- ranked play
- cosmetics
- social systems beyond room join
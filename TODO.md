
# TODO — ecology.click

## Milestone A (Vertical Slice)
- [ ] Grid placement: place/remove buildings on a tile grid
- [ ] Power network v0: hydraulics (boolean on/off; powered by Power Cube)
- [ ] Crafting v0: CEB Press turns (soil+water) → (brick) over time when powered
- [ ] Inventory v0: global stash (move to per-entity later)
- [ ] Save/load to localStorage
- [ ] Basic UI: hotbar for buildings, simple tooltips
- [ ] Simple art pass (CC0 placeholder tiles)

## Milestone B (OSE Core Loop)
- [ ] Power network v1: GPM/PSI simplified flow propagation
- [ ] LifeTrac (tractor) unit + A* pathfinding for hauling jobs
- [ ] Torch Table crafting chain → frames/parts
- [ ] Soil quality & moisture mini-micro (affects brick quality)
- [ ] Blueprint viewer with attribution (CC-BY-SA for OSE sources)
- [ ] Tiled map pipeline (JSON import, collision layer → blockers)

## Milestone C (Quality of Life)
- [ ] IndexedDB save format + versioning
- [ ] Settings for Simulation Depth (Arcade / Standard / OSE-Sim)
- [ ] Keyboard remaps & zoomable camera
- [ ] Pause/fast-forward ticks

## Milestone D (Static-first Integrations)
- [ ] PWA: offline play via service worker (VitePWA plugin)
- [ ] IPFS share for user-built blueprints/maps (no server needed)
- [ ] Optional web3: viem/ethers wallet connect and on-chain blueprint hashes

## Stretch / Later
- [ ] Co-op multiplayer server (authoritative sim; Colyseus or custom WS)
- [ ] Leaderboards/cloud saves (requires a backend)
- [ ] OpenPnP/PCB milling as late-game microfactory modules

## Reference: initial machines (data-driven)
- [x] Power Cube (producer: hydraulics)
- [x] CEB Press (consumer: hydraulics; recipe soil+water → brick)

## Dev ergonomics
- [ ] Prettier + ESLint configs
- [ ] Unit tests (Vitest) for systems
- [ ] GitHub Action: lint/test on PRs

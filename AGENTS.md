
# AGENTS — ecology.click

This project is designed to be **AI-assist friendly** (Cursor/Copilot/etc.).
Use this document to orient code-generating agents.

## Principles
1. **Keep it static-host compatible.** No backend assumptions.
2. **Prefer small, composable modules** over frameworks-within-frameworks.
3. **Data-driven content.** New machines should be JSON-first additions.
4. **Clean separation**: simulation (pure TS) vs rendering (Phaser).

## Project Conventions
- **ECS-lite** Organization:
  - Components in `src/ecs/components.ts`
  - Systems in `src/ecs/systems.ts`
  - A `tick()` that advances simulation; renderer copies positions/visuals.
- **Machines** are JSON in `src/data/machines/*.json`:
  ```json
  {
    "id": "ceb_press",
    "name": "CEB Press (The Liberator)",
    "build": { "parts": { "steel_plate": 40, "angle_iron": 12, "bolts": 30, "hydraulic_cylinder": 1, "control_box": 1 } },
    "power": { "kind": "hydraulic", "requires": "power_cube", "flow_gpm": 20, "pressure_psi": 2300 },
    "operate": { "inputs": { "soil": 1, "water": 0.05 }, "outputs": { "brick_ceb": 1 } },
    "quality": { "clay_pct": [0.2, 0.4], "moisture": [0.08, 0.12], "min_pressure_psi": 2000 }
  }
  ```

## Agent Tasks (Good First Prompts)
- Implement `HydraulicsSystem` that:
  - scans placed entities with `power.kind === 'hydraulic'`
  - sets `powered=true` on adjacent consumers if a Power Cube is adjacent (v0)
  - later: propagate simplified flow/pressure.
- Implement `CraftingSystem` that:
  - if `powered && hasInputs`, consume inputs over `workTime` and enqueue outputs.
- Implement UI:
  - hotbar to select `power_cube` or `ceb_press`
  - on click on a tile, place/remove entity, if valid
- Implement save/load using `src/utils/save.ts` API.

## Static Hosting
- Build with `npm run build` → deploy `/dist` to GitHub Pages.
- Keep routes simple (hash-based) to avoid server rewrites.

## Licensing
- **Code**: MIT.
- **OSE blueprint-derived content**: include attributions (CC-BY-SA 4.0) in `docs/` and in-game blueprint viewer.

## Notes for Future Agents
- October 2026 dependency review: npm dependencies are generated from `package-lock.json`; `node_modules/` and generated `dist/` were removed from source control and ignored. The Pages workflow installs dependencies and builds `dist/` before publishing, so do not re-commit either generated tree. A compatible lockfile refresh passed a clean Node 22 install, live npm audit, production build, and local Chromium canvas smoke check; keep this review branch separate from the main-only Pages deployment workflow. The factory gameplay update fixes application TypeScript diagnostics. `skipLibCheck` skips Phaser's browser-only legacy declaration; application checking remains strict.
- The world expands in every direction. `WorldState.bounds` tracks explored tile extents, while rendering now uses stable world pixels (`tile * gridSize`) even for negative coordinates. Use `worldToPixelCenterX/Y` for new renderables; do not offset by bounds when rendering. Ground is a viewport-sized tileSprite to avoid allocating a giant texture as exploration grows.
- After finishing a task, please add any helpful observations to this file **and** keep this reminder so the habit continues for future contributors.


- Factory update: use `machineDefinitions` / `createBuildables()` rather than duplicating machine IDs or recipes in the renderer. Machines reserve recipe inputs in `activeInputs`; call `refundMachineInputs` once before removal. `production` is cumulative output and must persist for research. Only Power Cubes and hose tiles relay hydraulic flow; consumers do not. Simulator tests live in `tests/simulation.test.ts` and run with `npm test`; build includes typecheck. Preserve the seven tech stages and document game-scale physical simplifications in README. Artwork is original SVG, not imported Factorio assets.
- Vehicle routes use bounded cardinal A* and comma-keyed occupied tiles. Hose tiles can be driven over; machinery blocks movement. New placement rejects occupied terrain and the truck tile. Saves use factory-v2, preserve explored chunks and resource depletion, and retain the legacy save record during migration. Packing a fueled wood-gas pump discards residual gas rather than refunding already-gasified wood.

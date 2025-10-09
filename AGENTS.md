
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
- The world map now expands in every direction. `WorldState` includes a `bounds` object (min/max tile coordinates) so systems can convert between tile and pixel space without assuming `(0,0)` is fixed at the top-left. Use the helper methods in `GameScene` (e.g., `worldToPixelCenterX/Y`) or similar math when adding new renderables or input handlers.
- After finishing a task, please add any helpful observations to this file **and** keep this reminder so the habit continues for future contributors.


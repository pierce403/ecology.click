# ecology.click

A static, browser-first factory and settlement game inspired by Open Source Ecology. Drive the supply truck, gather finite deposits, fabricate machinery, connect hydraulic networks and build a Seed Eco-Home. Original industrial artwork and compact controls keep the world visible while machines work.

## Play

Click a resource deposit to drive there and gather continuously. Use WASD or arrow keys to move; hold Space to gather and press E to drink. Touch controls provide the same actions on phones.

Place the supplied Workbench first. Click a blueprint to assemble it; it stays selected for placement when the batch completes. The quickbar shows assembly time and ready machines. A visible placement message explains blocked tiles and missing materials. Keys 1–9 select quickbar slots; B switches between exploration and placement; Esc cancels; G shows the grid; P pauses; the wheel zooms. Click an installed machine to inspect its recipe, batch progress and operating status. Shift-click or use the inspector to pack it up, recovering the machine and any reserved inputs.

The seven stages preserve the original progression:

1. **Hand tools & camp:** workbench, water well and stockpile support.
2. **Workshop:** turn salvaged metal and fasteners into steel plates; fire clay bricks in a kiln.
3. **Power & hydraulics:** assemble wood-gas Power Cubes, hose networks and hydraulic packs; extract finite scrap deposits.
4. **Earth & habitat:** mix soil, clay, sand and water; compress prepared earth into bricks.
5. **Mobility & handling:** wheel fabrication and LifeTrac improve material handling.
6. **Metal fabrication:** a powered CNC torch produces cut parts.
7. **Sawmill & Seed Eco-Home:** process timber and construct the first livable home.

Research follows cumulative production and installed machines, so spending materials does not erase progress. Recipes reserve their inputs at the start of each batch. A fuel-starved or disconnected machine stops and resumes that same batch after power returns. Pumps and cardinally adjacent hose tiles form explicit networks; rated flow is shared proportionally when connected machines demand too much. Consumer buildings do not relay hydraulic power.

## Simulation assumptions

This is a game-scale model, not an engineering or construction specification. Inventory counts are abstract material units; recipes, build costs and assembly times are deliberately compressed. Machines use a shared settlement stockpile, and workshop labor is abstracted. Physical conveyors, local machine inventories, transport delays, wear, structural loads, earth curing and variable soil testing are future simulation work.

The Power Cube is a simplified wood-gas variant: one wood unit fuels 45 seconds of loaded operation; idle pumps automatically stop. Hydraulic pressure is held at its nominal rating and network flow is shared; hose pressure losses and dynamic pump curves are not modeled. Cutting gases and electrical controls are abstracted into machinery rather than separately supplied. Wells abstract groundwater replenishment and work faster near surface water. All material deposits, including mechanically recovered metal, are finite. Storage improves gathering organization rather than implementing a hard inventory cap. LifeTrac improves gathering batches rather than providing a fully simulated tractor drivetrain.

Compressed-earth mix ratios are game values, not guidance for making safe building materials. Machine names and the technology progression are inspired by the [Open Source Ecology project](https://www.opensourceecology.org/) and its [blueprint wiki](https://wiki.opensourceecology.org/).

## Development

Use Node 22.12.0 or newer. Install exactly the lockfile dependencies with `npm ci`.

```sh
npm run dev
npm test
npm run typecheck
npm run build
```

`npm test` bundles and runs the pure TypeScript simulation checks in a temporary directory. `npm run build` includes the application TypeScript check and generates `dist/`. Phaser's browser declaration file is excluded from dependency type checking; application code still uses strict TypeScript.

## Architecture

- `src/ecs/`: pure simulation types, hydraulic networks, fuel, production and milestones.
- `src/data/machines/*.json`: machine definitions, recipes, inputs, outputs, flow and fuel values.
- `src/data/machines.ts`: typed catalog shared by simulation and UI.
- `src/data/techTree.ts`: the seven-stage blueprint progression.
- `src/scenes/GameScene.ts`: Phaser world rendering, truck controls and DOM interface.
- `src/utils/save.ts`: versioned browser-local saves and legacy migration.
- `public/images/`: original SVG terrain, deposits, materials and machinery.
- `tests/`: material, fuel, power, progression and persistence regression checks.

Saves remain in this browser. Autosave retains world bounds, explored chunks, depleted deposits, production milestones, machine batches, fuel and queued construction. No server or sign-in is required.

## Deployment and license

The main-branch GitHub Actions workflow installs the lockfile, runs simulation checks, typechecks/builds and publishes `dist/` to GitHub Pages. Keep generated dependencies and build output out of source control.

Code is MIT. Artwork in this repository is original. Open Source Ecology names and conceptual progression are attributed above; retain the appropriate CC-BY-SA attribution if importing blueprint text, images or CAD-derived assets later.

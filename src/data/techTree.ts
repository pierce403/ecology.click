export type TechTierSection = {
  label: string;
  items: string[];
};

export type TechTierNote = {
  label: string;
  text: string;
};

export type TechTier = {
  id: string;
  tier: string;
  name: string;
  tagline?: string;
  sections: TechTierSection[];
  notes?: TechTierNote[];
};

export const techTree: TechTier[] = [
  { id: 'tier0', tier: 'Tier 0', name: 'Hand tools & camp', tagline: 'Bootstrap the settlement.', sections: [
    { label: 'Buildings', items: ['Workbench', 'Water Well', 'Storage Shed'] },
    { label: 'Base resources', items: ['Soil', 'Sand', 'Clay', 'Wood', 'Scrap Metal', 'Water'] },
    { label: 'Production', items: ['Salvaged metal → fastener packs'] }
  ], notes: [{ label: 'Milestone', text: 'Install a workbench to unlock workshop tools.' }] },
  { id: 'tier1', tier: 'Tier 1', name: 'Workshop', tagline: 'Turn scrap into useful components.', sections: [
    { label: 'Buildings', items: ['Machine Shop', 'Kiln'] },
    { label: 'Production', items: ['Salvaged metal + fasteners → steel plates', 'Clay + sand + wood fuel → fired bricks'] }
  ], notes: [{ label: 'Milestone', text: 'Produce six steel plates to unlock hydraulic power.' }] },
  { id: 'tier2', tier: 'Tier 2', name: 'Power & Hydraulics', sections: [
    { label: 'Machines', items: ['Power Cube', 'Hydraulics Bench', 'Scrap Extractor'] },
    { label: 'Connections', items: ['Hydraulic hose networks', '20 GPM per Power Cube at 2,300 PSI'] },
    { label: 'Production', items: ['Steel plates + fasteners → hydraulic packs', 'Extractors mine finite metal deposits'] }
  ], notes: [{ label: 'Milestone', text: 'Install a Power Cube to unlock earth processing.' }, { label: 'Operation', text: 'Wood-gas fuel powers the pump. Shared flow limits slow overloaded networks.' }] },
  { id: 'tier3', tier: 'Tier 3', name: 'Earth & Habitat', tagline: 'Your first automated building material.', sections: [
    { label: 'Machines', items: ['Soil Processor', 'CEB Press (The Liberator)'] },
    { label: 'Production', items: ['Soil + clay + sand + water → prepared earth', 'Prepared earth + hydraulic pressure → compressed earth bricks'] }
  ], notes: [{ label: 'Milestone', text: 'Produce twelve compressed earth bricks.' }] },
  { id: 'tier4', tier: 'Tier 4', name: 'Mobility & Handling', sections: [
    { label: 'Machines', items: ['Wheel Shop', 'LifeTrac'] },
    { label: 'Production', items: ['Steel plates + wood + fasteners → wheel units'] },
    { label: 'Upgrade', items: ['LifeTrac increases material collection batches'] }
  ], notes: [{ label: 'Milestone', text: 'Install LifeTrac to unlock precision metal fabrication.' }] },
  { id: 'tier5', tier: 'Tier 5', name: 'Metal Fabrication', tagline: 'Make precise parts for larger builds.', sections: [
    { label: 'Machines', items: ['CNC Torch Table'] },
    { label: 'Production', items: ['Steel plates + hydraulic power → cut parts'] }
  ], notes: [{ label: 'Milestone', text: 'Produce eight cut parts to unlock timber processing.' }] },
  { id: 'tier6', tier: 'Tier 6', name: 'Sawmill & Seed Eco-Home Starter', sections: [
    { label: 'Machines / Buildings', items: ['Sawmill', 'Seed Eco-Home'] },
    { label: 'Production', items: ['Wood + hydraulic power → lumber', 'Earth bricks + lumber + fired masonry + fasteners → starter home'] }
  ], notes: [{ label: 'Goal', text: 'Install your first Seed Eco-Home to complete the settlement.' }] }
];

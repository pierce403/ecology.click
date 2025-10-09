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
  {
    id: 'tier0',
    tier: 'Tier 0',
    name: 'Hand tools & camp',
    tagline: 'Bootstrap essentials for your first camp.',
    sections: [
      {
        label: 'Buildings',
        items: ['Workbench (hand crafting)', 'Drying Rack']
      },
      {
        label: 'Base resources',
        items: ['Soil', 'Sand', 'Clay', 'Wood', 'Scrap Metal', 'Water']
      },
      {
        label: 'Parts unlocked',
        items: ['Fastener Pack', 'Frame Beam (basic)']
      }
    ],
    notes: [
      {
        label: 'Goal',
        text: 'Craft enough parts to place the first real shop.'
      }
    ]
  },
  {
    id: 'tier1',
    tier: 'Tier 1',
    name: 'Workshop',
    tagline: 'Fabrication bootstrap.',
    sections: [
      {
        label: 'Buildings',
        items: ['Machine Shop (cuts/holes)', 'Kiln (low-temp firing)']
      },
      {
        label: 'Sub-components unlocked',
        items: [
          'Fastener Pack (bolts, nuts, washers)',
          'Frame Beam + Gusset Plate',
          'Bearing Unit (bearing + housing)',
          'Shaft Unit (cut shaft + keyway)'
        ]
      }
    ],
    notes: [
      {
        label: 'Goal',
        text: 'Assemble Power Cube (your first energy hub).'
      }
    ]
  },
  {
    id: 'tier2',
    tier: 'Tier 2',
    name: 'Power & Hydraulics',
    sections: [
      {
        label: 'Buildings',
        items: ['Hydraulics Bench (hoses/fittings)', 'Fuel Station']
      },
      {
        label: 'Machines',
        items: ['Power Cube (hydraulic power producer)']
      },
      {
        label: 'Sub-components unlocked',
        items: [
          'Hydraulic Pack (pump, reservoir, hoses)',
          'Quick-Attach Plate (universal mount)',
          'Control Box (basic) (switches/relays)'
        ]
      }
    ],
    notes: [
      {
        label: 'Goal loop',
        text: 'Route hydraulic power to consumers.'
      }
    ]
  },
  {
    id: 'tier3',
    tier: 'Tier 3',
    name: 'Earth & Habitat',
    tagline: 'First product loop.',
    sections: [
      {
        label: 'Buildings',
        items: ['Soil Processor (sieve + moisture mix)', 'Drying Yard']
      },
      {
        label: 'Machines',
        items: ['CEB Press (The Liberator)']
      },
      {
        label: 'Products',
        items: ['Compressed Earth Bricks (CEB)']
      }
    ],
    notes: [
      {
        label: 'Loop',
        text: 'Soil + water → CEB; place walls → progression unlocks.'
      }
    ]
  },
  {
    id: 'tier4',
    tier: 'Tier 4',
    name: 'Mobility & Handling',
    sections: [
      {
        label: 'Buildings',
        items: ['Wheel Shop (rims/tires)', 'Welding Bay']
      },
      {
        label: 'Machines',
        items: ['LifeTrac (tractor)', 'Loader Frame']
      },
      {
        label: 'Sub-components',
        items: ['Wheel Unit (hub + tire)', 'Hydraulic Cylinder (assembled from seals + tube)']
      }
    ],
    notes: [
      {
        label: 'Loop',
        text: 'LifeTrac moves materials faster; can power attachments via Power Cube bay.'
      }
    ]
  },
  {
    id: 'tier5',
    tier: 'Tier 5',
    name: 'Metal Fabrication',
    tagline: 'Faster parts.',
    sections: [
      {
        label: 'Buildings',
        items: ['CNC Torch Table', 'Foundry (basic) (ingot → plate/rod)']
      },
      {
        label: 'Products',
        items: ['Steel Plate', 'Angle Iron', 'Cut Parts']
      }
    ],
    notes: [
      {
        label: 'Loop',
        text: 'Unlocks cheaper/faster Frame Beams, Gussets, Quick-Attach.'
      }
    ]
  },
  {
    id: 'tier6',
    tier: 'Tier 6',
    name: 'Sawmill & Seed Eco-Home Starter',
    sections: [
      {
        label: 'Buildings / Machines',
        items: ['Sawmill', 'Seed Eco-Home Kit']
      },
      {
        label: 'Products',
        items: ['Lumber sets', 'Panels', 'Doors/Frames']
      }
    ],
    notes: [
      {
        label: 'Loop',
        text: 'Bricks + lumber → livable starter house.'
      }
    ]
  }
];

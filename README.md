# orca_hand_tendon_routing
A virtual tool to help mapping the tendons on the ORCA hand.

Live site: https://stfleming.github.io/orca_hand_tendon_routing/

This is a 3D viewer for the right-hand ORCA v2.1 (Dynamixel base). Select a tendon at the bottom of the
wrist to see its route from motor drum to finger joint, the segment it moves, and its antagonist
(the opposite-direction tendon on the same drum). Tendons are numbered as in the team's wiring diagram.

## Use

- Click a hole on the **wrist-bottom map**, a marker or tendon in 3D, or an entry in the list.
  The map uses the same view as page 5 of the diagram: back side (+z) on the left, palm side on the right,
  pinky up.
- **Gold** = selected tendon, **cyan** = antagonist, **pink** = segment it moves (joint ringed, drum gold).
- Keys: `←`/`→` previous/next tendon, `a` antagonist, `f` focus, `r` reset view, `Esc` clear.
- Deep link to a tendon: `…/orca_hand_tendon_routing/#22`.

## Accuracy

- **Drum → wrist → wrist pin → carpal channels:** traced from the CAD channels. Every drum carries the
  antagonist pair given in the diagram legend, and nothing crosses at the wrist.
- **Inside the fingers (faded part of each tube):** schematic. It runs dorsal for Up/extension and palmar
  for Down/flexion, ending at the correct joint.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The site is fully static, and three.js 0.170 is vendored in `vendor/`. GitHub Pages serves it from the root
of `main` (`.nojekyll` disables Jekyll processing).

## Credits

ORCA Hand by ORCA Dexterity, Inc. — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
([orcahand_hardware](https://github.com/orcahand/orcahand_hardware)). `data/hand.glb` is tessellated
from the Base V2 right-hand STEP.

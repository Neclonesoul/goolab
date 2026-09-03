# GOOLAB

**Experiments for the glass in your hand.**

## 001 / FLUID

A responsive FLIP/PIC liquid simulation whose gravity field follows
the physical orientation of the device.

### Current checkpoint

- FLIP/PIC hybrid solver
- particle → grid transfer
- incompressibility projection
- grid → particle transfer
- drift compensation
- particle separation
- circular solid boundary
- 2-axis gravity
- DeviceOrientation input
- DeviceMotion impulse input
- desktop pointer gravity emulator
- keyboard gravity emulator
- OLED-black presentation
- Saber purple / Phosphor green
- offline PWA shell
- fullscreen mode

### Desktop

```text
Pointer       gravity direction
Arrow keys    gravity axis
Space         gravity down
Mobile

Tap TOUCH TO INITIALISE and grant motion/orientation access if
the browser requests it.

Tilt the device.

Local development
python -m http.server 4173

Then visit:

http://localhost:4173
Physics lineage

The FLIP implementation is derived from Matthias Müller's
Ten Minute Physics FLIP Fluid tutorial and code, distributed under
the MIT License.

The original copyright/license notice is retained in src/fluid.js.

Roadmap
001 / FLUID
  A solver extraction             ✓
  B circular vessel               ✓
  C OLED renderer                 ✓
  D gravity abstraction           ✓
  E device sensors                ✓ initial
  F PWA / offline                 ✓ initial
  G performance + physics tuning  next
  H Android native                next
GOOLAB

Future experiments:

001 / FLUID
002 / GRAVITY
003 / ORBIT
004 / WAVE
005 / MAGNETIC


---

## v0.1.0 — First Public Experiment

Final safe production profile:

- simulation grid: 42
- physics: 60 Hz fixed timestep
- maximum catch-up: 2 steps
- pressure iterations: 18
- particle separation iterations: 1
- particle radius: 0.27 × grid spacing
- batched Canvas particle rendering
- true OLED-black presentation
- SABER and PHOSPHOR emission modes
- circular vessel
- pointer/keyboard gravity emulation
- mobile device-orientation input
- mobile motion impulse input
- offline PWA

The pressure-grid resolution remains intentionally conservative.
Visual fluid density is achieved primarily through particle density
rather than unnecessarily increasing the Eulerian solver workload.

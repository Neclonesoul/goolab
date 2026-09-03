/*
Copyright 2022 Matthias Müller - Ten Minute Physics
https://www.youtube.com/c/TenMinutePhysics
https://matthiasMueller.info/tenMinutePhysics

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

GOOLAB modifications:
- 2-axis gravity vector
- circular vessel boundary
- runtime damping
- modular ES class
- desktop/mobile input abstraction
*/

const FLUID_CELL = 0;
const AIR_CELL = 1;
const SOLID_CELL = 2;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

export class FlipFluid {
  constructor({
    density,
    width,
    height,
    spacing,
    particleRadius,
    maxParticles,
    vessel
  }) {
    this.density = density;

    this.width = width;
    this.height = height;

    this.fNumX = Math.floor(width / spacing) + 1;
    this.fNumY = Math.floor(height / spacing) + 1;

    this.h = Math.max(
      width / this.fNumX,
      height / this.fNumY
    );

    this.fInvSpacing = 1 / this.h;
    this.fNumCells = this.fNumX * this.fNumY;

    this.u = new Float32Array(this.fNumCells);
    this.v = new Float32Array(this.fNumCells);

    this.du = new Float32Array(this.fNumCells);
    this.dv = new Float32Array(this.fNumCells);

    this.prevU = new Float32Array(this.fNumCells);
    this.prevV = new Float32Array(this.fNumCells);

    this.p = new Float32Array(this.fNumCells);
    this.s = new Float32Array(this.fNumCells);

    this.cellType = new Int32Array(this.fNumCells);

    this.particleDensity = new Float32Array(this.fNumCells);
    this.particleRestDensity = 0;

    this.maxParticles = maxParticles;

    this.particlePos = new Float32Array(2 * maxParticles);
    this.particleVel = new Float32Array(2 * maxParticles);

    this.particleRadius = particleRadius;

    this.pInvSpacing = 1 / (2.2 * particleRadius);

    this.pNumX =
      Math.floor(width * this.pInvSpacing) + 1;

    this.pNumY =
      Math.floor(height * this.pInvSpacing) + 1;

    this.pNumCells =
      this.pNumX * this.pNumY;

    this.numCellParticles =
      new Int32Array(this.pNumCells);

    this.firstCellParticle =
      new Int32Array(this.pNumCells + 1);

    this.cellParticleIds =
      new Int32Array(maxParticles);

    this.numParticles = 0;

    this.vessel = vessel;

    this.configureCircularSolidField();
  }

  configureCircularSolidField() {
    const n = this.fNumY;
    const h = this.h;

    const cx = this.vessel.cx;
    const cy = this.vessel.cy;
    const radius = this.vessel.radius;

    for (let i = 0; i < this.fNumX; i++) {
      for (let j = 0; j < this.fNumY; j++) {
        const x = (i + 0.5) * h;
        const y = (j + 0.5) * h;

        const dx = x - cx;
        const dy = y - cy;

        const d = Math.hypot(dx, dy);

        this.s[i * n + j] =
          d <= radius ? 1 : 0;
      }
    }
  }

  integrateParticles(dt, gx, gy, damping) {
    const damp = Math.max(0, 1 - damping);

    for (let i = 0; i < this.numParticles; i++) {
      const p = 2 * i;

      this.particleVel[p] += gx * dt;
      this.particleVel[p + 1] += gy * dt;

      this.particleVel[p] *= damp;
      this.particleVel[p + 1] *= damp;

      this.particlePos[p] +=
        this.particleVel[p] * dt;

      this.particlePos[p + 1] +=
        this.particleVel[p + 1] * dt;
    }
  }

  handleCircularBoundary() {
    const cx = this.vessel.cx;
    const cy = this.vessel.cy;

    const limit =
      this.vessel.radius -
      this.particleRadius * 1.35;

    for (let i = 0; i < this.numParticles; i++) {
      const p = 2 * i;

      let x = this.particlePos[p];
      let y = this.particlePos[p + 1];

      const dx = x - cx;
      const dy = y - cy;

      const dist = Math.hypot(dx, dy);

      if (dist <= limit || dist === 0)
        continue;

      const nx = dx / dist;
      const ny = dy / dist;

      x = cx + nx * limit;
      y = cy + ny * limit;

      let vx = this.particleVel[p];
      let vy = this.particleVel[p + 1];

      const outward =
        vx * nx + vy * ny;

      if (outward > 0) {
        vx -= outward * nx;
        vy -= outward * ny;
      }

      this.particlePos[p] = x;
      this.particlePos[p + 1] = y;

      this.particleVel[p] = vx * 0.985;
      this.particleVel[p + 1] = vy * 0.985;
    }
  }

  pushParticlesApart(numIters) {
    this.numCellParticles.fill(0);

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];

      const xi = clamp(
        Math.floor(x * this.pInvSpacing),
        0,
        this.pNumX - 1
      );

      const yi = clamp(
        Math.floor(y * this.pInvSpacing),
        0,
        this.pNumY - 1
      );

      this.numCellParticles[
        xi * this.pNumY + yi
      ]++;
    }

    let first = 0;

    for (let i = 0; i < this.pNumCells; i++) {
      first += this.numCellParticles[i];
      this.firstCellParticle[i] = first;
    }

    this.firstCellParticle[
      this.pNumCells
    ] = first;

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];

      const xi = clamp(
        Math.floor(x * this.pInvSpacing),
        0,
        this.pNumX - 1
      );

      const yi = clamp(
        Math.floor(y * this.pInvSpacing),
        0,
        this.pNumY - 1
      );

      const cell =
        xi * this.pNumY + yi;

      this.firstCellParticle[cell]--;

      this.cellParticleIds[
        this.firstCellParticle[cell]
      ] = i;
    }

    const minDist =
      2 * this.particleRadius;

    const minDist2 =
      minDist * minDist;

    for (let iter = 0; iter < numIters; iter++) {

      for (let i = 0; i < this.numParticles; i++) {
        const p = 2 * i;

        const px = this.particlePos[p];
        const py = this.particlePos[p + 1];

        const pxi =
          Math.floor(px * this.pInvSpacing);

        const pyi =
          Math.floor(py * this.pInvSpacing);

        const x0 = Math.max(pxi - 1, 0);
        const y0 = Math.max(pyi - 1, 0);

        const x1 = Math.min(
          pxi + 1,
          this.pNumX - 1
        );

        const y1 = Math.min(
          pyi + 1,
          this.pNumY - 1
        );

        for (let xi = x0; xi <= x1; xi++) {
          for (let yi = y0; yi <= y1; yi++) {

            const cell =
              xi * this.pNumY + yi;

            const first =
              this.firstCellParticle[cell];

            const last =
              this.firstCellParticle[cell + 1];

            for (let j = first; j < last; j++) {
              const id =
                this.cellParticleIds[j];

              if (id <= i)
                continue;

              const q = 2 * id;

              const qx =
                this.particlePos[q];

              const qy =
                this.particlePos[q + 1];

              let dx = qx - px;
              let dy = qy - py;

              const d2 =
                dx * dx + dy * dy;

              if (
                d2 >= minDist2 ||
                d2 <= 1e-12
              )
                continue;

              const d = Math.sqrt(d2);

              const s =
                0.5 *
                (minDist - d) /
                d;

              dx *= s;
              dy *= s;

              this.particlePos[p] -= dx;
              this.particlePos[p + 1] -= dy;

              this.particlePos[q] += dx;
              this.particlePos[q + 1] += dy;
            }
          }
        }
      }

      this.handleCircularBoundary();
    }
  }

  updateParticleDensity() {
    const n = this.fNumY;

    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    const d = this.particleDensity;

    d.fill(0);

    for (let i = 0; i < this.numParticles; i++) {
      let x = this.particlePos[2 * i];
      let y = this.particlePos[2 * i + 1];

      x = clamp(
        x,
        h,
        (this.fNumX - 1) * h
      );

      y = clamp(
        y,
        h,
        (this.fNumY - 1) * h
      );

      const x0 =
        Math.floor((x - h2) * h1);

      const tx =
        ((x - h2) - x0 * h) * h1;

      const x1 =
        Math.min(
          x0 + 1,
          this.fNumX - 2
        );

      const y0 =
        Math.floor((y - h2) * h1);

      const ty =
        ((y - h2) - y0 * h) * h1;

      const y1 =
        Math.min(
          y0 + 1,
          this.fNumY - 2
        );

      const sx = 1 - tx;
      const sy = 1 - ty;

      if (x0 >= 0 && y0 >= 0)
        d[x0 * n + y0] += sx * sy;

      if (x1 >= 0 && y0 >= 0)
        d[x1 * n + y0] += tx * sy;

      if (x1 >= 0 && y1 >= 0)
        d[x1 * n + y1] += tx * ty;

      if (x0 >= 0 && y1 >= 0)
        d[x0 * n + y1] += sx * ty;
    }

    if (this.particleRestDensity === 0) {
      let sum = 0;
      let cells = 0;

      for (let i = 0; i < this.fNumCells; i++) {
        if (this.cellType[i] === FLUID_CELL) {
          sum += d[i];
          cells++;
        }
      }

      if (cells > 0)
        this.particleRestDensity =
          sum / cells;
    }
  }

  transferVelocities(toGrid, flipRatio = 0.9) {
    const n = this.fNumY;

    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    if (toGrid) {
      this.prevU.set(this.u);
      this.prevV.set(this.v);

      this.du.fill(0);
      this.dv.fill(0);

      this.u.fill(0);
      this.v.fill(0);

      for (let i = 0; i < this.fNumCells; i++) {
        this.cellType[i] =
          this.s[i] === 0
            ? SOLID_CELL
            : AIR_CELL;
      }

      for (let i = 0; i < this.numParticles; i++) {
        const x = this.particlePos[2 * i];
        const y = this.particlePos[2 * i + 1];

        const xi = clamp(
          Math.floor(x * h1),
          0,
          this.fNumX - 1
        );

        const yi = clamp(
          Math.floor(y * h1),
          0,
          this.fNumY - 1
        );

        const cell = xi * n + yi;

        if (this.cellType[cell] === AIR_CELL)
          this.cellType[cell] = FLUID_CELL;
      }
    }

    for (let component = 0; component < 2; component++) {

      const dx =
        component === 0 ? 0 : h2;

      const dy =
        component === 0 ? h2 : 0;

      const field =
        component === 0
          ? this.u
          : this.v;

      const previous =
        component === 0
          ? this.prevU
          : this.prevV;

      const weights =
        component === 0
          ? this.du
          : this.dv;

      for (let i = 0; i < this.numParticles; i++) {
        let x = this.particlePos[2 * i];
        let y = this.particlePos[2 * i + 1];

        x = clamp(
          x,
          h,
          (this.fNumX - 1) * h
        );

        y = clamp(
          y,
          h,
          (this.fNumY - 1) * h
        );

        let x0 =
          Math.floor((x - dx) * h1);

        let y0 =
          Math.floor((y - dy) * h1);

        x0 = clamp(
          x0,
          0,
          this.fNumX - 2
        );

        y0 = clamp(
          y0,
          0,
          this.fNumY - 2
        );

        const tx =
          ((x - dx) - x0 * h) * h1;

        const ty =
          ((y - dy) - y0 * h) * h1;

        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const sx = 1 - tx;
        const sy = 1 - ty;

        const w0 = sx * sy;
        const w1 = tx * sy;
        const w2 = tx * ty;
        const w3 = sx * ty;

        const nr0 = x0 * n + y0;
        const nr1 = x1 * n + y0;
        const nr2 = x1 * n + y1;
        const nr3 = x0 * n + y1;

        if (toGrid) {
          const pv =
            this.particleVel[
              2 * i + component
            ];

          field[nr0] += pv * w0;
          weights[nr0] += w0;

          field[nr1] += pv * w1;
          weights[nr1] += w1;

          field[nr2] += pv * w2;
          weights[nr2] += w2;

          field[nr3] += pv * w3;
          weights[nr3] += w3;

        } else {

          const offset =
            component === 0 ? n : 1;

          const valid = [
            this.faceValid(nr0, offset),
            this.faceValid(nr1, offset),
            this.faceValid(nr2, offset),
            this.faceValid(nr3, offset)
          ];

          const denom =
            valid[0] * w0 +
            valid[1] * w1 +
            valid[2] * w2 +
            valid[3] * w3;

          if (denom <= 0)
            continue;

          const pic =
            (
              valid[0] * w0 * field[nr0] +
              valid[1] * w1 * field[nr1] +
              valid[2] * w2 * field[nr2] +
              valid[3] * w3 * field[nr3]
            ) / denom;

          const correction =
            (
              valid[0] * w0 *
                (field[nr0] - previous[nr0]) +

              valid[1] * w1 *
                (field[nr1] - previous[nr1]) +

              valid[2] * w2 *
                (field[nr2] - previous[nr2]) +

              valid[3] * w3 *
                (field[nr3] - previous[nr3])
            ) / denom;

          const old =
            this.particleVel[
              2 * i + component
            ];

          const flip = old + correction;

          this.particleVel[
            2 * i + component
          ] =
            (1 - flipRatio) * pic +
            flipRatio * flip;
        }
      }

      if (toGrid) {
        for (let i = 0; i < field.length; i++) {
          if (weights[i] > 0)
            field[i] /= weights[i];
        }

        for (let i = 0; i < this.fNumX; i++) {
          for (let j = 0; j < this.fNumY; j++) {
            const cell = i * n + j;

            const solid =
              this.cellType[cell] === SOLID_CELL;

            if (
              solid ||
              (
                i > 0 &&
                this.cellType[
                  (i - 1) * n + j
                ] === SOLID_CELL
              )
            ) {
              this.u[cell] =
                this.prevU[cell];
            }

            if (
              solid ||
              (
                j > 0 &&
                this.cellType[
                  i * n + j - 1
                ] === SOLID_CELL
              )
            ) {
              this.v[cell] =
                this.prevV[cell];
            }
          }
        }
      }
    }
  }

  faceValid(index, offset) {
    if (
      index < 0 ||
      index >= this.fNumCells
    )
      return 0;

    const neighbor = index - offset;

    if (
      neighbor < 0 ||
      neighbor >= this.fNumCells
    )
      return 0;

    return (
      this.cellType[index] !== AIR_CELL ||
      this.cellType[neighbor] !== AIR_CELL
    )
      ? 1
      : 0;
  }

  solveIncompressibility(
    numIters,
    dt,
    overRelaxation,
    compensateDrift
  ) {
    this.p.fill(0);

    this.prevU.set(this.u);
    this.prevV.set(this.v);

    const n = this.fNumY;

    const cp =
      this.density *
      this.h /
      dt;

    for (let iter = 0; iter < numIters; iter++) {

      for (
        let i = 1;
        i < this.fNumX - 1;
        i++
      ) {

        for (
          let j = 1;
          j < this.fNumY - 1;
          j++
        ) {

          const center = i * n + j;

          if (
            this.cellType[center] !==
            FLUID_CELL
          )
            continue;

          const left =
            (i - 1) * n + j;

          const right =
            (i + 1) * n + j;

          const bottom =
            i * n + j - 1;

          const top =
            i * n + j + 1;

          const sx0 = this.s[left];
          const sx1 = this.s[right];
          const sy0 = this.s[bottom];
          const sy1 = this.s[top];

          const s =
            sx0 +
            sx1 +
            sy0 +
            sy1;

          if (s === 0)
            continue;

          let div =
            this.u[right] -
            this.u[center] +
            this.v[top] -
            this.v[center];

          if (
            compensateDrift &&
            this.particleRestDensity > 0
          ) {
            const compression =
              this.particleDensity[center] -
              this.particleRestDensity;

            if (compression > 0)
              div -= compression;
          }

          let pressure =
            -div / s;

          pressure *= overRelaxation;

          this.p[center] +=
            cp * pressure;

          this.u[center] -=
            sx0 * pressure;

          this.u[right] +=
            sx1 * pressure;

          this.v[center] -=
            sy0 * pressure;

          this.v[top] +=
            sy1 * pressure;
        }
      }
    }
  }

  simulate({
    dt,
    gravityX,
    gravityY,
    flipRatio,
    pressureIterations,
    particleIterations,
    overRelaxation,
    compensateDrift,
    separateParticles,
    damping
  }) {
    this.integrateParticles(
      dt,
      gravityX,
      gravityY,
      damping
    );

    if (separateParticles) {
      this.pushParticlesApart(
        particleIterations
      );
    }

    this.handleCircularBoundary();

    this.transferVelocities(true);

    this.updateParticleDensity();

    this.solveIncompressibility(
      pressureIterations,
      dt,
      overRelaxation,
      compensateDrift
    );

    this.transferVelocities(
      false,
      flipRatio
    );

    this.handleCircularBoundary();
  }
}

export function createFluidExperiment(scale = 1) {
  const width = 3;
  const height = 3;

  const resolution = 42;
  const h = height / resolution;

  const particleRadius = 0.27 * h;

  const vessel = {
    cx: width / 2,
    cy: height / 2,
    radius: 1.31
  };

  const spacing =
    particleRadius * 2;

  const rowStep =
    spacing * Math.sqrt(3) / 2;

  const positions = [];

  /*
   * Initial fluid charge:
   * lower 58% of circular vessel.
   */

  for (
    let y =
      vessel.cy -
      vessel.radius +
      h * 1.5;
    y <
      vessel.cy +
      vessel.radius * 0.15;
    y += rowStep
  ) {

    let row = 0;

    for (
      let x =
        vessel.cx -
        vessel.radius +
        h * 1.5;
      x <
        vessel.cx +
        vessel.radius -
        h * 1.5;
      x += spacing
    ) {

      const px =
        x +
        (
          row % 2
            ? particleRadius
            : 0
        );

      const dx = px - vessel.cx;
      const dy = y - vessel.cy;

      if (
        Math.hypot(dx, dy) <
        vessel.radius -
        h * 1.8
      ) {
        positions.push(px, y);
      }

      row++;
    }
  }

  const particleCount =
    positions.length / 2;

  const fluid =
    new FlipFluid({
      density: 1000,
      width,
      height,
      spacing: h,
      particleRadius,
      maxParticles:
        Math.ceil(particleCount * 1.1),
      vessel
    });

  fluid.numParticles = particleCount;

  fluid.particlePos.set(positions);

  return fluid;
}

export {
  FLUID_CELL,
  AIR_CELL,
  SOLID_CELL
};

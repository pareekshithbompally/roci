/** Frame-rate independent spring: ω = 2π / duration, ζ = 1 − bounce, solved analytically. */

const CRITICAL_DAMPING_TOLERANCE = 1e-4;

export interface Spec {
  duration: number;
  bounce: number;
}

const omega = (spec: Spec) => (2 * Math.PI) / Math.max(spec.duration, 0.01);
const zeta = (spec: Spec) => (spec.bounce >= 0 ? Math.max(1 - spec.bounce, 0) : 1 / Math.max(1 + spec.bounce, 0.01));

export class Spring {
  x: number;
  v = 0;
  target: number;

  constructor(x: number) {
    this.x = x;
    this.target = x;
  }

  /** Snaps to `x` and clears velocity (first paint, Reduce Motion). */
  jump(x: number): void {
    this.x = x;
    this.v = 0;
    this.target = x;
  }

  stepTo(target: number, spec: Spec, dt: number): void {
    this.target = target;
    this.step(spec, dt);
  }

  private step(spec: Spec, dt: number): void {
    if (dt <= 0 || !Number.isFinite(dt)) return;
    const w = omega(spec);
    const z = zeta(spec);
    const x0 = this.x - this.target;
    const v0 = this.v;
    if (z < 1 - CRITICAL_DAMPING_TOLERANCE) {
      const decay = z * w;
      const wd = w * Math.sqrt(1 - z * z);
      const exp = Math.exp(-decay * dt);
      const sin = Math.sin(wd * dt);
      const cos = Math.cos(wd * dt);
      const sinOverD = sin / wd;
      this.x = this.target + exp * (x0 * (cos + decay * sinOverD) + v0 * sinOverD);
      this.v = exp * (-x0 * w * w * sinOverD + v0 * (cos - decay * sinOverD));
    } else if (z > 1 + CRITICAL_DAMPING_TOLERANCE) {
      const root = Math.sqrt(z * z - 1);
      const slow = -w / (z + root);
      const fast = -w * (z + root);
      const denom = slow - fast;
      const se = Math.exp(slow * dt);
      const fe = Math.exp(fast * dt);
      this.x = this.target + ((-fast * se + slow * fe) / denom) * x0 + ((se - fe) / denom) * v0;
      this.v = ((slow * fast * (fe - se)) / denom) * x0 + ((slow * se - fast * fe) / denom) * v0;
    } else {
      const exp = Math.exp(-w * dt);
      const c = v0 + w * x0;
      this.x = this.target + (x0 + c * dt) * exp;
      this.v = (v0 - w * c * dt) * exp;
    }
  }
}

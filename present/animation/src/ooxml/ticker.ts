// 基于 requestAnimationFrame 的全局帧驱动。每个回调收到上一帧到当前帧的 ms 间隔。

export type TickCb = (dtMs: number) => void;

export interface Ticker {
  add(cb: TickCb): () => void;
}

class RafTicker implements Ticker {
  private cbs = new Set<TickCb>();
  private last = 0;
  private raf: number | null = null;

  add(cb: TickCb): () => void {
    this.cbs.add(cb);
    if (this.raf === null) this.start();
    return (): void => {
      this.cbs.delete(cb);
      if (this.cbs.size === 0) this.stop();
    };
  }

  private start(): void {
    this.last = nowMs();
    const tick = (): void => {
      const t = nowMs();
      const dt = t - this.last;
      this.last = t;
      for (const cb of this.cbs) cb(dt);
      this.raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(tick) : null;
    };
    this.raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(tick) : null;
  }

  private stop(): void {
    if (this.raf !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}

/**
 * 手动推进的帧驱动：离线渲染（导出视频）用固定步长 `tick(dtMs)` 逐帧推进，
 * 与墙钟解耦，让动画时长只取决于帧率 × 帧数，不受渲染耗时影响。
 */
export class ManualTicker implements Ticker {
  private cbs = new Set<TickCb>();

  add(cb: TickCb): () => void {
    this.cbs.add(cb);
    return (): void => {
      this.cbs.delete(cb);
    };
  }

  tick(dtMs: number): void {
    for (const cb of [...this.cbs]) cb(dtMs);
  }

  get size(): number {
    return this.cbs.size;
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export const globalTicker: Ticker = new RafTicker();

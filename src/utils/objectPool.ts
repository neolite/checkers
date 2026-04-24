// Fixed-capacity pool. acquire() returns null on overflow — no new fallback.
export class ObjectPool<T extends { id: number; alive: boolean }> {
  readonly pool: T[];
  readonly capacity: number;
  private factory: (id: number) => T;
  private resetter: (obj: T) => void;

  constructor(capacity: number, factory: (id: number) => T, resetter: (obj: T) => void) {
    this.capacity = capacity;
    this.factory = factory;
    this.resetter = resetter;
    this.pool = [];
    for (let i = 0; i < capacity; i++) {
      const obj = factory(i + 1);
      obj.alive = false;
      this.pool.push(obj);
    }
  }

  acquire(): T | null {
    for (let i = 0; i < this.pool.length; i++) {
      const o = this.pool[i]!;
      if (!o.alive) {
        this.resetter(o);
        o.alive = true;
        return o;
      }
    }
    return null;
  }

  release(obj: T): void {
    obj.alive = false;
  }

  forEachAlive(cb: (o: T) => void): void {
    for (let i = 0; i < this.pool.length; i++) {
      const o = this.pool[i]!;
      if (o.alive) cb(o);
    }
  }

  findById(id: number): T | null {
    for (let i = 0; i < this.pool.length; i++) {
      const o = this.pool[i]!;
      if (o.alive && o.id === id) return o;
    }
    return null;
  }

  countAlive(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i]!.alive) n++;
    return n;
  }
}

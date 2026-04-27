type EventName<TEvents extends object> = Extract<keyof TEvents, string>;
type Handler<TEvents extends object, K extends EventName<TEvents>> = (ev: TEvents[K]) => void;

export class EventBus<TEvents extends object> {
  private listeners = new Map<EventName<TEvents>, Array<(ev: unknown) => void>>();

  on<K extends EventName<TEvents>>(name: K, h: Handler<TEvents, K>): () => void {
    let arr = this.listeners.get(name);
    if (!arr) {
      arr = [];
      this.listeners.set(name, arr);
    }
    arr.push(h as (ev: unknown) => void);
    return () => {
      const a = this.listeners.get(name);
      if (!a) return;
      const i = a.indexOf(h as (ev: unknown) => void);
      if (i >= 0) a.splice(i, 1);
    };
  }

  emit<K extends EventName<TEvents>>(name: K, ev: TEvents[K]): void {
    const arr = this.listeners.get(name);
    if (!arr) return;
    // Copy to tolerate handlers that unsubscribe.
    const snap = arr.slice();
    for (const h of snap) {
      h(ev);
    }
  }
}

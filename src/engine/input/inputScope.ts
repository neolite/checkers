type ListenerOptions = boolean | AddEventListenerOptions;
type ListenerOff = () => void;

export class InputScope {
  private readonly offs: ListenerOff[] = [];

  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (ev: WindowEventMap[K]) => void,
    options?: ListenerOptions,
  ): void;
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => void,
    options?: ListenerOptions,
  ): void;
  on(target: EventTarget, type: string, listener: EventListener, options?: ListenerOptions): void {
    target.addEventListener(type, listener, options);
    this.offs.push(() => target.removeEventListener(type, listener, options));
  }

  destroy(): void {
    for (let i = this.offs.length - 1; i >= 0; i--) this.offs[i]!();
    this.offs.length = 0;
  }
}

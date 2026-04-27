export interface GameSceneHandle {
  destroy(): void;
}

export interface GameLaunchContext {
  host: HTMLElement;
  exitToMenu(): void;
}

export interface GameRoute<TOptions = Record<string, never>> {
  readonly id: string;
  readonly displayName: string;
  start(ctx: GameLaunchContext, options: TOptions): GameSceneHandle;
}

export type MenuRenderer = (ctx: { start<TOptions>(route: GameRoute<TOptions>, options: TOptions): void }) => void;

export class GameRouter {
  private active: GameSceneHandle | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly renderMenu: MenuRenderer,
  ) {}

  showMenu(): void {
    this.destroyActive();
    this.host.innerHTML = '';
    this.renderMenu({
      start: <TOptions>(route: GameRoute<TOptions>, options: TOptions): void => {
        this.start(route, options);
      },
    });
  }

  start<TOptions>(route: GameRoute<TOptions>, options: TOptions): void {
    this.destroyActive();
    this.host.innerHTML = '';
    const exitToMenu = (): void => {
      this.active = null;
      this.showMenu();
    };
    this.active = route.start({ host: this.host, exitToMenu }, options);
  }

  destroy(): void {
    this.destroyActive();
    this.host.innerHTML = '';
  }

  private destroyActive(): void {
    this.active?.destroy();
    this.active = null;
  }
}

// Global context menu (right-click). One menu at a time, like a real desktop.

export interface MenuItem {
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
  run?: () => void;
}

class ContextMenu {
  open = $state(false);
  x = $state(0);
  y = $state(0);
  items = $state<MenuItem[]>([]);

  show(at: { clientX: number; clientY: number }, items: MenuItem[]): void {
    this.items = items;
    this.x = at.clientX;
    this.y = at.clientY;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}

export const contextMenu = new ContextMenu();

export const sep: MenuItem = { separator: true };

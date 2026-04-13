// ===== Context Menu =====
// Reusable right-click context menu component

import type { MenuItem } from '../types';

export class ContextMenu {
  el: HTMLDivElement;
  private _visible: boolean = false;

  constructor() {
    this._onClickOutside = this._onClickOutside.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this.el = document.createElement('div');
    this.el.className = 'context-menu';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  show(x: number, y: number, items: MenuItem[]): void {
    this.hide();
    this.el.innerHTML = '';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        this.el.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item';
      if (item.disabled) row.classList.add('disabled');

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'context-menu-icon';
        iconSpan.innerHTML = item.icon;
        row.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'context-menu-label';
      labelSpan.textContent = item.label || '';
      row.appendChild(labelSpan);

      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'context-menu-shortcut';
        shortcutSpan.textContent = item.shortcut;
        row.appendChild(shortcutSpan);
      }

      if (item.submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'context-menu-arrow';
        arrow.textContent = '\u25B6';
        row.appendChild(arrow);
      }

      if (!item.disabled && item.action) {
        const action = item.action;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          action();
        });
      }

      if (item.submenu && !item.disabled) {
        const submenu = item.submenu;
        row.addEventListener('mouseenter', () => {
          this._removeSubmenus();
          this._createSubmenu(row, submenu);
        });
      }

      this.el.appendChild(row);
    }

    this.el.style.display = 'block';
    this._visible = true;

    const menuW = this.el.offsetWidth;
    const menuH = this.el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let posX = x;
    let posY = y;
    if (posX + menuW > vw - 4) posX = vw - menuW - 4;
    if (posY + menuH > vh - 4) posY = vh - menuH - 4;
    if (posX < 4) posX = 4;
    if (posY < 4) posY = 4;

    this.el.style.left = posX + 'px';
    this.el.style.top = posY + 'px';

    setTimeout(() => {
      document.addEventListener('mousedown', this._onClickOutside);
      document.addEventListener('keydown', this._onKeyDown);
    }, 0);
  }

  private _createSubmenu(parentRow: HTMLElement, items: MenuItem[]): HTMLDivElement {
    const sub = document.createElement('div');
    sub.className = 'context-menu context-submenu';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        sub.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item';
      if (item.disabled) row.classList.add('disabled');

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'context-menu-icon';
        iconSpan.innerHTML = item.icon;
        row.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'context-menu-label';
      labelSpan.textContent = item.label || '';
      row.appendChild(labelSpan);

      if (!item.disabled && item.action) {
        const action = item.action;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          action();
        });
      }

      sub.appendChild(row);
    }

    document.body.appendChild(sub);

    const parentRect = parentRow.getBoundingClientRect();
    let left = parentRect.right + 2;
    let top = parentRect.top;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    sub.style.display = 'block';
    const subW = sub.offsetWidth;
    const subH = sub.offsetHeight;

    if (left + subW > vw - 4) left = parentRect.left - subW - 2;
    if (top + subH > vh - 4) top = vh - subH - 4;

    sub.style.left = left + 'px';
    sub.style.top = top + 'px';

    return sub;
  }

  private _removeSubmenus(): void {
    document.querySelectorAll('.context-submenu').forEach(el => el.remove());
  }

  hide(): void {
    if (!this._visible) return;
    this.el.style.display = 'none';
    this.el.innerHTML = '';
    this._visible = false;
    this._removeSubmenus();
    document.removeEventListener('mousedown', this._onClickOutside);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  get isVisible(): boolean {
    return this._visible;
  }

  private _onClickOutside(e: MouseEvent): void {
    if (!this.el.contains(e.target as Node) && !(e.target as HTMLElement).closest('.context-submenu')) {
      this.hide();
    }
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.hide();
    }
  }
}

// ===== Menu Bar =====
// Horizontal menu bar: File | Edit | Tracks | Effects | Analysis | Help

import type { MenuDefinition, MenuItem } from '../types';

export class MenuBar {
  container: HTMLElement;
  menus: MenuDefinition[] = [];
  private _openMenuIndex: number = -1;
  private _isOpen: boolean = false;
  private _dropdownEl: HTMLDivElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this._onDocClick = this._onDocClick.bind(this);
    this._onDocKeyDown = this._onDocKeyDown.bind(this);
    this._build();
  }

  setMenus(menus: MenuDefinition[]): void {
    this.menus = menus;
    this._render();
  }

  updateItem(menuLabel: string, itemLabel: string, props: Partial<MenuItem>): void {
    for (const menu of this.menus) {
      if (menu.label !== menuLabel) continue;
      for (const item of menu.items) {
        if (item.label === itemLabel) {
          Object.assign(item, props);
        }
      }
    }
  }

  private _build(): void {
    this.container.className = 'menu-bar';
  }

  private _render(): void {
    this.container.innerHTML = '';
    this.menus.forEach((menu, i) => {
      const btn = document.createElement('div');
      btn.className = 'menu-bar-item';
      btn.textContent = menu.label;
      btn.dataset.index = String(i);

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this._isOpen && this._openMenuIndex === i) {
          this._close();
        } else {
          this._openMenu(i, btn);
        }
      });

      btn.addEventListener('mouseenter', () => {
        if (this._isOpen && this._openMenuIndex !== i) {
          this._openMenu(i, btn);
        }
      });

      this.container.appendChild(btn);
    });
  }

  private _openMenu(index: number, anchorEl: HTMLElement): void {
    this._close();

    const menu = this.menus[index];
    if (!menu) return;

    this._openMenuIndex = index;
    this._isOpen = true;

    const items = this.container.querySelectorAll('.menu-bar-item');
    items.forEach((el, i) => el.classList.toggle('active', i === index));

    this._dropdownEl = document.createElement('div');
    this._dropdownEl.className = 'menu-dropdown';

    for (const item of menu.items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'menu-dropdown-separator';
        this._dropdownEl.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'menu-dropdown-item';
      if (item.disabled) row.classList.add('disabled');

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'menu-dropdown-icon';
        iconSpan.innerHTML = item.icon;
        row.appendChild(iconSpan);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'menu-dropdown-icon';
        row.appendChild(spacer);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'menu-dropdown-label';
      labelSpan.textContent = item.label || '';
      row.appendChild(labelSpan);

      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'menu-dropdown-shortcut';
        shortcutSpan.textContent = item.shortcut;
        row.appendChild(shortcutSpan);
      }

      if (item.submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'menu-dropdown-arrow';
        arrow.textContent = '\u25B6';
        row.appendChild(arrow);
      }

      if (!item.disabled && item.action) {
        const action = item.action;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this._close();
          action();
        });
      }

      if (item.submenu && !item.disabled) {
        const submenu = item.submenu;
        row.addEventListener('mouseenter', () => {
          this._removeSubmenus();
          this._showSubmenu(row, submenu);
        });
        row.addEventListener('mouseleave', (e: MouseEvent) => {
          const related = e.relatedTarget as HTMLElement | null;
          if (!related || !related.closest('.menu-submenu')) {
            setTimeout(() => {
              if (!row.matches(':hover') && !document.querySelector('.menu-submenu:hover')) {
                this._removeSubmenus();
              }
            }, 100);
          }
        });
      }

      this._dropdownEl.appendChild(row);
    }

    document.body.appendChild(this._dropdownEl);

    const rect = anchorEl.getBoundingClientRect();
    this._dropdownEl.style.left = rect.left + 'px';
    this._dropdownEl.style.top = rect.bottom + 'px';

    const ddRect = this._dropdownEl.getBoundingClientRect();
    if (ddRect.right > window.innerWidth - 4) {
      this._dropdownEl.style.left = (window.innerWidth - ddRect.width - 4) + 'px';
    }

    setTimeout(() => {
      document.addEventListener('mousedown', this._onDocClick);
      document.addEventListener('keydown', this._onDocKeyDown);
    }, 0);
  }

  private _showSubmenu(parentRow: HTMLElement, items: MenuItem[]): void {
    const sub = document.createElement('div');
    sub.className = 'menu-dropdown menu-submenu';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'menu-dropdown-separator';
        sub.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'menu-dropdown-item';
      if (item.disabled) row.classList.add('disabled');

      const spacer = document.createElement('span');
      spacer.className = 'menu-dropdown-icon';
      if (item.icon) spacer.innerHTML = item.icon;
      row.appendChild(spacer);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'menu-dropdown-label';
      labelSpan.textContent = item.label || '';
      row.appendChild(labelSpan);

      if (!item.disabled && item.action) {
        const action = item.action;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this._close();
          action();
        });
      }

      sub.appendChild(row);
    }

    document.body.appendChild(sub);

    const parentRect = parentRow.getBoundingClientRect();
    let left = parentRect.right + 2;
    let top = parentRect.top;

    sub.style.display = 'block';
    const subW = sub.offsetWidth;
    const subH = sub.offsetHeight;

    if (left + subW > window.innerWidth - 4) left = parentRect.left - subW - 2;
    if (top + subH > window.innerHeight - 4) top = window.innerHeight - subH - 4;

    sub.style.left = left + 'px';
    sub.style.top = top + 'px';
  }

  private _removeSubmenus(): void {
    document.querySelectorAll('.menu-submenu').forEach(el => el.remove());
  }

  _close(): void {
    if (this._dropdownEl) {
      this._dropdownEl.remove();
      this._dropdownEl = null;
    }
    this._removeSubmenus();
    this._isOpen = false;
    this._openMenuIndex = -1;

    const items = this.container.querySelectorAll('.menu-bar-item');
    items.forEach(el => el.classList.remove('active'));

    document.removeEventListener('mousedown', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeyDown);
  }

  private _onDocClick(e: MouseEvent): void {
    if (this.container.contains(e.target as Node)) return;
    if (this._dropdownEl && this._dropdownEl.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('.menu-submenu')) return;
    this._close();
  }

  private _onDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this._close();
    }
  }
}

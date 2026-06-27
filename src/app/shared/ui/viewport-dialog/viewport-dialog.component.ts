import { CommonModule, NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-viewport-dialog',
  standalone: true,
  imports: [CommonModule, NgClass],
  template: `
    <div class="viewport-dialog">
      <div
        class="viewport-dialog__backdrop"
        [ngClass]="backdropClass"
        aria-hidden="true"
        (click)="backdropClick.emit()"></div>

      <div
        class="viewport-dialog__panel"
        [ngClass]="panelClass"
        [attr.role]="role"
        aria-modal="true"
        [attr.aria-labelledby]="labelledBy || null"
        [attr.aria-label]="ariaLabel || null">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: block;
    }

    .viewport-dialog {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: clamp(1rem, 3vw, 2rem);
      overflow: auto;
      overscroll-behavior: contain;
      isolation: isolate;
    }

    .viewport-dialog__backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.68);
      backdrop-filter: blur(10px);
    }

    .viewport-dialog__panel {
      position: relative;
      z-index: 1;
      inline-size: min(760px, 100%);
      max-inline-size: 100%;
      max-block-size: calc(100dvh - 2rem);
      overflow: auto;
      box-sizing: border-box;
    }
  `]
})
export class ViewportDialogComponent {
  @Input() panelClass: string | string[] | Set<string> | Record<string, boolean> = '';
  @Input() backdropClass: string | string[] | Set<string> | Record<string, boolean> = '';
  @Input() labelledBy = '';
  @Input() ariaLabel = '';
  @Input() role = 'dialog';

  @Output() readonly backdropClick = new EventEmitter<void>();
}

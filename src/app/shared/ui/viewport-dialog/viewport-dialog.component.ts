import { DOCUMENT, CommonModule, NgClass } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, Renderer2, inject } from '@angular/core';

type ScrollLockState = {
  scrollX: number;
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  htmlOverflow: string;
};

let activeScrollLocks = 0;
let savedScrollLockState: ScrollLockState | null = null;

function lockDocumentScroll(doc: Document): void {
  if (typeof window === 'undefined' || activeScrollLocks > 0) {
    activeScrollLocks += 1;
    return;
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const scrollbarWidth = Math.max(0, window.innerWidth - doc.documentElement.clientWidth);
  const bodyStyle = doc.body.style;
  const htmlStyle = doc.documentElement.style;

  savedScrollLockState = {
    scrollX,
    scrollY,
    bodyOverflow: bodyStyle.overflow,
    bodyPosition: bodyStyle.position,
    bodyTop: bodyStyle.top,
    bodyLeft: bodyStyle.left,
    bodyRight: bodyStyle.right,
    bodyWidth: bodyStyle.width,
    bodyPaddingRight: bodyStyle.paddingRight,
    htmlOverflow: htmlStyle.overflow
  };

  htmlStyle.overflow = 'hidden';
  bodyStyle.overflow = 'hidden';
  bodyStyle.position = 'fixed';
  bodyStyle.top = `-${scrollY}px`;
  bodyStyle.left = '0';
  bodyStyle.right = '0';
  bodyStyle.width = '100%';
  bodyStyle.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : bodyStyle.paddingRight;

  activeScrollLocks = 1;
}

function unlockDocumentScroll(doc: Document): void {
  if (activeScrollLocks === 0) {
    return;
  }

  activeScrollLocks -= 1;
  if (activeScrollLocks > 0 || typeof window === 'undefined' || !savedScrollLockState) {
    return;
  }

  const state = savedScrollLockState;
  const bodyStyle = doc.body.style;
  const htmlStyle = doc.documentElement.style;

  htmlStyle.overflow = state.htmlOverflow;
  bodyStyle.overflow = state.bodyOverflow;
  bodyStyle.position = state.bodyPosition;
  bodyStyle.top = state.bodyTop;
  bodyStyle.left = state.bodyLeft;
  bodyStyle.right = state.bodyRight;
  bodyStyle.width = state.bodyWidth;
  bodyStyle.paddingRight = state.bodyPaddingRight;
  if (!/jsdom/i.test(window.navigator.userAgent)) {
    window.scrollTo(state.scrollX, state.scrollY);
  }

  savedScrollLockState = null;
}

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
export class ViewportDialogComponent implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private movedHost = false;

  @Input() panelClass: string | string[] | Set<string> | Record<string, boolean> = '';
  @Input() backdropClass: string | string[] | Set<string> | Record<string, boolean> = '';
  @Input() labelledBy = '';
  @Input() ariaLabel = '';
  @Input() role = 'dialog';
  @Input() lockScroll = false;

  @Output() readonly backdropClick = new EventEmitter<void>();

  ngAfterViewInit(): void {
    const host = this.elementRef.nativeElement;
    if (this.document?.body && host.parentNode !== this.document.body) {
      this.renderer.appendChild(this.document.body, host);
      this.movedHost = true;
    }

    if (this.lockScroll && this.document?.body) {
      lockDocumentScroll(this.document);
    }
  }

  ngOnDestroy(): void {
    if (this.lockScroll && this.document?.body) {
      unlockDocumentScroll(this.document);
    }

    if (this.movedHost) {
      this.elementRef.nativeElement.remove();
    }
  }
}

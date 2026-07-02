import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardSkeletonLoaderComponent } from './card-skeleton-loader.component';

describe('CardSkeletonLoaderComponent', () => {
  let fixture: ComponentFixture<CardSkeletonLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardSkeletonLoaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CardSkeletonLoaderComponent);
  });

  it('renders static skeleton cards without pulse classes', () => {
    fixture.componentInstance.count = 2;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.animate-pulse').length).toBe(0);
    expect(root.querySelectorAll('.app-dashboard-panel').length).toBe(2);
  });
});

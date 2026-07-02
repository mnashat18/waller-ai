import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TableSkeletonLoaderComponent } from './table-skeleton-loader.component';

describe('TableSkeletonLoaderComponent', () => {
  let fixture: ComponentFixture<TableSkeletonLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableSkeletonLoaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TableSkeletonLoaderComponent);
  });

  it('renders static table skeleton blocks without pulse classes', () => {
    fixture.componentInstance.rows = 2;
    fixture.componentInstance.columns = 3;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.animate-pulse').length).toBe(0);
    expect(root.querySelectorAll('.app-table-shell').length).toBe(1);
    expect(root.querySelectorAll('.grid .h-4').length).toBeGreaterThan(0);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeeklyChartComponent } from './weekly-chart';

describe('WeeklyChartComponent', () => {
  let component: WeeklyChartComponent;
  let fixture: ComponentFixture<WeeklyChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeeklyChartComponent]
    })
    .compileComponents();

    WeeklyChartComponent.prototype.ngAfterViewInit = () => undefined;
    fixture = TestBed.createComponent(WeeklyChartComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

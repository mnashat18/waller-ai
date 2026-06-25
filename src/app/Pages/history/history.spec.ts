import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { DashboardService } from '../../services/dashboard.service';
import { History } from './history';

describe('History', () => {
  let component: History;
  let fixture: ComponentFixture<History>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [History],
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: {
            getScanResultsAccessInfo: () => of({ state: 'available', message: null, missingFields: [] }),
            getScanResults: () => of([])
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(History);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

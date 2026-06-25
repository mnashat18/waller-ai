import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { SubscriptionService } from '../../services/subscription.service';
import { SidebarComponent } from './sidebar';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    const context = {
      activeBusinessProfileName: null,
      activeBusinessProfileId: null,
      activeDepartmentId: null,
      activeMemberRole: null,
      availableCompanies: []
    };

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of(null),
            state$: of({ loading: false, error: null, context })
          }
        },
        {
          provide: SubscriptionService,
          useValue: { snapshotRefreshEvents: () => of(null) }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

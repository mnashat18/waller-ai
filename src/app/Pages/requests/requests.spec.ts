import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { RequestsPageComponent } from './requests';

describe('RequestsPageComponent', () => {
  let component: RequestsPageComponent;
  let fixture: ComponentFixture<RequestsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestsPageComponent],
      providers: [
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of({ context: { activeBusinessProfileId: 'profile-1' } }),
            snapshot: () => ({ context: { activeBusinessProfileId: 'profile-1' } })
          }
        },
        {
          provide: OperationsWorkflowsService,
          useValue: {
            getRequestsPageData: () => of({
              summary: { pending: 0, overdue: 0, dueToday: 0, completedOrClosed: 0 },
              requests: [],
              departments: [],
              requestTypes: []
            })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RequestsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

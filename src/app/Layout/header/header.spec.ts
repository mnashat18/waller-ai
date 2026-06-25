import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { HeaderComponent } from './header';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    const context = {
      activeBusinessProfileName: null,
      activeBusinessProfileId: null,
      activeDepartmentId: null,
      activeMemberRole: null,
      availableCompanies: []
    };

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: () => undefined } },
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of(null),
            state$: of({ loading: false, error: null, context }),
            snapshot: () => ({ loading: false, error: null, context })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

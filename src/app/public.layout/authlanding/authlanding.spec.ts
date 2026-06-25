import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { Authlanding } from './authlanding';

describe('Authlanding', () => {
  let component: Authlanding;
  let fixture: ComponentFixture<Authlanding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Authlanding],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            signup: () => undefined,
            login: () => undefined,
            loginWithGoogle: () => undefined,
            setPostAuthRedirect: () => undefined
          }
        },
        {
          provide: InviteService,
          useValue: {
            getPendingInviteToken: () => null,
            setPendingInviteToken: () => undefined
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: { resolveDestination: () => Promise.resolve('/app/workspace-access') }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Authlanding);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { SignupComponent } from './signup';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';

const queryParamMap = {
  get: () => null,
  has: () => false
};

const authServiceMock = {
  consumeAuthNotice: () => null,
  isLoggedIn: () => false,
  signup: () => ({
    pipe: () => ({
      subscribe: () => undefined
    })
  }),
  login: () => ({
    subscribe: () => undefined
  })
};

const inviteServiceMock = {
  getPendingInviteToken: () => null,
  setPendingInviteToken: () => undefined
};

const postLoginRoutingMock = {
  resolveDestination: () => Promise.resolve('/app/workspace-access')
};

describe('Signup', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignupComponent, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap } } },
        { provide: AuthService, useValue: authServiceMock },
        { provide: InviteService, useValue: inviteServiceMock },
        { provide: PostLoginRoutingService, useValue: postLoginRoutingMock }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

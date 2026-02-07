import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Verifyemail } from './verifyemail';

describe('Verifyemail', () => {
  let component: Verifyemail;
  let fixture: ComponentFixture<Verifyemail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Verifyemail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Verifyemail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

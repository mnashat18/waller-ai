import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Authlanding } from './authlanding';

describe('Authlanding', () => {
  let component: Authlanding;
  let fixture: ComponentFixture<Authlanding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Authlanding]
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

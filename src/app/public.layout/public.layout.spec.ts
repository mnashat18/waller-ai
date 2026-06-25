import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PublicLayout } from './public.layout';

describe('PublicLayout', () => {
  let component: PublicLayout;
  let fixture: ComponentFixture<PublicLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLayout],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PublicLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

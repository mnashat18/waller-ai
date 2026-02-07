import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateRequestModal } from './create-request-modal';

describe('CreateRequestModal', () => {
  let component: CreateRequestModal;
  let fixture: ComponentFixture<CreateRequestModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateRequestModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateRequestModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

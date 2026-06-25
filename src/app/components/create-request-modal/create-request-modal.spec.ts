import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateRequestModalComponent } from './create-request-modal';

describe('CreateRequestModal', () => {
  let component: CreateRequestModalComponent;
  let fixture: ComponentFixture<CreateRequestModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateRequestModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateRequestModalComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

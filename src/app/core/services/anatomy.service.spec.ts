import { TestBed } from '@angular/core/testing';

import { AnatomyService } from './anatomy.service';

describe('AnatomyService', () => {
  let service: AnatomyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnatomyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

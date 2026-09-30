import { FormControl, FormGroup } from '@angular/forms';
import { inclusiveDays, nonNegativeDays, startNotAfterEnd } from './leave-request-form.validators';

describe('leave request date rules', () => {
  function dates(startDate: string, endDate: string): FormGroup {
    return new FormGroup({
      startDate: new FormControl(startDate),
      endDate: new FormControl(endDate),
    });
  }

  it('counts the start and end dates as one day when they are the same', () => {
    expect(inclusiveDays('2026-03-01', '2026-03-01')).toBe(1);
    expect(startNotAfterEnd(dates('2026-03-01', '2026-03-01'))).toBeNull();
    expect(nonNegativeDays(dates('2026-03-01', '2026-03-01'))).toBeNull();
  });

  it('rejects a start date later than the end date', () => {
    expect(startNotAfterEnd(dates('2026-03-02', '2026-03-01'))).toEqual({ startAfterEnd: true });
  });

  it('rejects a negative day count when the start date is more than one day after the end', () => {
    expect(inclusiveDays('2026-03-03', '2026-03-01')).toBe(-1);
    expect(nonNegativeDays(dates('2026-03-03', '2026-03-01'))).toEqual({ negativeDays: true });
  });

  it('treats an end date one day earlier as zero days, which is not negative', () => {
    expect(inclusiveDays('2026-03-02', '2026-03-01')).toBe(0);
    expect(nonNegativeDays(dates('2026-03-02', '2026-03-01'))).toBeNull();
  });
});

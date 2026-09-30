import { FormControl, FormGroup } from '@angular/forms';
import {
  atLeastOneWorkingDay,
  datesNotInPast,
  nonNegativeDays,
  startNotAfterEnd,
  workingDays,
} from './leave-request-form.validators';

describe('leave request date rules', () => {
  function dates(startDate: string, endDate: string): FormGroup {
    return new FormGroup({
      startDate: new FormControl(startDate),
      endDate: new FormControl(endDate),
    });
  }

  it('counts a Sunday as one working day', () => {
    expect(workingDays('2026-03-01', '2026-03-01')).toBe(1);
    expect(startNotAfterEnd(dates('2026-03-01', '2026-03-01'))).toBeNull();
    expect(nonNegativeDays(dates('2026-03-01', '2026-03-01'))).toBeNull();
  });

  it('skips Friday and Saturday', () => {
    expect(workingDays('2026-03-01', '2026-03-05')).toBe(5);
    expect(workingDays('2026-03-06', '2026-03-08')).toBe(1);
    expect(atLeastOneWorkingDay(dates('2026-03-06', '2026-03-07'))).toEqual({ noWorkingDay: true });
  });

  it('rejects a start date later than the end date', () => {
    expect(startNotAfterEnd(dates('2026-03-03', '2026-03-01'))).toEqual({ startAfterEnd: true });
    expect(workingDays('2026-03-03', '2026-03-01')).toBe(-3);
    expect(nonNegativeDays(dates('2026-03-03', '2026-03-01'))).toEqual({ negativeDays: true });
  });

  it('rejects a date before today', () => {
    expect(datesNotInPast('2026-09-30')(dates('2026-09-29', '2026-10-04'))).toEqual({ startInPast: true });
    expect(datesNotInPast('2026-09-30')(dates('2026-10-04', '2026-10-06'))).toBeNull();
  });
});

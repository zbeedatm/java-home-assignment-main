import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Local calendar date, YYYY-MM-DD. */
export function todayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Working days from Sunday through Thursday, inclusive.
 * Friday and Saturday are not counted. A reversed range returns a negative count.
 */
export function workingDays(startDate: string, endDate: string): number {
  const reversed = startDate > endDate;
  const [from, to] = reversed ? [endDate, startDate] : [startDate, endDate];
  let count = 0;
  for (let time = utcTime(from); time <= utcTime(to); time += 86_400_000) {
    const day = new Date(time).getUTCDay();
    if (day !== 5 && day !== 6) {
      count++;
    }
  }
  return reversed ? -count : count;
}

export function startNotAfterEnd(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  if (!start || !end) {
    return null;
  }
  return start > end ? { startAfterEnd: true } : null;
}

export function nonNegativeDays(group: AbstractControl): ValidationErrors | null {
  const days = dayCount(group);
  return days !== null && days < 0 ? { negativeDays: true } : null;
}

export function atLeastOneWorkingDay(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  if (!start || !end || start > end) {
    return null;
  }
  return workingDays(start, end) < 1 ? { noWorkingDay: true } : null;
}

export function datesNotInPast(today: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const start = group.get('startDate')?.value;
    const end = group.get('endDate')?.value;
    const errors: ValidationErrors = {};
    if (start && start < today) {
      errors['startInPast'] = true;
    }
    if (end && end < today) {
      errors['endInPast'] = true;
    }
    return Object.keys(errors).length ? errors : null;
  };
}

function dayCount(group: AbstractControl): number | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  if (!start || !end) {
    return null;
  }
  return workingDays(start, end);
}

function utcTime(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

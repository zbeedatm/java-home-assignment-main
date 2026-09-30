import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Inclusive day count, matching the backend: end - start + 1. */
export function inclusiveDays(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000) + 1;
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
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  if (!start || !end) {
    return null;
  }
  return inclusiveDays(start, end) < 0 ? { negativeDays: true } : null;
}

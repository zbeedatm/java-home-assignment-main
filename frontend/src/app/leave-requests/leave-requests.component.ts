import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Employee, LeaveRequest } from '../models/leave-request.model';
import {
  atLeastOneWorkingDay,
  datesNotInPast,
  nonNegativeDays,
  startNotAfterEnd,
  todayIso,
  workingDays,
} from './leave-request-form.validators';

// NOTE: This component was written quickly for a POC.
// It talks to the API directly, manages state by hand and uses `any` everywhere.
@Component({
  selector: 'app-leave-requests',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './leave-requests.component.html',
  styleUrls: ['./leave-requests.component.css']
})
export class LeaveRequestsComponent implements OnInit, OnDestroy {
  requests: any[] = [];
  employees: Employee[] = [];
  loading = false;
  submitting = false;
  submitted = false;
  serverError = '';
  successMessage = '';
  approvingIds = new Set<number>();
  approvalNotices: { [id: number]: { kind: 'success' | 'error'; text: string } } = {};
  readonly today = todayIso();
  readonly leaveTypes = [
    { value: 0, label: 'Vacation' },
    { value: 1, label: 'Sick' },
    { value: 2, label: 'Unpaid' },
  ];
  readonly form: FormGroup;

  private apiUrl = 'http://localhost:5080/api/leave-requests';
  private employeesUrl = 'http://localhost:5080/api/employees';
  private formChanges?: Subscription;

  constructor(private http: HttpClient, formBuilder: FormBuilder) {
    this.form = formBuilder.group({
      employeeId: [null, Validators.required],
      type: [null, Validators.required],
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
    }, { validators: [startNotAfterEnd, nonNegativeDays, atLeastOneWorkingDay, datesNotInPast(this.today)] });
  }

  ngOnInit(): void {
    this.formChanges = this.form.valueChanges.subscribe(() => {
      this.serverError = '';
      this.successMessage = '';
    });
    this.load();
    this.http.get<Employee[]>(this.employeesUrl).subscribe({
      next: (employees) => this.employees = employees,
      error: () => this.serverError = 'Could not load employees.',
    });
  }

  ngOnDestroy(): void {
    this.formChanges?.unsubscribe();
  }

  get dayCount(): number | null {
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    if (!startDate || !endDate) {
      return null;
    }
    return workingDays(startDate, endDate);
  }

  get endMin(): string {
    const startDate = this.form.get('startDate')?.value;
    return startDate && startDate > this.today ? startDate : this.today;
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitted);
  }

  showDateOrderError(): boolean {
    return this.form.hasError('startAfterEnd') && this.datesChecked();
  }

  showNegativeDaysError(): boolean {
    return this.form.hasError('negativeDays') && this.datesChecked();
  }

  showNoWorkingDayError(): boolean {
    return this.form.hasError('noWorkingDay') && this.datesChecked();
  }

  showStartPastError(): boolean {
    return this.form.hasError('startInPast') && this.datesChecked();
  }

  showEndPastError(): boolean {
    return this.form.hasError('endInPast') && this.datesChecked();
  }

  submit(): void {
    this.submitted = true;
    this.serverError = '';
    this.successMessage = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const { employeeId, type, startDate, endDate } = this.form.value;
    this.http.post(this.apiUrl, { employeeId, type, startDate, endDate }).subscribe({
      next: () => {
        this.submitting = false;
        this.submitted = false;
        this.form.reset({ employeeId: null, type: null, startDate: '', endDate: '' });
        this.successMessage = 'Request submitted.';
        this.load();
      },
      error: (error) => {
        this.submitting = false;
        this.serverError = typeof error.error === 'string' && error.error
          ? error.error
          : 'Could not submit the request.';
      },
    });
  }

  private datesChecked(): boolean {
    const start = this.form.get('startDate');
    const end = this.form.get('endDate');
    return this.submitted || !!start?.touched || !!end?.touched;
  }

  load(): void {
    this.loading = true;
    this.http.get<any>(this.apiUrl).subscribe((data) => {
      this.requests = data;
      this.loading = false;
    });
  }

  isApproving(id: number): boolean {
    return this.approvingIds.has(id);
  }

  approve(id: number): void {
    if (this.approvingIds.has(id)) {
      return;
    }

    this.approvingIds = new Set(this.approvingIds).add(id);
    const notices = { ...this.approvalNotices };
    delete notices[id];
    this.approvalNotices = notices;

    this.http.post<LeaveRequest>(this.apiUrl + '/' + id + '/approve', {}).subscribe({
      next: (updated) => {
        this.finishApproving(id);
        this.requests = this.requests.map((request) =>
          request.id === updated.id
            ? { ...request, ...updated, employee: updated.employee ?? request.employee }
            : request);
        this.approvalNotices = {
          ...this.approvalNotices,
          [id]: { kind: 'success', text: 'Request approved.' },
        };
      },
      error: (error) => {
        this.finishApproving(id);
        const message = typeof error.error === 'string' && error.error
          ? error.error
          : 'Could not approve the request.';
        this.approvalNotices = {
          ...this.approvalNotices,
          [id]: { kind: 'error', text: message },
        };
      },
    });
  }

  private finishApproving(id: number): void {
    const approvingIds = new Set(this.approvingIds);
    approvingIds.delete(id);
    this.approvingIds = approvingIds;
  }

  typeLabel(type: number): string {
    if (type == 0) return 'Vacation';
    if (type == 1) return 'Sick';
    return 'Unpaid';
  }

  statusLabel(status: number): string {
    if (status == 0) return 'Pending';
    if (status == 1) return 'Approved';
    return 'Rejected';
  }
}

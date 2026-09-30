import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, Subject, catchError, finalize, switchMap } from 'rxjs';
import {
  ApprovalNotice,
  CreateLeaveRequest,
  Employee,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from '../models/leave-request.model';
import { LeaveApiService } from './leave-api.service';
import {
  atLeastOneWorkingDay,
  datesNotInPast,
  nonNegativeDays,
  startNotAfterEnd,
  todayIso,
  workingDays,
} from './leave-request-form.validators';

@Component({
  selector: 'app-leave-requests',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './leave-requests.component.html',
  styleUrls: ['./leave-requests.component.css']
})
export class LeaveRequestsComponent implements OnInit {
  requests: LeaveRequest[] = [];
  employees: Employee[] = [];
  loading = false;
  submitting = false;
  submitted = false;
  serverError = '';
  successMessage = '';
  approvingIds = new Set<number>();
  approvalNotices: { [id: number]: ApprovalNotice } = {};
  readonly pendingStatus = LeaveStatus.Pending;
  readonly today = todayIso();
  readonly leaveTypes: { value: LeaveType; label: string }[] = [
    { value: LeaveType.Vacation, label: 'Vacation' },
    { value: LeaveType.Sick, label: 'Sick' },
    { value: LeaveType.Unpaid, label: 'Unpaid' },
  ];
  readonly form: FormGroup<{
    employeeId: FormControl<number | null>;
    type: FormControl<LeaveType | null>;
    startDate: FormControl<string>;
    endDate: FormControl<string>;
  }>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(LeaveApiService);
  private readonly loadRequests = new Subject<void>();

  constructor(formBuilder: FormBuilder) {
    this.form = formBuilder.group({
      employeeId: formBuilder.control<number | null>(null, Validators.required),
      type: formBuilder.control<LeaveType | null>(null, Validators.required),
      startDate: formBuilder.nonNullable.control('', Validators.required),
      endDate: formBuilder.nonNullable.control('', Validators.required),
    }, { validators: [startNotAfterEnd, nonNegativeDays, atLeastOneWorkingDay, datesNotInPast(this.today)] });
  }

  ngOnInit(): void {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.serverError = '';
      this.successMessage = '';
    });

    this.loadRequests.pipe(
      switchMap(() => {
        this.loading = true;
        return this.api.list().pipe(
          catchError(() => {
            this.serverError = 'Could not load leave requests.';
            return EMPTY;
          }),
          finalize(() => this.loading = false),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(requests => this.requests = requests);

    this.load();
    this.api.employees().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: employees => this.employees = employees,
      error: () => this.serverError = 'Could not load employees.',
    });
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

    const value = this.form.getRawValue();
    if (value.employeeId == null || value.type == null) {
      return;
    }
    const request: CreateLeaveRequest = {
      employeeId: value.employeeId,
      type: value.type,
      startDate: value.startDate,
      endDate: value.endDate,
    };
    this.submitting = true;
    this.api.create(request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting = false;
        this.submitted = false;
        this.form.reset({ employeeId: null, type: null, startDate: '', endDate: '' });
        this.successMessage = 'Request submitted.';
        this.load();
      },
      error: (error: unknown) => {
        this.submitting = false;
        this.serverError = this.errorMessage(error, 'Could not submit the request.');
      },
    });
  }

  load(): void {
    this.loadRequests.next();
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

    this.api.approve(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.finishApproving(id);
        this.requests = this.requests.map(request =>
          request.id === updated.id
            ? { ...request, ...updated, employee: updated.employee ?? request.employee }
            : request);
        this.approvalNotices = {
          ...this.approvalNotices,
          [id]: { kind: 'success', text: 'Request approved.' },
        };
      },
      error: (error: unknown) => {
        this.finishApproving(id);
        this.approvalNotices = {
          ...this.approvalNotices,
          [id]: { kind: 'error', text: this.errorMessage(error, 'Could not approve the request.') },
        };
      },
    });
  }

  typeLabel(type: LeaveType): string {
    switch (type) {
      case LeaveType.Vacation: return 'Vacation';
      case LeaveType.Sick: return 'Sick';
      default: return 'Unpaid';
    }
  }

  statusLabel(status: LeaveStatus): string {
    switch (status) {
      case LeaveStatus.Pending: return 'Pending';
      case LeaveStatus.Approved: return 'Approved';
      default: return 'Rejected';
    }
  }

  private datesChecked(): boolean {
    const start = this.form.get('startDate');
    const end = this.form.get('endDate');
    return this.submitted || !!start?.touched || !!end?.touched;
  }

  private finishApproving(id: number): void {
    const approvingIds = new Set(this.approvingIds);
    approvingIds.delete(id);
    this.approvingIds = approvingIds;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error === 'string' && error.error) {
      return error.error;
    }
    return fallback;
  }
}

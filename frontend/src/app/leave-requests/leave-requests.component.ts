import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Employee } from '../models/leave-request.model';
import { inclusiveDays, nonNegativeDays, startNotAfterEnd } from './leave-request-form.validators';

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
    }, { validators: [startNotAfterEnd, nonNegativeDays] });
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
    return inclusiveDays(startDate, endDate);
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

  // Wired up by the candidate as part of the assignment.
  approve(id: number): void {
    // TODO (candidate): call POST /api/leave-requests/{id}/approve
    // and handle loading / error / success without a generic alert.
    this.http.post<any>(this.apiUrl + '/' + id + '/approve', {}).subscribe(() => {
      this.load();
    });
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

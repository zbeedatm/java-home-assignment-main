import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LeaveRequestsComponent } from './leave-requests.component';

describe('LeaveRequestsComponent form', () => {
  let fixture: ComponentFixture<LeaveRequestsComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeaveRequestsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LeaveRequestsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:5080/api/leave-requests').flush([]);
    http.expectOne('http://localhost:5080/api/employees').flush([
      { id: 1, name: 'Dana', annualQuota: 20 },
    ]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function submit(): void {
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
  }

  it('requires a leave type and does not submit', () => {
    submit();

    expect(fixture.nativeElement.textContent).toContain('Select a leave type.');
    http.expectNone(request => request.method === 'POST');
  });

  it('rejects a start date later than the end date when that also makes the day count negative', () => {
    fixture.componentInstance.form.setValue({
      employeeId: 1,
      type: 0,
      startDate: '2026-03-03',
      endDate: '2026-03-01',
    });

    submit();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Start date cannot be later than the end date.');
    expect(text).toContain('Number of days cannot be negative.');
    expect(text).toContain('-1');
    http.expectNone(request => request.method === 'POST');
  });

  it('submits when the type is chosen and the dates are in order', () => {
    fixture.componentInstance.form.setValue({
      employeeId: 1,
      type: 0,
      startDate: '2026-03-01',
      endDate: '2026-03-03',
    });

    submit();

    const post = http.expectOne(request =>
      request.method === 'POST' && request.url === 'http://localhost:5080/api/leave-requests');
    expect(post.request.body).toEqual({
      employeeId: 1,
      type: 0,
      startDate: '2026-03-01',
      endDate: '2026-03-03',
    });
    post.flush({ id: 9 });
    http.expectOne(request =>
      request.method === 'GET' && request.url === 'http://localhost:5080/api/leave-requests').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Request submitted.');
    expect(fixture.nativeElement.textContent).not.toContain('Select a leave type.');
  });
});

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
      startDate: '2027-06-08',
      endDate: '2027-06-06',
    });

    submit();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Start date cannot be later than the end date.');
    expect(text).toContain('Number of days cannot be negative.');
    expect(text).toContain('-3');
    http.expectNone(request => request.method === 'POST');
  });

  it('submits when the type is chosen and the dates are in order', () => {
    fixture.componentInstance.form.setValue({
      employeeId: 1,
      type: 0,
      startDate: '2027-06-06',
      endDate: '2027-06-08',
    });

    submit();

    const post = http.expectOne(request =>
      request.method === 'POST' && request.url === 'http://localhost:5080/api/leave-requests');
    expect(post.request.body).toEqual({
      employeeId: 1,
      type: 0,
      startDate: '2027-06-06',
      endDate: '2027-06-08',
    });
    post.flush({ id: 9 });
    http.expectOne(request =>
      request.method === 'GET' && request.url === 'http://localhost:5080/api/leave-requests').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Request submitted.');
    expect(fixture.nativeElement.textContent).not.toContain('Select a leave type.');
  });

  it('updates only the approved row and shows success', () => {
    const component = fixture.componentInstance;
    component.requests = [
      { id: 4, employee: { name: 'Dana' }, type: 0, startDate: '2026-05-01', endDate: '2026-05-01', status: 0, days: 1 },
      { id: 5, employee: { name: 'Yossi' }, type: 1, startDate: '2026-06-01', endDate: '2026-06-01', status: 0, days: 1 },
    ];
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelectorAll('button.approve')[0] as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(button.textContent).toContain('Approving…');
    expect(button.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('button.approve').length).toBe(2);

    const post = http.expectOne('http://localhost:5080/api/leave-requests/4/approve');
    expect(post.request.method).toBe('POST');
    post.flush({ id: 4, employeeId: 1, employee: { id: 1, name: 'Dana', annualQuota: 20 }, type: 0, startDate: '2026-05-01', endDate: '2026-05-01', status: 1, days: 1 });
    fixture.detectChanges();

    http.expectNone(request => request.method === 'GET');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Approved');
    expect(text).toContain('Request approved.');
    expect(text).toContain('Yossi');
    expect(fixture.nativeElement.querySelectorAll('button.approve').length).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('keeps the row pending and shows the server error when approval is rejected', () => {
    const component = fixture.componentInstance;
    component.requests = [
      { id: 4, employee: { name: 'Dana' }, type: 0, startDate: '2026-05-01', endDate: '2026-05-01', status: 0, days: 1 },
    ];
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.approve') as HTMLButtonElement;
    button.click();
    const post = http.expectOne('http://localhost:5080/api/leave-requests/4/approve');
    post.flush('Leave request is already decided', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    http.expectNone(request => request.method === 'GET');
    expect(fixture.nativeElement.textContent).toContain('Leave request is already decided');
    expect(fixture.nativeElement.textContent).toContain('Pending');
    expect((fixture.nativeElement.querySelector('button.approve') as HTMLButtonElement).disabled).toBeFalse();
    expect(component.requests[0].status).toBe(0);
  });
});

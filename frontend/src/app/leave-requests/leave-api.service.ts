import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateLeaveRequest, Employee, LeaveRequest } from '../models/leave-request.model';

@Injectable({ providedIn: 'root' })
export class LeaveApiService {
  private readonly http = inject(HttpClient);
  private readonly requestsUrl = 'http://localhost:5080/api/leave-requests';
  private readonly employeesUrl = 'http://localhost:5080/api/employees';

  list(): Observable<LeaveRequest[]> {
    return this.http.get<LeaveRequest[]>(this.requestsUrl);
  }

  employees(): Observable<Employee[]> {
    return this.http.get<Employee[]>(this.employeesUrl);
  }

  create(request: CreateLeaveRequest): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(this.requestsUrl, request);
  }

  approve(id: number): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${this.requestsUrl}/${id}/approve`, {});
  }
}

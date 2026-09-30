package com.example.leavemanagement.service;

import com.example.leavemanagement.model.Employee;
import com.example.leavemanagement.model.LeaveRequest;
import com.example.leavemanagement.model.LeaveStatus;
import com.example.leavemanagement.model.LeaveType;
import com.example.leavemanagement.repository.EmployeeRepository;
import com.example.leavemanagement.repository.LeaveRequestRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeaveRequestService {

    private final EmployeeRepository employeeRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public LeaveRequestService(EmployeeRepository employeeRepository,
                               LeaveRequestRepository leaveRequestRepository) {
        this.employeeRepository = employeeRepository;
        this.leaveRequestRepository = leaveRequestRepository;
    }

    /**
     * Approves a pending request. The request row is locked first, then the employee row,
     * so two concurrent approvals cannot both pass the quota check.
     */
    @Transactional
    public ResponseEntity<?> approve(Long id) {
        LeaveRequest request = leaveRequestRepository.findByIdForUpdate(id).orElse(null);
        if (request == null) {
            return ResponseEntity.status(404).body("Leave request not found");
        }
        if (request.getStatus() != LeaveStatus.PENDING) {
            return ResponseEntity.status(409).body("Leave request is already decided");
        }

        if (request.getType() == LeaveType.VACATION) {
            Employee employee = employeeRepository.findByIdForUpdate(request.getEmployeeId()).orElse(null);
            if (employee == null) {
                return ResponseEntity.status(404).body("Employee not found");
            }

            int used = leaveRequestRepository
                    .findByEmployeeIdAndTypeAndStatus(request.getEmployeeId(), LeaveType.VACATION, LeaveStatus.APPROVED)
                    .stream()
                    .mapToInt(LeaveRequest::getDays)
                    .sum();

            if (used + request.getDays() > employee.getAnnualQuota()) {
                return ResponseEntity.badRequest().body("Not enough vacation balance");
            }
        }

        request.setStatus(LeaveStatus.APPROVED);
        return ResponseEntity.ok(leaveRequestRepository.save(request));
    }
}

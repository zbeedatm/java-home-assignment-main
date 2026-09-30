package com.example.leavemanagement.service;

import com.example.leavemanagement.dto.CreateLeaveRequestDto;
import com.example.leavemanagement.model.Employee;
import com.example.leavemanagement.model.LeaveRequest;
import com.example.leavemanagement.model.LeaveStatus;
import com.example.leavemanagement.model.LeaveType;
import com.example.leavemanagement.repository.EmployeeRepository;
import com.example.leavemanagement.repository.LeaveRequestRepository;
import com.example.leavemanagement.service.LeaveRequestException.Code;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class LeaveRequestService {

    private final EmployeeRepository employeeRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public LeaveRequestService(EmployeeRepository employeeRepository,
                               LeaveRequestRepository leaveRequestRepository) {
        this.employeeRepository = employeeRepository;
        this.leaveRequestRepository = leaveRequestRepository;
    }

    public List<LeaveRequest> list() {
        return leaveRequestRepository.findAllByOrderByStartDateDesc();
    }

    public List<LeaveRequest> searchByEmployeeName(String name) {
        return leaveRequestRepository.findByEmployeeNameContaining(name);
    }

    @Transactional
    public LeaveRequest create(CreateLeaveRequestDto dto) {
        Employee employee = employeeRepository.findById(dto.getEmployeeId())
                .orElseThrow(() -> new LeaveRequestException(Code.NOT_FOUND, "Employee not found"));

        int days = (int) ChronoUnit.DAYS.between(dto.getStartDate(), dto.getEndDate()) + 1;
        if (dto.getType() == LeaveType.VACATION && approvedVacationDays(dto.getEmployeeId()) + days > employee.getAnnualQuota()) {
            throw new LeaveRequestException(Code.BAD_REQUEST, "Not enough vacation balance");
        }

        LeaveRequest request = new LeaveRequest();
        request.setEmployeeId(dto.getEmployeeId());
        request.setType(dto.getType());
        request.setStartDate(dto.getStartDate());
        request.setEndDate(dto.getEndDate());
        request.setDays(days);
        request.setStatus(LeaveStatus.PENDING);
        return leaveRequestRepository.save(request);
    }

    /**
     * Approves a pending request. The request row is locked first, then the employee row,
     * so two concurrent approvals cannot both pass the quota check.
     */
    @Transactional
    public LeaveRequest approve(Long id) {
        LeaveRequest request = leaveRequestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new LeaveRequestException(Code.NOT_FOUND, "Leave request not found"));
        if (request.getStatus() != LeaveStatus.PENDING) {
            throw new LeaveRequestException(Code.CONFLICT, "Leave request is already decided");
        }

        if (request.getType() == LeaveType.VACATION) {
            Employee employee = employeeRepository.findByIdForUpdate(request.getEmployeeId())
                    .orElseThrow(() -> new LeaveRequestException(Code.NOT_FOUND, "Employee not found"));
            if (approvedVacationDays(request.getEmployeeId()) + request.getDays() > employee.getAnnualQuota()) {
                throw new LeaveRequestException(Code.BAD_REQUEST, "Not enough vacation balance");
            }
        }

        request.setStatus(LeaveStatus.APPROVED);
        return leaveRequestRepository.save(request);
    }

    private int approvedVacationDays(Long employeeId) {
        return leaveRequestRepository
                .findByEmployeeIdAndTypeAndStatus(employeeId, LeaveType.VACATION, LeaveStatus.APPROVED)
                .stream()
                .mapToInt(LeaveRequest::getDays)
                .sum();
    }
}

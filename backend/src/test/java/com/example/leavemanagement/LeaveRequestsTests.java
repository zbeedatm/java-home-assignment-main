package com.example.leavemanagement;

import com.example.leavemanagement.controller.LeaveRequestsController;
import com.example.leavemanagement.dto.CreateLeaveRequestDto;
import com.example.leavemanagement.model.Employee;
import com.example.leavemanagement.model.LeaveRequest;
import com.example.leavemanagement.model.LeaveStatus;
import com.example.leavemanagement.model.LeaveType;
import com.example.leavemanagement.repository.EmployeeRepository;
import com.example.leavemanagement.repository.LeaveRequestRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;

// Runs against a real, throwaway PostgreSQL started by Testcontainers.
// (Docker must be available on the machine running the tests.)
@SpringBootTest
@Testcontainers
class LeaveRequestsTests {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private LeaveRequestsController controller;

    @Autowired
    private EmployeeRepository employees;

    @Autowired
    private LeaveRequestRepository leaveRequests;

    @Test
    void create_WithinQuota_Succeeds() {
        // Arrange
        Employee emp = new Employee();
        emp.setName("Test Emp");
        emp.setAnnualQuota(20);
        employees.save(emp);

        long before = leaveRequests.count();

        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(emp.getId());
        dto.setType(LeaveType.VACATION);
        LocalDate start = onOrAfter(DayOfWeek.SUNDAY);
        dto.setStartDate(start);
        dto.setEndDate(start.plusDays(2)); // Sunday–Tuesday: 3 working days

        // Act
        ResponseEntity<?> result = controller.create(dto);

        // Assert
        assertTrue(result.getStatusCode().is2xxSuccessful());
        assertEquals(3, ((LeaveRequest) result.getBody()).getDays());
        assertEquals(before + 1, leaveRequests.count());
    }

    @Test
    void create_ExceedingRemainingBalance_IsRejected() {
        Employee emp = new Employee();
        emp.setName("Almost Out");
        emp.setAnnualQuota(20);
        employees.save(emp);

        LeaveRequest approved = new LeaveRequest();
        approved.setEmployeeId(emp.getId());
        approved.setType(LeaveType.VACATION);
        approved.setStartDate(LocalDate.of(2026, 1, 6));
        approved.setEndDate(LocalDate.of(2026, 1, 23));
        approved.setDays(18);
        approved.setStatus(LeaveStatus.APPROVED);
        leaveRequests.save(approved);

        long before = leaveRequests.count();

        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(emp.getId());
        dto.setType(LeaveType.VACATION);
        LocalDate start = onOrAfter(DayOfWeek.SUNDAY);
        dto.setStartDate(start);
        dto.setEndDate(start.plusDays(2)); // 3 working days; 18 + 3 exceeds the quota of 20

        ResponseEntity<?> result = controller.create(dto);

        assertEquals(400, result.getStatusCode().value());
        assertEquals(before, leaveRequests.count());
    }

    @Test
    void create_FridayThroughSunday_CountsOnlySunday() {
        Employee emp = employee(20);
        LocalDate friday = onOrAfter(DayOfWeek.FRIDAY);

        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(emp.getId());
        dto.setType(LeaveType.SICK);
        dto.setStartDate(friday);
        dto.setEndDate(friday.plusDays(2));

        ResponseEntity<?> result = controller.create(dto);

        assertTrue(result.getStatusCode().is2xxSuccessful());
        assertEquals(1, ((LeaveRequest) result.getBody()).getDays());
    }

    @Test
    void create_PastStartDate_IsRejected() {
        Employee emp = employee(20);
        long before = leaveRequests.count();

        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(emp.getId());
        dto.setType(LeaveType.SICK);
        dto.setStartDate(LocalDate.now().minusDays(1));
        dto.setEndDate(onOrAfter(DayOfWeek.SUNDAY));

        ResponseEntity<?> result = controller.create(dto);

        assertEquals(400, result.getStatusCode().value());
        assertEquals(before, leaveRequests.count());
    }

    @Test
    void approve_PendingRequest_SetsApproved() {
        LeaveRequest pending = pendingVacation(employee(20), 3, LocalDate.of(2026, 4, 1));

        ResponseEntity<?> result = controller.approve(pending.getId());

        assertTrue(result.getStatusCode().is2xxSuccessful());
        assertEquals(LeaveStatus.APPROVED, leaveRequests.findById(pending.getId()).orElseThrow().getStatus());
    }

    @Test
    void approve_MissingRequest_Returns404() {
        ResponseEntity<?> result = controller.approve(9_999_999L);

        assertEquals(404, result.getStatusCode().value());
    }

    @Test
    void approve_AlreadyApprovedOrRejected_Returns409() {
        Employee emp = employee(20);
        LeaveRequest approved = pendingVacation(emp, 2, LocalDate.of(2026, 5, 1));
        controller.approve(approved.getId());

        ResponseEntity<?> second = controller.approve(approved.getId());
        assertEquals(409, second.getStatusCode().value());
        assertEquals(LeaveStatus.APPROVED, leaveRequests.findById(approved.getId()).orElseThrow().getStatus());

        LeaveRequest rejected = pendingVacation(emp, 2, LocalDate.of(2026, 6, 1));
        rejected.setStatus(LeaveStatus.REJECTED);
        leaveRequests.save(rejected);

        ResponseEntity<?> rejectedResult = controller.approve(rejected.getId());
        assertEquals(409, rejectedResult.getStatusCode().value());
        assertEquals(LeaveStatus.REJECTED, leaveRequests.findById(rejected.getId()).orElseThrow().getStatus());
    }

    @Test
    void approve_WouldExceedQuota_Returns400AndStaysPending() {
        Employee emp = employee(20);
        LeaveRequest already = pendingVacation(emp, 18, LocalDate.of(2026, 1, 6));
        already.setStatus(LeaveStatus.APPROVED);
        leaveRequests.save(already);

        LeaveRequest pending = pendingVacation(emp, 3, LocalDate.of(2026, 3, 1));

        ResponseEntity<?> result = controller.approve(pending.getId());

        assertEquals(400, result.getStatusCode().value());
        assertEquals(LeaveStatus.PENDING, leaveRequests.findById(pending.getId()).orElseThrow().getStatus());
    }

    @Test
    void approve_TwoRequestsThatTogetherExceedQuota_OnlyOneSucceeds() throws Exception {
        Employee emp = employee(10);
        LeaveRequest first = pendingVacation(emp, 6, LocalDate.of(2026, 7, 1));
        LeaveRequest second = pendingVacation(emp, 6, LocalDate.of(2026, 8, 1));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<ResponseEntity<?>>> tasks = List.of(
                    () -> controller.approve(first.getId()),
                    () -> controller.approve(second.getId())
            );
            List<Future<ResponseEntity<?>>> futures = pool.invokeAll(tasks);

            long approvedResponses = 0;
            for (Future<ResponseEntity<?>> future : futures) {
                if (future.get().getStatusCode().is2xxSuccessful()) {
                    approvedResponses++;
                }
            }

            assertEquals(1, approvedResponses);
            long approvedRows = List.of(first, second).stream()
                    .map(request -> leaveRequests.findById(request.getId()).orElseThrow().getStatus())
                    .filter(status -> status == LeaveStatus.APPROVED)
                    .count();
            assertEquals(1, approvedRows);
        } finally {
            pool.shutdownNow();
        }
    }

    private static LocalDate onOrAfter(DayOfWeek day) {
        LocalDate date = LocalDate.now();
        while (date.getDayOfWeek() != day) {
            date = date.plusDays(1);
        }
        return date;
    }

    private Employee employee(int quota) {
        Employee emp = new Employee();
        emp.setName("Emp " + quota);
        emp.setAnnualQuota(quota);
        return employees.save(emp);
    }

    private LeaveRequest pendingVacation(Employee employee, int days, LocalDate start) {
        LeaveRequest request = new LeaveRequest();
        request.setEmployeeId(employee.getId());
        request.setType(LeaveType.VACATION);
        request.setStartDate(start);
        request.setEndDate(start.plusDays(days - 1L));
        request.setDays(days);
        request.setStatus(LeaveStatus.PENDING);
        return leaveRequests.save(request);
    }
}

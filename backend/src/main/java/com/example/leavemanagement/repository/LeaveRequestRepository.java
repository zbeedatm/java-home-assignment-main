package com.example.leavemanagement.repository;

import com.example.leavemanagement.model.LeaveRequest;
import com.example.leavemanagement.model.LeaveStatus;
import com.example.leavemanagement.model.LeaveType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, Long> {

    List<LeaveRequest> findByEmployeeIdAndTypeAndStatus(Long employeeId, LeaveType type, LeaveStatus status);

    List<LeaveRequest> findAllByOrderByStartDateDesc();

    @Query("SELECT r FROM LeaveRequest r WHERE r.employee.name LIKE CONCAT('%', :name, '%')")
    List<LeaveRequest> findByEmployeeNameContaining(@Param("name") String name);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM LeaveRequest r WHERE r.id = :id")
    Optional<LeaveRequest> findByIdForUpdate(@Param("id") Long id);
}

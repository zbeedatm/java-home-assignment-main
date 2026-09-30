package com.example.leavemanagement.controller;

import com.example.leavemanagement.dto.CreateLeaveRequestDto;
import com.example.leavemanagement.model.LeaveRequest;
import com.example.leavemanagement.service.LeaveRequestException;
import com.example.leavemanagement.service.LeaveRequestService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/leave-requests")
public class LeaveRequestsController {

    private final LeaveRequestService leaveRequestService;

    public LeaveRequestsController(LeaveRequestService leaveRequestService) {
        this.leaveRequestService = leaveRequestService;
    }

    @GetMapping
    public ResponseEntity<List<LeaveRequest>> getAll() {
        return ResponseEntity.ok(leaveRequestService.list());
    }

    @GetMapping("/search")
    public ResponseEntity<List<LeaveRequest>> search(@RequestParam String name) {
        return ResponseEntity.ok(leaveRequestService.searchByEmployeeName(name));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateLeaveRequestDto dto) {
        return okOrError(() -> leaveRequestService.create(dto));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(@PathVariable Long id) {
        return okOrError(() -> leaveRequestService.approve(id));
    }

    private ResponseEntity<?> okOrError(Supplier<LeaveRequest> action) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (LeaveRequestException ex) {
            return ResponseEntity.status(httpStatus(ex.getCode())).body(ex.getMessage());
        }
    }

    private static HttpStatus httpStatus(LeaveRequestException.Code code) {
        return switch (code) {
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case CONFLICT -> HttpStatus.CONFLICT;
            case BAD_REQUEST -> HttpStatus.BAD_REQUEST;
        };
    }
}

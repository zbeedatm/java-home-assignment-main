package com.example.leavemanagement.service;

public class LeaveRequestException extends RuntimeException {

    public enum Code {
        NOT_FOUND,
        CONFLICT,
        BAD_REQUEST
    }

    private final Code code;

    public LeaveRequestException(Code code, String message) {
        super(message);
        this.code = code;
    }

    public Code getCode() {
        return code;
    }
}

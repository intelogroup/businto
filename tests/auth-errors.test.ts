import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/auth-errors";

describe("Auth Error Mapping", () => {
    describe("Login Mode", () => {
        it("returns correct message for invalid credentials", () => {
            const msg = getErrorMessage("Invalid login credentials", "login");
            expect(msg).toBe("Incorrect email or password. Please check your credentials.");

            const msgSlug = getErrorMessage("invalid_credentials", "login");
            expect(msgSlug).toBe("Incorrect email or password. Please check your credentials.");
        });

        it("returns correct message for unconfirmed email", () => {
            const msg = getErrorMessage("Email not confirmed", "login");
            expect(msg).toBe("Please verify your email before signing in.");
        });

        it("returns correct message for rate limits", () => {
            const msg = getErrorMessage("Too many requests", "login");
            expect(msg).toBe("Too many attempts. Please wait a moment and try again.");
        });

        it("falls back to default for unknown errors", () => {
            const msg = getErrorMessage(undefined, "login");
            expect(msg).toBe("Sign in failed. Please try again.");
        });
    });

    describe("Signup Mode", () => {
        it("returns correct message for existing user", () => {
            const msg = getErrorMessage("User already registered", "signup");
            expect(msg).toBe("An account with this email already exists. Try signing in instead.");

            const msgAlt = getErrorMessage("User already exists", "signup");
            expect(msgAlt).toBe("An account with this email already exists. Try signing in instead.");
        });

        it("returns correct message for weak password", () => {
            const msg = getErrorMessage("weak_password", "signup");
            expect(msg).toBe("Password is too weak. Use at least 8 characters with a mix of letters and numbers.");
        });

        it("returns correct message for invalid email", () => {
            const msg = getErrorMessage("Email address is invalid", "signup");
            expect(msg).toBe("Please enter a valid email address.");
        });

        it("returns correct message for rate limits", () => {
            const msg = getErrorMessage("too_many_requests", "signup");
            expect(msg).toBe("Too many attempts. Please wait a moment and try again.");
        });
    });
});

export type AuthErrorMode = "login" | "signup";

export function getErrorMessage(message: string | undefined, mode: AuthErrorMode): string {
    if (!message) {
        return mode === "login"
            ? "Sign in failed. Please try again."
            : "Signup failed. Please try again.";
    }

    const msg = message.toLowerCase().replace(/_/g, " ");

    // Common errors
    if (msg.includes("rate limit") || msg.includes("too many")) {
        return "Too many attempts. Please wait a moment and try again.";
    }
    if (msg.includes("network") || msg.includes("fetch")) {
        return "Network error. Check your connection and try again.";
    }

    if (mode === "login") {
        if (msg.includes("invalid") && (msg.includes("credential") || msg.includes("login") || msg.includes("password"))) {
            return "Incorrect email or password. Please check your credentials.";
        }
        if (msg.includes("email not confirmed") || msg.includes("verify your email")) {
            return "Please verify your email before signing in.";
        }
    }

    if (mode === "signup") {
        if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already exists") || msg.includes("already exists")) {
            return "An account with this email already exists. Try signing in instead.";
        }
        if (msg.includes("weak") || (msg.includes("password") && msg.includes("short"))) {
            return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
        }
        if (msg.includes("invalid email") || (msg.includes("email") && msg.includes("invalid")) || msg.includes("valid email")) {
            return "Please enter a valid email address.";
        }
    }

    return message;
}

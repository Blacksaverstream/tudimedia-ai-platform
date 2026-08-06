export class AuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export const unauthorized = (message = "Authentication is required.") =>
  new AuthError("AUTH_UNAUTHORIZED", message, 401);

export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AuthError("AUTH_FORBIDDEN", message, 403);

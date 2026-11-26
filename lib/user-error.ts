/**
 * An expected refusal with a message meant for the person (e.g. "This class has students").
 * lib/repo throws it; lib/action-result shows the message and field errors as they are.
 */
export class UserError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "UserError";
  }
}

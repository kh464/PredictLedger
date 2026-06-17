export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(400, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(409, code, message);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', code = 'UNPROCESSABLE_ENTITY') {
    super(422, code, message);
  }
}

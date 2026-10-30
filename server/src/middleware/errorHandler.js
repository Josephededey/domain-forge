import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'That resource does not exist.'));
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (logger) => (err, req, res, _next) => {
  let e = err;
  if (err?.type === 'entity.parse.failed') e = new AppError(400, 'MALFORMED_REQUEST', 'The request body is not valid JSON.');
  if (err?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');

  if (!(e instanceof AppError)) {
    // Unexpected: log with correlation id, send nothing internal to the client (FR-062/063).
    logger.error({ err, requestId: req.id, route: req.path }, 'unhandled error');
    e = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
  }
  res.status(e.status).json({
    error: { code: e.code, message: e.message, ...(e.details && { details: e.details }), requestId: req.id },
  });
};

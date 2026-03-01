import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error: AppError = err;

  // Log error with request details
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Handle Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        const field = err.meta?.target ? (err.meta.target as string[]).join(', ') : 'field';
        error = new AppError(`Duplicate value for ${field}`, 400, true, 'DUPLICATE_ENTRY');
        break;

      case 'P2025':
        // Record not found
        error = new AppError('Resource not found', 404, true, 'NOT_FOUND');
        break;

      case 'P2003':
        // Foreign key constraint violation
        error = new AppError('Invalid reference - related record not found', 400, true, 'FOREIGN_KEY_VIOLATION');
        break;

      case 'P2014':
        // Invalid data
        error = new AppError('Invalid data provided', 400, true, 'INVALID_DATA');
        break;

      case 'P2028':
        // Transaction write conflict
        error = new AppError('Database conflict - please try again', 409, true, 'CONFLICT');
        break;

      default:
        error = new AppError('Database operation failed', 500, true, 'DATABASE_ERROR');
    }
  }

  // Handle Prisma validation errors
  else if (err instanceof PrismaClientValidationError) {
    error = new AppError('Invalid data format', 400, true, 'VALIDATION_ERROR');
  }

  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid authentication token', 401, true, 'INVALID_TOKEN');
  }

  else if (err.name === 'TokenExpiredError') {
    error = new AppError('Authentication token has expired', 401, true, 'TOKEN_EXPIRED');
  }

  // Handle custom application errors
  else if (err instanceof AppError) {
    // Keep the original error
    error = err;
  }

  // Handle validation errors (e.g., from express-validator)
  else if (err.array && typeof err.array === 'function') {
    const messages = err.array().map((e: any) => e.msg).join(', ');
    error = new AppError(messages, 400, true, 'VALIDATION_ERROR');
  }

  // Handle file upload errors
  else if (err.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('File too large', 400, true, 'FILE_TOO_LARGE');
  }

  else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new AppError('Unexpected file type', 400, true, 'INVALID_FILE_TYPE');
  }

  // Handle rate limiting errors
  else if (err.statusCode === 429) {
    error = new AppError('Too many requests - please try again later', 429, true, 'RATE_LIMITED');
  }

  // Handle network/external service errors
  else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    error = new AppError('Service temporarily unavailable', 503, true, 'SERVICE_UNAVAILABLE');
  }

  // Handle 2FA errors
  else if (err.message?.includes('Two-factor authentication')) {
    error = new AppError(err.message, 401, true, 'TWO_FA_REQUIRED');
  }

  // Handle account security errors
  else if (err.message?.includes('locked') || err.message?.includes('attempts')) {
    error = new AppError(err.message, 423, true, 'ACCOUNT_LOCKED');
  }

  // Default to 500 server error for unhandled errors
  else if (!error.statusCode || error.statusCode === 500) {
    error = new AppError(
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message || 'Internal server error',
      500,
      false, // Not operational for unknown errors
      'INTERNAL_ERROR'
    );
  }

  // Send error response
  const response: any = {
    success: false,
    message: error.message,
    ...(error.code && { code: error.code }),
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err;
  }

  // Log operational errors differently
  if (error.isOperational) {
    console.warn('Operational error:', error.message);
  } else {
    console.error('Programming error:', err);
  }

  res.status(error.statusCode).json(response);
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// 404 handler
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  let message = `Not found - ${req.originalUrl}`;

  // often the caller has forgotten to include the "/api" prefix; log a hint
  if (
    req.originalUrl.startsWith('/auth') ||
    req.originalUrl.startsWith('/friends') ||
    req.originalUrl === '/chat'
  ) {
    message += ' (did you forget to prefix with "/api"?)';
  }

  const error = new AppError(message, 404);
  next(error);
};
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { logger } from '@/config/logger';
import { AppError, ApiError } from '@/types';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  const requestLogger = req.requestId 
    ? logger.child({ requestId: req.requestId })
    : logger;

  // Handle different error types
  let error: ApiError;

  if (err instanceof AppError) {
    // Application-specific errors
    error = {
      code: err.code,
      message: err.message,
      details: {},
    };

    if (err.isOperational) {
      requestLogger.warn('Operational error', {
        error: error,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      });
    } else {
      requestLogger.error('Non-operational error', {
        error: err,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        stack: err.stack,
      });
    }

    res.status(err.statusCode).json({ error });
    return;
  }

  if (err instanceof ZodError) {
    // Validation errors
    error = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: {
        validationErrors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          value: 'input' in e ? e.input : undefined,
        })),
      },
    };

    requestLogger.warn('Validation error', {
      error: error,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({ error });
    return;
  }

  if (err instanceof PrismaClientKnownRequestError) {
    // Database errors
    switch (err.code) {
      case 'P2002':
        error = {
          code: 'DUPLICATE_ENTRY',
          message: 'A record with this data already exists',
          details: {
            target: err.meta?.target,
          },
        };
        res.status(409).json({ error });
        break;

      case 'P2025':
        error = {
          code: 'RECORD_NOT_FOUND',
          message: 'The requested record was not found',
          details: {
            target: err.meta?.cause,
          },
        };
        res.status(404).json({ error });
        break;

      default:
        error = {
          code: 'DATABASE_ERROR',
          message: 'A database error occurred',
          details: {
            code: err.code,
          },
        };
        res.status(500).json({ error });
    }

    requestLogger.error('Database error', {
      error: err,
      path: req.path,
      method: req.method,
      prismaCode: err.code,
    });

    return;
  }

  // Handle specific error types
  if (err.name === 'SyntaxError' && 'body' in err) {
    error = {
      code: 'INVALID_JSON',
      message: 'Invalid JSON in request body',
    };

    requestLogger.warn('JSON syntax error', {
      error: error,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({ error });
    return;
  }

  if (err.name === 'UnauthorizedError') {
    error = {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    };

    requestLogger.warn('Unauthorized access attempt', {
      error: error,
      path: req.path,
      method: req.method,
    });

    res.status(401).json({ error });
    return;
  }

  // Default error handler for unexpected errors
  error = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  };

  requestLogger.error('Unexpected error', {
    error: err,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(500).json({ error });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error: ApiError = {
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  };

  const requestLogger = req.requestId 
    ? logger.child({ requestId: req.requestId })
    : logger;

  requestLogger.warn('Route not found', {
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json({ error });
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 
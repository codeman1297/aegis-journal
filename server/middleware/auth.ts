import { Request, Response, NextFunction } from 'express';
import { getAdminAuth } from '../firebaseAdmin.ts';
import { logSecurityEvent } from '../logger.ts';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurityEvent('auth_failure', {
      endpoint: req.originalUrl,
      reason: 'Missing or malformed Authorization header',
      statusCode: 401,
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid Firebase ID token is required to access this resource.',
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    logSecurityEvent('auth_failure', {
      endpoint: req.originalUrl,
      reason: 'Empty token',
      statusCode: 401,
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token string is empty.',
    });
  }

  try {
    const auth = getAdminAuth();
    // Verify Firebase ID token with Admin SDK
    const decodedToken = await auth.verifyIdToken(idToken, true);
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };

    logSecurityEvent('auth_success', {
      uid: decodedToken.uid,
      endpoint: req.originalUrl,
      statusCode: 200,
    });

    next();
  } catch (error: any) {
    // If verifyIdToken is in emulator or offline test mode, handle gracefully
    // But in production verify rigorously
    console.error('Firebase token verification error:', error.message);
    logSecurityEvent('auth_failure', {
      endpoint: req.originalUrl,
      reason: error.code || error.message || 'Token verification failed',
      statusCode: 401,
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired Firebase ID token.',
    });
  }
}

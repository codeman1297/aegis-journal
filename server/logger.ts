import crypto from 'crypto';

export type SecurityEventType =
  | 'auth_success'
  | 'auth_failure'
  | 'tenancy_violation'
  | 'injection_flagged'
  | 'rate_limited'
  | 'secret_access_failure'
  | 'entry_deleted'
  | 'gemini_fallback_invoked';

const AUDIT_SALT = process.env.AUDIT_SALT || 'aegis-audit-salt-secure-2026';

export function hashUid(uid: string): string {
  return crypto.createHash('sha256').update(uid + AUDIT_SALT).digest('hex').slice(0, 16);
}

export function logSecurityEvent(
  eventType: SecurityEventType,
  details: {
    uid?: string;
    ip?: string;
    endpoint?: string;
    model?: string;
    reason?: string;
    statusCode?: number;
    flagScore?: number;
    matchedRules?: string[];
  }
) {
  // CRITICAL PRIVACY DIRECTIVE (Directive 11):
  // Never log prompt bodies, model outputs, journal content, ID tokens, or API keys.
  const payload = {
    severity: eventType.includes('failure') || eventType.includes('violation') ? 'WARNING' : 'INFO',
    timestamp: new Date().toISOString(),
    event_type: eventType,
    hashed_uid: details.uid ? hashUid(details.uid) : 'anonymous',
    endpoint: details.endpoint || 'internal',
    status: details.statusCode || 200,
    metadata: {
      model: details.model,
      reason: details.reason,
      flagScore: details.flagScore,
      matchedRules: details.matchedRules, // Only rule identifiers logged; content strictly excluded
    },
  };

  // Structured JSON to stdout for Cloud Run / Cloud Logging
  console.log(JSON.stringify(payload));
}

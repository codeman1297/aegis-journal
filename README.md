# AegisJournal

A secure, user-authenticated journaling web application utilizing **Google Sign-In (Firebase Auth)**, **Cloud Firestore** for user-isolated persistence, and **Gemini 3.6 Flash** (with fallback ladder) for multi-turn reflections, executive summaries, and **Memory Vault** semantic retrieval over past journal entries.

---

## Architecture & Security Directives

- **Directive 1 (Agentic Threat Modeling)**: Comprehensive threat assessment across 5 zones (Input Surfaces, Planning/Reasoning, Tool Execution, Memory/State, Inter-System Communication).
- **Directive 2 (Secure Coding Standard)**: Strict Zod validation on incoming payloads, parameterization, and contextual escaping.
- **Directive 3 (Secure Firestore & Auth)**: Google Sign-In only, no passwords stored. Cloud Firestore security rules with `request.auth.uid == userId` isolation and deny-by-default tail. Server-side Firebase ID token verification using the Firebase Admin SDK on all `/api/*` endpoints.
- **Directive 4 (Secret Management)**: Gemini API key kept strictly server-side. Firebase client configuration values in `firebase-applet-config.json` are public by design.
- **Directive 6 (Gemini Fallback Ladder)**: Reusable `generateContentWithFallback` implementing a resilient ladder:
  `gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash` with exponential backoff and jitter for transient 429 / 503 / 500 errors.
- **Directive 8 (Retrieval & Vector Isolation Directive - RAG Tenancy)**:
  - Every vector embedding record contains `owner_uid` as a first-class field.
  - The semantic retrieval function accepts ONLY the verified Token UID from the Firebase Admin SDK token; it is physically and structurally impossible to accept a `uid` argument from the client request body.
  - Post-query tenancy re-check: any record whose `owner_uid !== token.uid` aborts the request with an HTTP 500 and triggers a `TENANCY_VIOLATION` audit event (fail closed).
  - Deleting an entry atomically deletes all associated vector records in the same Firestore batch transaction.
- **Directive 9 (Untrusted Context Envelope)**: Structural prompt-injection defense wrapping untrusted user inputs inside `<UNTRUSTED_CONTEXT>` tags with sanitized closing tokens and pre-flight heuristic injection scanning.
- **Directive 10 (Rate Limiting & Quotas)**: Per-UID window rate-limiting returning clean 429 status and retry indicators.
- **Directive 11 (Audit Trail & Privacy)**: Structured JSON security events written to stdout with hashed UID (`SHA-256 + salt`), without logging sensitive journal text or credentials.
- **Directive 12 (Verifiable Posture & Self-Audit)**: Authenticated `GET /api/security/posture` endpoint and dedicated "Security" tab reporting actual runtime state (secret source, Admin SDK verification active, firestore.rules deny-default present, rate limiter active, tenancy re-check active, injection scan telemetry in last 24h, model fallback ladder position, and last fallback event). Proves it can fail if credentials fall back to env or rules are missing.
- **Directive 14 (Deployment Hardening)**: Least privilege Cloud Run execution, secret injection, and bounded instances.

---

## Prerequisites & API Enablement

Enable the required Google Cloud APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com
```

---

## Secret Manager Setup

Create and bind the Gemini API key in Google Cloud Secret Manager:

```bash
# 1. Create the secret
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY \
  --data-file=- \
  --replication-policy="automatic"

# 2. Grant Secret Accessor role to the Cloud Run dedicated runtime service account
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:aegis-journal-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

> **Note on Firebase Config**: The client-side credentials in `firebase-applet-config.json` (projectId, appId, apiKey) are public identification tokens intended for client-to-Firebase routing, guarded by Firestore Security Rules and App Check. The private `GEMINI_API_KEY` remains exclusively on the server.

---

## Cloud Firestore Security Rules

Deploy the isolated rules with owner checks and explicit deny-by-default tail:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /entries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /turns/{turnId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }

      match /vectors/{vectorId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy using Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## Directive 9: Injection Firewall & Untrusted Context Envelopes

The application incorporates a pre-flight heuristic scanner evaluating 0–100 threat scores across 5 vectors before prompt synthesis:
- **Instruction Overrides**: Detects phrases like `ignore all previous instructions`, `system override`, and `from now on you must`.
- **Role Switch & Jailbreak**: Detects `DAN mode`, `developer mode enabled`, and unconstrained persona directives.
- **System Exfiltration**: Detects commands targeting system prompts, hidden rules, and environment secrets/keys.
- **Delimiter Escape**: Catches attempted breakouts targeting `</UNTRUSTED_CONTEXT>` tags or pseudo system delimiters (`<SYSTEM>`, `<INST>`).
- **Hidden Unicode & Obfuscation**: Catches zero-width spaces (`\u200B`), zero-width joiners (`\u200D`), and bidirectional overrides.

### Non-Drop Policy & Transparency
When a turn is flagged, the user's reflection is **never silently dropped**. Instead:
1. Input is enclosed inside an `<UNTRUSTED_CONTEXT>` envelope with sanitized closing tags and an unambiguous directive stating contents are plain data, not executable instructions.
2. The UI displays an interactive **"Untrusted content neutralized"** badge with a live details drawer displaying matched rule IDs and score.
3. An `injection_flagged` security event is dispatched to Cloud Logging with the user's ID hashed (`SHA-256 + salt`) and raw user content strictly excluded (Directive 11).

---

## Cloud Run Deployment & Campaign Label

Build and deploy to Cloud Run with least-privilege service account and secret binding:

```bash
# 1. Build and deploy to Cloud Run
gcloud run deploy aegis-journal \
  --source . \
  --region asia-southeast1 \
  --service-account aegis-journal-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --min-instances 0 \
  --max-instances 10 \
  --no-cpu-boost \
  --allow-unauthenticated

# 2. Apply mandatory campaign label (Directive 7)
gcloud run services update aegis-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=asia-southeast1
```

---

## Functional Verification & Walkthrough

1. **Google Sign-In**: Click "Continue with Google" to federate through Firebase Authentication.
2. **Journal Dashboard**: Select or create a reflection. The input persists to your personal Firestore collection `/users/{userId}/entries`.
3. **Memory Vault Embeddings**: On save, the backend embeds entries using `text-embedding-004` and stores vectors in `/users/{userId}/vectors` tagged with `owner_uid`.
4. **Memory Vault Semantic Retrieval**: In "Memory Vault" mode, ask questions like "what was I anxious about last month?". The system semantically queries the user's past entries, executes post-query tenancy checks, wraps retrieved memories in `<UNTRUSTED_CONTEXT>` envelopes, and grounds Gemini's reflection.
5. **Memory Vault Explorer**: Click "Memory Vault" in the header to run live semantic searches across your indexed entries.
6. **Data Isolation & Atomic Deletion**: When an entry is deleted, both the entry and all associated vector embeddings are atomically deleted in the same transaction. Other accounts are physically barred by Firestore security rules and backend token verification.
7. **Verifiable Security Posture Tab**: Click the **"Security"** tab in the top navigation to audit live runtime state:
   - Secret source (`secret-manager` vs. `env` fallback vs. `MISSING`).
   - Admin SDK token verification active.
   - Live inspection of `firestore.rules` on disk confirming deny-by-default catch-all.
   - Rate limiting quota tracker (20 requests/minute per UID).
   - Injection scan telemetry over the last 24 hours (total scans, threats flagged, turns neutralized, average score).
   - Model fallback ladder position and historical fallback events.

## Residual Risks

- **Network-Level DoS**: Cloud Armor WAF is recommended in front of Cloud Run for layer 7 DDoS mitigation in enterprise deployments.
- **Client-Side Cache Retention**: If using shared public workstations, users should click "Sign Out" to clear client session storage.
- **High-Dimension Vector Scale**: For databases exceeding 50,000 entries per user, migrating from in-memory cosine ranking to Vertex AI Vector Search or pgvector in Cloud SQL will maintain sub-millisecond retrieval latency.

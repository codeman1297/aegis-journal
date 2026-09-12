import { getAdminFirestore } from './firebaseAdmin.ts';
import { generateEmbedding, cosineSimilarity, wrapInUntrustedEnvelope } from './gemini.ts';
import { logSecurityEvent } from './logger.ts';

export interface VaultVectorRecord {
  vectorId: string;
  entryId: string;
  owner_uid: string; // First-class owner_uid field (Directive 8)
  title: string;
  chunkText: string;
  embedding: number[];
  createdAt: number;
}

export interface RetrievedVaultContext {
  entryId: string;
  title: string;
  chunkText: string;
  similarity: number;
  untrustedEnvelope: string;
}

/**
 * Embed an entry and persist vectors with owner_uid in Cloud Firestore
 * Must be called upon writing or syncing journal entries.
 */
export async function indexEntryToMemoryVault(
  verifiedUid: string,
  entryId: string,
  title: string,
  fullText: string
): Promise<void> {
  if (!fullText.trim()) return;

  const db = getAdminFirestore();
  // Chunking text into semantically coherent slices if long
  const chunks: string[] = [];
  const maxChunkLength = 1200;

  if (fullText.length <= maxChunkLength) {
    chunks.push(fullText);
  } else {
    // Break by paragraphs or sentences
    const paragraphs = fullText.split(/\n\n+/);
    let currentChunk = '';
    for (const p of paragraphs) {
      if ((currentChunk + '\n' + p).length <= maxChunkLength) {
        currentChunk = currentChunk ? `${currentChunk}\n${p}` : p;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = p.slice(0, maxChunkLength);
      }
    }
    if (currentChunk) chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const vectorId = `${entryId}_chk_${i}`;
    const embedding = await generateEmbedding(`${title}\n${chunkText}`);

    const vectorRecord: VaultVectorRecord = {
      vectorId,
      entryId,
      owner_uid: verifiedUid, // First class owner_uid
      title: title || 'Untitled Reflection',
      chunkText,
      embedding,
      createdAt: Date.now(),
    };

    // Stored strictly inside user-isolated vectors path: /users/{verifiedUid}/vectors/{vectorId}
    const vectorRef = db.collection('users').doc(verifiedUid).collection('vectors').doc(vectorId);
    await vectorRef.set(vectorRecord);
  }
}

/**
 * Semantic retrieval over the signed-in user's past entries.
 * STRUCTURAL CONSTRAINT (Directive 8):
 * This function accepts ONLY the verified Token UID. It is structurally impossible
 * to pass an unverified UID from the request body into this function.
 */
export async function retrieveMemoryVaultContext(
  verifiedCallerUid: string,
  queryText: string,
  limit: number = 3
): Promise<RetrievedVaultContext[]> {
  const db = getAdminFirestore();

  // 1. Embed query
  const queryEmbedding = await generateEmbedding(queryText);

  // 2. Query vectors strictly bound to verifiedCallerUid
  const vectorsRef = db.collection('users').doc(verifiedCallerUid).collection('vectors');
  const snapshot = await vectorsRef.get();

  if (snapshot.empty) {
    return [];
  }

  const scoredResults: {
    record: VaultVectorRecord;
    similarity: number;
  }[] = [];

  // 3. Post-query tenancy re-check (Directive 8)
  // Any record whose owner_uid != token uid aborts the request immediately with TENANCY_VIOLATION
  for (const docSnap of snapshot.docs) {
    const record = docSnap.data() as VaultVectorRecord;

    if (!record.owner_uid || record.owner_uid !== verifiedCallerUid) {
      logSecurityEvent('tenancy_violation', {
        uid: verifiedCallerUid,
        endpoint: 'retrieveMemoryVaultContext',
        reason: `CRITICAL: Vector document ${docSnap.id} owner_uid (${record.owner_uid}) mismatched verified token (${verifiedCallerUid})`,
        statusCode: 500,
      });

      // Fail closed, never filter-and-continue
      throw new Error('TENANCY_VIOLATION: Cross-user vector leakage detected. Request aborted.');
    }

    if (record.embedding && Array.isArray(record.embedding)) {
      const sim = cosineSimilarity(queryEmbedding, record.embedding);
      if (sim > 0.4) {
        scoredResults.push({ record, similarity: sim });
      }
    }
  }

  // Sort descending by similarity
  scoredResults.sort((a, b) => b.similarity - a.similarity);
  const topMatches = scoredResults.slice(0, limit);

  // 4. Wrap every chunk in <UNTRUSTED_CONTEXT> envelope with standing instruction (Directive 9)
  return topMatches.map(({ record, similarity }) => ({
    entryId: record.entryId,
    title: record.title,
    chunkText: record.chunkText,
    similarity,
    untrustedEnvelope: wrapInUntrustedEnvelope(
      'memory_vault_past_entry',
      record.entryId,
      `[Past Journal Entry: "${record.title}"]\n${record.chunkText}`
    ),
  }));
}

/**
 * Delete an entry and all its associated vectors in the same transaction / batch (Directive 8)
 */
export async function deleteEntryAndVectors(
  verifiedCallerUid: string,
  entryId: string
): Promise<void> {
  const db = getAdminFirestore();
  const batch = db.batch();

  // Delete the entry document
  const entryRef = db.collection('users').doc(verifiedCallerUid).collection('entries').doc(entryId);
  batch.delete(entryRef);

  // Find all vector documents tied to this entryId
  const vectorsRef = db.collection('users').doc(verifiedCallerUid).collection('vectors');
  const vectorQuery = await vectorsRef.where('entryId', '==', entryId).get();

  for (const docSnap of vectorQuery.docs) {
    const data = docSnap.data() as VaultVectorRecord;
    // Strict tenancy verification on deletion target
    if (data.owner_uid !== verifiedCallerUid) {
      logSecurityEvent('tenancy_violation', {
        uid: verifiedCallerUid,
        endpoint: 'deleteEntryAndVectors',
        reason: 'Attempted to delete vector not owned by verified user',
        statusCode: 500,
      });
      throw new Error('TENANCY_VIOLATION: Unauthorized vector deletion attempt.');
    }
    batch.delete(docSnap.ref);
  }

  // Commit atomic deletion
  await batch.commit();

  logSecurityEvent('entry_deleted', {
    uid: verifiedCallerUid,
    endpoint: `/api/journal/entry/${entryId}`,
    reason: `Entry ${entryId} and ${vectorQuery.size} associated vector embeddings atomically deleted`,
    statusCode: 200,
  });
}

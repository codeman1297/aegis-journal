export interface JournalMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  injectionAudit?: {
    flagged: boolean;
    score: number;
    matchedRules: {
      ruleId: string;
      category: string;
      description: string;
      severity: number;
    }[];
    matchedReasons: string[];
  };
}

export interface JournalEntry {
  id: string;
  title: string;
  category?: 'reflection' | 'brainstorm' | 'gratitude' | 'goal' | 'mindfulness';
  summary?: string;
  tags?: string[];
  messages: JournalMessage[];
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface SecurityPosture {
  secretSource: 'secret-manager' | 'env' | 'MISSING';
  adminSdkTokenVerification: boolean;
  rulesDenyDefault: boolean;
  rulesSummary?: string;
  rateLimiterActive: boolean;
  tenancyIsolationActive: boolean;
  untrustedEnvelopeActive: boolean;
  injectionFirewallActive: boolean;
  geminiModelLadder: string[];
  currentLadderPosition: number;
  currentModel: string;
  lastFallbackEvent: {
    timestamp: number;
    fromModel: string;
    toModel: string;
    reason: string;
  } | null;
  injectionStats24h: {
    totalScans: number;
    flaggedScans: number;
    neutralizedScans: number;
    avgScore: number;
  };
  authenticatedUserUid?: string;
  timestamp: number;
}

export interface MemoryVaultReference {
  entryId: string;
  title: string;
  similarity: number;
}

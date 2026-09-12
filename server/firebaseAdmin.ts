import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminApp: App | null = null;
let firestoreDb: Firestore | null = null;

export function getFirebaseAdmin(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        projectId = config.projectId;
      }
    } catch (e) {
      console.warn('Failed to parse firebase-applet-config.json for projectId');
    }
  }

  adminApp = initializeApp({
    projectId: projectId || 'genai-cohort3-t2-506516',
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdmin());
}

export function getAdminFirestore(): Firestore {
  if (firestoreDb) {
    return firestoreDb;
  }

  let databaseId = process.env.FIRESTORE_DATABASE_ID;
  if (!databaseId) {
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        databaseId = config.firestoreDatabaseId;
      }
    } catch (e) {
      console.warn('Failed to parse firebase-applet-config.json for databaseId');
    }
  }

  const app = getFirebaseAdmin();
  firestoreDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return firestoreDb;
}

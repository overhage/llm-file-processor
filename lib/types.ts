// =============================================
// lib/types.ts — shared types
// =============================================
// --- file: lib/types.ts ---
export type CreateJobBody = {
  uploadId: string;        // DB Upload id
  uploadBlobKey: string;   // key in Blobs store
  originalName: string;    // file name (e.g., ".csv")
  userId: string;          // from auth layer
};



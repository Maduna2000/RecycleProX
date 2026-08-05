import { offlineDB, type OfflineScaleDraft } from './db'

const DRAFT_ID = 'current' as const

// A stale draft (older than a shift-length window) is presumed abandoned —
// start the next operator's session clean rather than resuming it.
const DRAFT_MAX_AGE_MS = 4 * 60 * 60 * 1000

export type ScaleDraft = Omit<OfflineScaleDraft, 'id'>

export async function saveDraft(draft: ScaleDraft): Promise<void> {
  await offlineDB.scaleDraft.put({ id: DRAFT_ID, ...draft }).catch(() => {
    // Best-effort — a failed draft save shouldn't block the operator's flow
  })
}

export async function loadDraft(): Promise<ScaleDraft | null> {
  try {
    const draft = await offlineDB.scaleDraft.get(DRAFT_ID)
    if (!draft) return null
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      await clearDraft()
      return null
    }
    const { id: _id, ...rest } = draft
    return rest
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  await offlineDB.scaleDraft.delete(DRAFT_ID).catch(() => {})
}

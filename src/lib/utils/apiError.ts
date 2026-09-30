/**
 * Turns whatever an API put in `error` into a string safe to show in a toast.
 * Routes return a plain string, but older ones return Zod's flatten() object
 * ({ formErrors, fieldErrors }); String() on that is what showed users
 * "[object Object]".
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const { formErrors, fieldErrors } = error as {
      formErrors?: unknown
      fieldErrors?: Record<string, unknown>
    }
    const msgs: string[] = []
    if (Array.isArray(formErrors)) msgs.push(...formErrors.filter((m): m is string => typeof m === 'string'))
    if (fieldErrors && typeof fieldErrors === 'object') {
      for (const [field, list] of Object.entries(fieldErrors)) {
        if (Array.isArray(list)) for (const m of list) if (typeof m === 'string') msgs.push(`${field}: ${m}`)
      }
    }
    if (msgs.length) return msgs.join('; ')
  }
  return fallback
}

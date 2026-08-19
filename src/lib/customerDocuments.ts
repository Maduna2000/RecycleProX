import type { CustomerDocumentType } from '@prisma/client'

// Any of these three document types satisfies "has an ID on file" — a
// seller can legally identify with a national ID, a passport, or a
// driver's license, and the yard has no way (or need) to prefer one over
// another. Shared by the Account/Casual/Sellers ID Upload Status reports
// and the Photo Viewer's ID Photos filter so all four stay in lockstep;
// add a new identification document type here and every one of them
// picks it up automatically.
export const ID_LIKE_DOCUMENT_TYPES: CustomerDocumentType[] = ['id_copy', 'passport', 'drivers_licence']

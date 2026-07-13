'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import type { SupportTicket } from '@/lib/services/supportTicketClient'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_LABEL: Record<SupportTicket['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
}

export default function SupportPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const { data, isLoading, mutate } = useSWR<{ tickets: SupportTicket[] }>('/api/support-tickets', fetcher)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/support-tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message, priority }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setError('Failed to submit your ticket. Please try again.')
      return
    }
    setSubject('')
    setMessage('')
    setPriority('medium')
    mutate()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-1" style={{ color: colors.textPrimary }}>Support</h1>
      <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
        Questions or issues with Renovo Pro go straight to our team here.
      </p>

      {isAdmin && (
        <form onSubmit={onSubmit} className="mb-8 rounded-lg border p-4 space-y-3" style={{ borderColor: colors.border }}>
          <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>New ticket</h2>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Subject</label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              style={{ borderColor: colors.border }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Message</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              style={{ borderColor: colors.border }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="rounded-md border px-2.5 py-1.5 text-sm capitalize"
              style={{ borderColor: colors.border }}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {error && <p className="text-xs" style={{ color: colors.danger }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: colors.primary }}
          >
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </form>
      )}

      <h2 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Your tickets</h2>
      {isLoading ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Loading…</p>
      ) : !data?.tickets.length ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>No support tickets yet.</p>
      ) : (
        <div className="space-y-3">
          {data.tickets.map((t) => (
            <div key={t.id} className="rounded-lg border p-4" style={{ borderColor: colors.border }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{t.subject}</span>
                <span className="text-xs capitalize" style={{ color: colors.textSecondary }}>
                  {STATUS_LABEL[t.status]} · {t.priority}
                </span>
              </div>
              <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>{t.message}</p>
              {t.messages.length > 0 && (
                <div className="mt-2 space-y-2 border-t pt-2" style={{ borderColor: colors.border }}>
                  {t.messages.map((m) => (
                    <div key={m.id} className="text-xs">
                      <span className="font-medium" style={{ color: colors.textPrimary }}>
                        {m.sender?.fullName ?? 'Renovo Pro support'}:
                      </span>{' '}
                      <span style={{ color: colors.textSecondary }}>{m.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

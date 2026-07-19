'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import type { SupportTicket } from '@/lib/services/supportTicketClient'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, PortalPage, inp, lbl } from '@/components/rpx'

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
    <PortalPage title="Support">
      <div className="max-w-3xl">
        <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 16 }}>
          Questions or issues with Renovo Pro go straight to our team here.
        </p>

        {isAdmin && (
          <form onSubmit={onSubmit} className="mb-8 bg-white" style={{ border: `1px solid ${colors.border}`, borderRadius: 2, padding: 14 }}>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 10 }}>New ticket</p>
            <div className="space-y-3">
              <div>
                <label style={lbl}>Subject</label>
                <input required value={subject} onChange={(e) => setSubject(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Message</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ ...inp, height: 'auto', padding: 8, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={lbl}>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="capitalize" style={{ ...inp, width: 160 }}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {error && <p style={{ fontSize: fontSize.xs, color: colors.danger }}>{error}</p>}
              <div>
                <Btn type="submit" variant="primary" loading={submitting}>Submit ticket</Btn>
              </div>
            </div>
          </form>
        )}

        <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 10 }}>Your tickets</p>
        {isLoading ? (
          <p style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Loading…</p>
        ) : !data?.tickets.length ? (
          <p style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>No support tickets yet.</p>
        ) : (
          <div className="space-y-3">
            {data.tickets.map((t) => (
              <div key={t.id} className="bg-white" style={{ border: `1px solid ${colors.border}`, borderRadius: 2, padding: 14 }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{t.subject}</span>
                  <span className="capitalize" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                    {STATUS_LABEL[t.status]} · {t.priority}
                  </span>
                </div>
                <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 8 }}>{t.message}</p>
                {t.messages.length > 0 && (
                  <div className="mt-2 space-y-2" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                    {t.messages.map((m) => (
                      <div key={m.id} style={{ fontSize: fontSize.xs }}>
                        <span style={{ fontWeight: fontWeight.medium, color: colors.textPrimary }}>
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
    </PortalPage>
  )
}

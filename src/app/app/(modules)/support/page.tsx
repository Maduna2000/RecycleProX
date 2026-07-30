'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, LifeBuoy, Send, Loader2, Plus, Lock } from 'lucide-react'
import type { SupportTicket } from '@/lib/services/supportTicketClient'
import { colors, fontSize, fontWeight, statusStyle } from '@/lib/design-tokens'
import { format } from '@/lib/utils/format'
import { Dialog } from '@/components/ui/dialog'
import { fetcher } from '@/lib/swrFetcher'
import {
  Btn, PortalPage, inp, lbl,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'


const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
type Priority = typeof PRIORITIES[number]

const PRIORITY_COLOR: Record<Priority, string> = {
  low:    colors.textSecondary,
  medium: colors.process,
  high:   colors.warning,
  urgent: colors.danger,
}

// ─── New ticket modal ──────────────────────────────────────────────────────────

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [subject,    setSubject]    = useState('')
  const [message,    setMessage]    = useState('')
  const [priority,   setPriority]   = useState<Priority>('medium')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    const res = await fetch('/api/support-tickets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subject, message, priority }),
    })
    setSubmitting(false)
    if (res.ok) {
      toast.success('Ticket submitted')
      onCreated()
      onClose()
    } else {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Failed to submit ticket')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={480}>
        <RpxDialogHeader title="New Support Ticket" icon={LifeBuoy} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-3">
            <div>
              <label style={lbl}>Subject</label>
              <input
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Message</label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what's happening in detail…"
                style={{ ...inp, height: 'auto', padding: 8, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={lbl}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="capitalize"
                style={{ ...inp, width: 160 }}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn
            variant="primary"
            loading={submitting}
            disabled={!subject.trim() || !message.trim()}
            onClick={handleSubmit}
          >
            Submit ticket
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ mine, label, timestamp, children }: {
  mine: boolean; label?: string; timestamp: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth:     '82%',
          background:   mine ? colors.processBg : colors.neutralBg,
          borderRadius: mine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          padding:      '8px 11px',
        }}
      >
        <p style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginBottom: 3 }}>
          {mine ? 'You' : (label ?? 'Renovo Pro Support')} · {format.datetime(timestamp)}
        </p>
        <p style={{ fontSize: fontSize.base, color: colors.textPrimary, whiteSpace: 'pre-wrap' }}>{children}</p>
      </div>
    </div>
  )
}

// ─── Ticket card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, isAdmin, expanded, onToggle, onReplySent }: {
  ticket: SupportTicket
  isAdmin: boolean
  expanded: boolean
  onToggle: () => void
  onReplySent: () => void
}) {
  const s = statusStyle(ticket.status)
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)
  const needsReply = ticket.status === 'waiting_for_customer'

  async function handleReply() {
    if (!replyText.trim()) return
    setSending(true)
    const res = await fetch(`/api/support-tickets/${ticket.id}/reply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: replyText }),
    })
    setSending(false)
    if (res.ok) {
      setReplyText('')
      onReplySent()
    } else {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Failed to send reply')
    }
  }

  return (
    <div
      className="bg-white"
      style={{
        border:       `1px solid ${needsReply ? colors.warning : colors.border}`,
        borderRadius: 3,
        overflow:     'hidden',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 text-left"
        style={{ padding: '10px 14px', background: expanded ? colors.bg : '#fff' }}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textSecondary }} />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textSecondary }} />}
        <span
          className="truncate"
          style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary, flex: 1 }}
        >
          {ticket.subject}
        </span>
        <span className="capitalize shrink-0" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: PRIORITY_COLOR[ticket.priority] }}>
          {ticket.priority}
        </span>
        <span className="shrink-0" style={s.badge}>{s.label}</span>
        <span className="shrink-0" style={{ fontSize: fontSize.xs, color: colors.textMuted, minWidth: 78, textAlign: 'right' }}>
          {format.date(ticket.createdAt)}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.border}` }}>
          {ticket.status === 'closed' ? (
            <div className="flex flex-col items-center gap-1.5 text-center" style={{ padding: '22px 14px' }}>
              <Lock className="w-4 h-4" style={{ color: colors.textMuted }} />
              <p style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                This ticket is closed — its conversation is no longer available here.
              </p>
              <p style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                Need more help with this? Open a new ticket and mention the old subject.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2" style={{ padding: 14 }}>
                <Bubble mine timestamp={ticket.createdAt}>{ticket.message}</Bubble>
                {ticket.messages.map((m) => (
                  <Bubble key={m.id} mine={!m.sender} label={m.sender?.fullName} timestamp={m.createdAt}>
                    {m.message}
                  </Bubble>
                ))}
              </div>

              {isAdmin && (
                <div style={{ borderTop: `1px solid ${colors.border}`, padding: 12, background: colors.bg }}>
                  {ticket.status === 'resolved' && (
                    <p style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6 }}>
                      This ticket is resolved — sending a reply will reopen it.
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a reply…"
                      style={{ ...inp, flex: 1, height: 'auto', padding: 8, resize: 'vertical' }}
                    />
                    <Btn variant="primary" icon={Send} loading={sending} disabled={!replyText.trim()} onClick={handleReply}>
                      Send
                    </Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Support page ──────────────────────────────────────────────────────────────

export default function SupportPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdmin = session?.user?.role === 'admin'

  const { data, isLoading, error, mutate } = useSWR<{ tickets: SupportTicket[] }>('/api/support-tickets', fetcher)
  const [newOpen,  setNewOpen]  = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (searchParams.get('new') === '1' && isAdmin) {
      setNewOpen(true)
      router.replace('/app/support')
    }
  }, [searchParams, isAdmin, router])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tickets = data?.tickets ?? []

  return (
    <PortalPage title="Support">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ padding: 14 }}>
        <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 14 }}>
          Questions or issues with Renovo Pro go straight to our team here
          {isAdmin ? ' — reply to any thread below to keep the conversation going.' : '.'}
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 40, color: colors.textSecondary }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading tickets…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 40, color: colors.danger }}>
            {error instanceof Error ? error.message : 'Failed to load support tickets'}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2" style={{ padding: 48 }}>
            <LifeBuoy className="w-10 h-10" style={{ color: colors.disabled }} />
            <p style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>No support tickets yet.</p>
            {isAdmin && (
              <Btn variant="secondary" size="sm" icon={Plus} style={{ marginTop: 6 }} onClick={() => setNewOpen(true)}>
                Open a ticket
              </Btn>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {tickets.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                isAdmin={isAdmin}
                expanded={expanded.has(t.id)}
                onToggle={() => toggle(t.id)}
                onReplySent={() => mutate()}
              />
            ))}
          </div>
        )}
      </div>

      {newOpen && <NewTicketModal onClose={() => setNewOpen(false)} onCreated={() => mutate()} />}
    </PortalPage>
  )
}

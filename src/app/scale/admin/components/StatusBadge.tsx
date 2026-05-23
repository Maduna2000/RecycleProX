export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    processed: 'bg-green-100 text-green-700',
    voided:    'bg-red-100 text-red-600',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

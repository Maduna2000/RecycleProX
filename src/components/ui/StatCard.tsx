import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  label:     string
  value:     string
  sub?:      string
  icon:      React.ElementType
  iconColor?: string
  trend?:    'up' | 'down' | 'neutral'
  trendText?: string
}

/**
 * Desktop-style stat card.
 * Height: 80px (per spec). Border: 1px #E0E0E0. Radius: 8px.
 * Value: 24px bold. Label: 11px 500 muted. Icon: top-right.
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor = '#6C757D',
  trend,
  trendText,
}: StatCardProps) {
  return (
    <div
      className="relative bg-white flex flex-col justify-between overflow-hidden"
      style={{
        border:       '1px solid #E0E0E0',
        borderRadius: 8,
        boxShadow:    '0 1px 3px rgba(0,0,0,0.08)',
        padding:      '10px 14px',
        minHeight:    80,
      }}
    >
      {/* Icon — top right */}
      <div
        className="absolute top-2.5 right-3 opacity-60"
        style={{ color: iconColor }}
      >
        <Icon style={{ width: 22, height: 22 }} />
      </div>

      {/* Label */}
      <p
        className="truncate pr-8"
        style={{ fontSize: 11, fontWeight: 500, color: '#6C757D', letterSpacing: '0.03em', textTransform: 'uppercase' }}
      >
        {label}
      </p>

      {/* Value */}
      <p style={{ fontSize: 24, fontWeight: 700, color: '#212529', lineHeight: 1.1 }}>
        {value}
      </p>

      {/* Trend / sub */}
      <div className="flex items-center gap-1 mt-0.5" style={{ minHeight: 16 }}>
        {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-600 shrink-0" />}
        {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />}
        {trendText && (
          <span
            style={{ fontSize: 11, color: trend === 'up' ? '#217346' : trend === 'down' ? '#C0392B' : '#6C757D' }}
          >
            {trendText}
          </span>
        )}
        {!trendText && sub && (
          <span style={{ fontSize: 11, color: '#6C757D' }}>{sub}</span>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { LogOut, Scale, Printer, WifiOff, RefreshCw, Loader2 } from 'lucide-react'
import PrinterSetup from './components/PrinterSetup'
import { PrinterContext } from './PrinterContext'
import { waitForCapacitor } from '@/lib/scale/capacitorPrint'
import { useOfflineStore } from '@/stores/offlineStore'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { runSeeder } from '@/lib/offline/seeder'
import { getPendingScaleOrderCount } from '@/lib/offline/scaleOrderService'
import { claimOfflineCache, CacheOwnedByOtherCompanyError } from '@/lib/offline/cacheOwner'
import { registerSyncCallbacks, triggerSync, setSyncAllowed } from '@/lib/offline/sync'
import { toast } from 'sonner'

export default function ScaleClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname === '/scale/login' || pathname.startsWith('/scale/admin')

  const { data: session, status } = useSession()
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false)
  const [capacitorStatus, setCapacitorStatus] = useState<'checking' | 'yes' | 'no'>('checking')
  const [pendingScaleOrders, setPendingScaleOrders] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { isOnline, setPendingCount, setSyncing } = useOfflineStore()

  // Track when component is mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // The offline database is shared by every company that ever signs in on
  // this device. Claim it for the signed-in company BEFORE anything reads the
  // cache, seeds it or syncs queued orders — otherwise a kiosk switched to a
  // different company would show the old company's customers/products and send
  // its unsent orders into the wrong company's books (see cacheOwner.ts).
  const tenantId = session?.user?.tenantId
  const [cacheState, setCacheState] = useState<'checking' | 'ready' | 'blocked'>('checking')
  const [blockedUnsent, setBlockedUnsent] = useState(0)

  // This effect is declared before useOnlineStatus() below on purpose: effects
  // run in declaration order, so sync is already closed by the time that hook
  // fires its first triggerSync().
  useEffect(() => {
    if (isPublic) return
    setSyncAllowed(false)
    if (status !== 'authenticated') return
    if (!tenantId) { setSyncAllowed(true); setCacheState('ready'); return }
    let cancelled = false
    claimOfflineCache(tenantId)
      .then(() => {
        if (cancelled) return
        setSyncAllowed(true)
        setCacheState('ready')
        triggerSync() // anything queued while sync was closed goes out now
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof CacheOwnedByOtherCompanyError) {
          // Sync stays closed: those orders belong to another company.
          setBlockedUnsent(err.unsentCount)
          setCacheState('blocked')
        } else {
          // Storage trouble must not lock the operator out of weighing.
          setSyncAllowed(true)
          setCacheState('ready')
        }
      })
    return () => { cancelled = true }
  }, [isPublic, status, tenantId])

  // Leaving the Scale Station restores the default (sync allowed).
  useEffect(() => () => setSyncAllowed(true), [])

  // Initialize online status monitoring
  useOnlineStatus()

  // Register sync callbacks on mount
  useEffect(() => {
    registerSyncCallbacks({
      setPendingCount,
      setSyncing: (v) => {
        setSyncing(v)
        setIsSyncing(v)
      },
      showToast: (msg, type) => {
        if (type === 'success') toast.success(msg)
        else toast.error(msg)
      },
    })
  }, [setPendingCount, setSyncing])

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingScaleOrderCount()
    setPendingScaleOrders(count)
  }, [])

  // Check Capacitor status on mount
  useEffect(() => {
    waitForCapacitor().then(isAvailable => {
      setCapacitorStatus(isAvailable ? 'yes' : 'no')
    })
  }, [])

  // Seed the offline cache and watch the pending count — only once the cache
  // has been claimed for this company.
  useEffect(() => {
    if (cacheState !== 'ready') return

    // Seed offline data cache
    runSeeder().catch(() => { /* ignore seeder errors */ })

    // Get pending scale orders count
    refreshPendingCount()

    // Refresh count every 5 seconds to keep UI updated
    const interval = setInterval(refreshPendingCount, 5000)
    return () => clearInterval(interval)
  }, [cacheState, refreshPendingCount])

  // Refresh pending count when online status changes
  useEffect(() => {
    refreshPendingCount()
  }, [isOnline, refreshPendingCount])

  // Manual sync trigger
  const handleManualSync = useCallback(() => {
    if (isOnline && !isSyncing) {
      triggerSync()
    }
  }, [isOnline, isSyncing])

  if (isPublic) return <>{children}</>

  if (status === 'loading') {
    return (
      <div
        className="min-h-dvh bg-slate-900 flex items-center justify-center"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (!session) {
    redirect('/scale/login')
    return null
  }

  if (cacheState === 'checking') {
    return (
      <div
        className="min-h-dvh bg-slate-900 flex items-center justify-center"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (cacheState === 'blocked') {
    return (
      <div
        className="min-h-dvh bg-slate-900 flex items-center justify-center p-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Unsent orders on this device</h1>
          <p className="text-slate-600">
            This device still has {blockedUnsent} unsent {blockedUnsent === 1 ? 'order' : 'orders'} from
            another company. Sign in to that company so {blockedUnsent === 1 ? 'it' : 'they'} can be
            sent, then sign in here again.
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/scale/login' })}
            className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-dvh bg-slate-50 flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">Scale Station</span>

          {/* Offline indicator - only render after mount to avoid hydration mismatch */}
          {mounted && !isOnline && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-amber-500/20 rounded-full">
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 text-xs font-medium">Offline</span>
              {pendingScaleOrders > 0 && (
                <span className="text-amber-300 text-xs">• {pendingScaleOrders} pending</span>
              )}
            </div>
          )}

          {/* Pending sync indicator (when online but have pending orders) - only after mount */}
          {mounted && isOnline && pendingScaleOrders > 0 && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-blue-500/20 rounded-full hover:bg-blue-500/30 transition-colors"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="text-blue-300 text-xs font-medium">
                {isSyncing ? 'Syncing...' : `${pendingScaleOrders} pending`}
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm hidden sm:block">
            {session.user.fullName}
          </span>
          <button
            onClick={() => setPrinterSetupOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors relative"
            aria-label="Printer settings"
          >
            <Printer className="w-4 h-4" />
            {/* Capacitor status indicator - green=detected, red=not detected, yellow=checking */}
            <span
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${
                capacitorStatus === 'checking' ? 'bg-yellow-400' :
                capacitorStatus === 'yes' ? 'bg-emerald-400' : 'bg-red-400'
              }`}
              title={`Capacitor: ${capacitorStatus}`}
            />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/scale/login' })}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors px-3 min-h-[44px] rounded-lg"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>
      <PrinterContext.Provider value={{ openPrinterSetup: () => setPrinterSetupOpen(true) }}>
        <main className="flex-1 flex flex-col">{children}</main>
      </PrinterContext.Provider>
      <PrinterSetup open={printerSetupOpen} onClose={() => setPrinterSetupOpen(false)} />
    </div>
  )
}

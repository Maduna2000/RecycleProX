'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Printer, RotateCcw } from 'lucide-react'
import { PrinterConfig } from '@/lib/schemas/printer'
import { sendTestPrint } from '@/lib/scale/capacitorPrint'

interface Props {
  config: PrinterConfig
  onDone: () => void
  onBack: () => void
}

type TestState = 'idle' | 'printing' | 'success' | 'error'

export default function StepTestPrint({ config, onDone, onBack }: Props) {
  const [testState, setTestState] = useState<TestState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleTestPrint() {
    setTestState('printing')
    setErrorMessage(null)

    const result = await sendTestPrint(
      config.connectionType,
      config.address,
      config.paperWidth
    )

    if (result.success) {
      setTestState('success')
    } else {
      setTestState('error')
      setErrorMessage(result.error ?? 'Unknown error')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-slate-800">Test Your Printer</h3>
        <p className="text-sm text-slate-500 mt-1">Print a test page to verify everything works</p>
      </div>

      {/* Printer Summary */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-3">
          <Printer className="w-5 h-5 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-800">{config.label}</p>
            <p className="text-xs text-slate-500 font-mono">{config.address}</p>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200">
          <span>Paper: {config.paperWidth}</span>
          <span>Density: {config.density}</span>
          <span>Auto-cut: {config.autoCut ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* Test Print Button */}
      <div className="flex flex-col items-center py-6">
        {testState === 'idle' && (
          <button
            onClick={handleTestPrint}
            className="w-32 h-32 rounded-full bg-emerald-100 hover:bg-emerald-200 transition-colors flex flex-col items-center justify-center gap-2"
          >
            <Printer className="w-12 h-12 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Test Print</span>
          </button>
        )}

        {testState === 'printing' && (
          <div className="w-32 h-32 rounded-full bg-blue-100 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <span className="text-sm font-medium text-blue-700">Printing...</span>
          </div>
        )}

        {testState === 'success' && (
          <div className="w-32 h-32 rounded-full bg-emerald-100 flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Success!</span>
          </div>
        )}

        {testState === 'error' && (
          <div className="w-32 h-32 rounded-full bg-red-100 flex flex-col items-center justify-center gap-2">
            <XCircle className="w-12 h-12 text-red-600" />
            <span className="text-sm font-medium text-red-700">Failed</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {testState === 'error' && errorMessage && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
          <p className="font-medium">Print failed:</p>
          <p className="mt-1">{errorMessage}</p>
        </div>
      )}

      {/* Retry button */}
      {(testState === 'success' || testState === 'error') && (
        <button
          onClick={handleTestPrint}
          className="flex items-center justify-center gap-2 py-2 text-slate-500 hover:text-slate-700 text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Print again
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
        >
          {testState === 'success' ? 'Done' : 'Skip Test'}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'

export interface SignatureCanvasHandle {
  /** Returns PNG blob of the signature, or null if canvas is blank */
  getBlob(): Promise<Blob | null>
  /** Clears the canvas */
  clear(): void
  /** Returns true if any strokes have been drawn */
  isEmpty(): boolean
}

interface SignatureCanvasProps {
  width?: number
  height?: number
  className?: string
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ width = 400, height = 120, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing   = useRef(false)
    const hasStrokes = useRef(false)

    // Initialize canvas
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#111111'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }, [width, height])

    function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width  / rect.width
      const scaleY = canvas.height / rect.height
      if ('touches' in e) {
        const touch = e.touches[0]!
        return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
    }

    const onStart = useCallback((e: MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      e.preventDefault()
      drawing.current = true
      hasStrokes.current = true
      const ctx = canvas.getContext('2d')!
      const pos = getPos(e, canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }, [])

    const onMove = useCallback((e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      e.preventDefault()
      const ctx = canvas.getContext('2d')!
      const pos = getPos(e, canvas)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }, [])

    const onEnd = useCallback(() => { drawing.current = false }, [])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.addEventListener('mousedown',  onStart as EventListener)
      canvas.addEventListener('mousemove',  onMove  as EventListener)
      canvas.addEventListener('mouseup',    onEnd)
      canvas.addEventListener('mouseleave', onEnd)
      canvas.addEventListener('touchstart', onStart as EventListener, { passive: false })
      canvas.addEventListener('touchmove',  onMove  as EventListener, { passive: false })
      canvas.addEventListener('touchend',   onEnd)
      return () => {
        canvas.removeEventListener('mousedown',  onStart as EventListener)
        canvas.removeEventListener('mousemove',  onMove  as EventListener)
        canvas.removeEventListener('mouseup',    onEnd)
        canvas.removeEventListener('mouseleave', onEnd)
        canvas.removeEventListener('touchstart', onStart as EventListener)
        canvas.removeEventListener('touchmove',  onMove  as EventListener)
        canvas.removeEventListener('touchend',   onEnd)
      }
    }, [onStart, onMove, onEnd])

    useImperativeHandle(ref, () => ({
      getBlob() {
        return new Promise<Blob | null>((resolve) => {
          if (!hasStrokes.current) { resolve(null); return }
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png')
        })
      },
      clear() {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        hasStrokes.current = false
      },
      isEmpty() { return !hasStrokes.current },
    }))

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ width: '100%', height: `${height}px`, touchAction: 'none' }}
          className="border border-gray-300 rounded-md bg-white cursor-crosshair"
        />
      </div>
    )
  }
)

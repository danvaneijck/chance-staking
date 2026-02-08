import React, { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'rect' | 'circle'
}

const COLORS = [
  '#8B6FFF', '#A78BFF', '#6B4FD6',  // purple
  '#38bdf8', '#0ea5e9',              // cyan
  '#f472b6', '#ec4899',              // pink
  '#f59e0b', '#fbbf24',              // gold
  '#22c55e', '#4ade80',              // green
  '#F0F0F5',                          // white
]

export default function Confetti() {
  const showConfetti = useStore((s) => s.showConfetti)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number>(0)

  const createParticles = useCallback(() => {
    const particles: Particle[] = []
    const count = 150
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 8 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      })
    }
    return particles
  }, [])

  useEffect(() => {
    if (!showConfetti) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    particlesRef.current = createParticles()
    let startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      let alive = false
      for (const p of particlesRef.current) {
        // Physics
        p.vy += 0.08 // gravity
        p.vx *= 0.99 // air resistance
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed

        // Fade out after 2s
        if (elapsed > 2000) {
          p.opacity = Math.max(0, p.opacity - 0.02)
        }

        if (p.y < canvas.height + 50 && p.opacity > 0) {
          alive = true
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate((p.rotation * Math.PI) / 180)
          ctx.globalAlpha = p.opacity

          if (p.shape === 'rect') {
            ctx.fillStyle = p.color
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          } else {
            ctx.beginPath()
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
            ctx.fillStyle = p.color
            ctx.fill()
          }
          ctx.restore()
        }
      }

      if (alive) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        useStore.setState({ showConfetti: false })
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [showConfetti, createParticles])

  if (!showConfetti) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  )
}

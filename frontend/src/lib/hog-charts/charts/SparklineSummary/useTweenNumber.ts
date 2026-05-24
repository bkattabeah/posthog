import { useEffect, useRef, useState } from 'react'

/**
 * Tweens a number toward `target` over `duration` ms using ease-out cubic.
 * When `target` changes mid-tween, the animation restarts from the current
 * displayed value — no snap. Cleans up its RAF on unmount.
 */
export function useTweenNumber(target: number, duration = 350): number {
    const [value, setValue] = useState(target)
    const valueRef = useRef(target)
    valueRef.current = value

    useEffect(() => {
        if (duration <= 0 || !Number.isFinite(target)) {
            setValue(target)
            return
        }
        const from = valueRef.current
        if (from === target) {
            return
        }
        const start = performance.now()
        let raf = 0
        const tick = (now: number): void => {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 3)
            setValue(from + (target - from) * eased)
            if (t < 1) {
                raf = requestAnimationFrame(tick)
            }
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, duration])

    return value
}

import React from 'react'

export interface MetricTileChange {
    /** Drives arrow direction and color (positive ≥ 0). */
    value: number
    /** Rendered next to the arrow. Already-resolved so the tile stays format-agnostic. */
    label: React.ReactNode
}

export interface ChangeColor {
    background: string
    foreground: string
}

export interface MetricTileProps {
    title: React.ReactNode
    /** Already-resolved headline — a formatted number, string, or any node. */
    value: React.ReactNode
    /** Comparison pill. `null` or omitted hides the pill. */
    delta?: MetricTileChange | null
    /** Which direction the metric reads as "good". `up` (default) paints positive deltas
     *  with the positive color; `down` flips the mapping (e.g. for an error-rate tile). */
    goodDirection?: 'up' | 'down'
    subtitle?: React.ReactNode
    /** Viz slot — typically a `<Sparkline>` or similar. Omitting it yields a
     *  number-only tile. */
    children?: React.ReactNode
    /** Colors for the change pill when the value reads as good. */
    positiveColor?: ChangeColor
    /** Colors for the change pill when the value reads as bad. */
    negativeColor?: ChangeColor
    className?: string
    dataAttr?: string
}

const DEFAULT_POSITIVE_COLOR: ChangeColor = { background: 'rgb(56 134 0 / 10%)', foreground: '#388600' }
const DEFAULT_NEGATIVE_COLOR: ChangeColor = { background: 'rgb(219 55 7 / 10%)', foreground: '#db3707' }

export function MetricTile({
    title,
    value,
    delta,
    goodDirection = 'up',
    subtitle,
    children,
    positiveColor = DEFAULT_POSITIVE_COLOR,
    negativeColor = DEFAULT_NEGATIVE_COLOR,
    className,
    dataAttr,
}: MetricTileProps): React.ReactElement {
    const showDelta = delta != null && Number.isFinite(delta.value)
    const positive = showDelta ? delta.value >= 0 : false
    const isGood = goodDirection === 'up' ? positive : !positive
    const pillColors = isGood ? positiveColor : negativeColor

    return (
        <div className={`flex flex-col w-full ${className ?? ''}`} data-attr={dataAttr}>
            <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{title}</div>
                {showDelta && <ChangePill positive={positive} label={delta.label} colors={pillColors} />}
            </div>

            <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{value}</div>

            <div className="mt-1 text-sm opacity-60">{subtitle ?? ' '}</div>

            {children}
        </div>
    )
}

interface ChangePillProps {
    positive: boolean
    label: React.ReactNode
    colors: ChangeColor
}

function ChangePill({ positive, label, colors }: ChangePillProps): React.ReactElement {
    return (
        <div
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
            style={{ background: colors.background, color: colors.foreground }}
        >
            <Chevron up={positive} />
            <span className="tabular-nums">{label}</span>
        </div>
    )
}

function Chevron({ up }: { up: boolean }): React.ReactElement {
    return (
        <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={up ? '' : 'rotate-180'}
        >
            <path d="M2 6.5 L5 3.5 L8 6.5" />
        </svg>
    )
}

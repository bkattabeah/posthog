import React, { useEffect, useMemo, useState } from 'react'

import { useChartHover } from '../../core/chart-context'
import { ChartErrorBoundary } from '../../core/ChartErrorBoundary'
import type { ChartTheme, Series } from '../../core/types'
import { LineChart } from '../LineChart'
import { useTweenNumber } from './useTweenNumber'

export interface SparklineSummaryProps {
    /** Title shown in the top-left of the card (e.g. "Total Revenue"). */
    title: React.ReactNode
    /** Series values. The same length as `labels`. */
    data: number[]
    /** X-axis labels — also used as the subtitle for the currently active point. */
    labels: string[]
    /** Theme. Only `colors[0]` and `backgroundColor` are read by default. */
    theme: ChartTheme
    /** Line + fill color. Falls back to `theme.colors[0]`. */
    color?: string
    /** Height of the chart area in pixels. Defaults to 120. */
    chartHeight?: number
    /** Formats the big headline number. Defaults to `value.toLocaleString()`. */
    formatValue?: (value: number) => string
    /** Formats the change pill's percent. Defaults to `+12.3%` / `-12.3%`. */
    formatChange?: (percent: number) => string
    /** Hides the change pill. Defaults to true (shown). */
    showChange?: boolean
    /** Tween duration in ms for the headline number. Defaults to 350. */
    animationMs?: number
    className?: string
    /** `data-attr` applied to the root wrapper. */
    dataAttr?: string
    onError?: (error: Error, info: React.ErrorInfo) => void
}

const DEFAULT_COLOR = '#22d3ee'
const DEFAULT_FORMAT_VALUE = (v: number): string => v.toLocaleString()
const DEFAULT_FORMAT_CHANGE = (p: number): string => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`

const ROOT_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', width: '100%' }

export function SparklineSummary(props: SparklineSummaryProps): React.ReactElement {
    const { onError, ...rest } = props
    return (
        <ChartErrorBoundary onError={onError}>
            <SparklineSummaryInner {...rest} />
        </ChartErrorBoundary>
    )
}

function SparklineSummaryInner({
    title,
    data,
    labels,
    theme,
    color,
    chartHeight = 120,
    formatValue = DEFAULT_FORMAT_VALUE,
    formatChange = DEFAULT_FORMAT_CHANGE,
    showChange = true,
    animationMs = 350,
    className,
    dataAttr,
}: Omit<SparklineSummaryProps, 'onError'>): React.ReactElement {
    const lastIndex = data.length - 1
    const [hoverIndex, setHoverIndex] = useState(-1)
    const activeIndex = hoverIndex >= 0 ? hoverIndex : lastIndex

    const resolvedColor = color ?? theme.colors[0] ?? DEFAULT_COLOR
    const series = useMemo<Series[]>(
        () => [
            {
                key: 'sparkline',
                label: typeof title === 'string' ? title : 'value',
                data,
                color: resolvedColor,
                fill: { gradient: true, opacity: 0.35 },
            },
        ],
        [data, resolvedColor, title]
    )

    const rawValue = data[activeIndex] ?? 0
    const tweenedValue = useTweenNumber(rawValue, animationMs)

    const firstNonZero = useMemo(() => data.find((v) => v !== 0 && Number.isFinite(v)), [data])
    const changePercent = useMemo(() => {
        if (firstNonZero == null) {
            return null
        }
        return ((rawValue - firstNonZero) / firstNonZero) * 100
    }, [rawValue, firstNonZero])

    const isPositive = changePercent != null && changePercent >= 0

    return (
        <div className={className} data-attr={dataAttr} style={ROOT_STYLE}>
            <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-default">{title}</div>
                {showChange && changePercent != null && Number.isFinite(changePercent) && (
                    <ChangePill positive={isPositive} label={formatChange(changePercent)} />
                )}
            </div>

            <div className="mt-2 text-4xl font-bold tracking-tight text-default tabular-nums">
                {formatValue(tweenedValue)}
            </div>

            <div className="mt-1 text-sm text-muted">{labels[activeIndex] ?? ' '}</div>

            <div
                style={{
                    marginTop: 16,
                    height: chartHeight,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <LineChart
                    series={series}
                    labels={labels}
                    theme={theme}
                    config={{
                        hideXAxis: true,
                        hideYAxis: true,
                        showCrosshair: true,
                        tooltip: { enabled: false },
                    }}
                >
                    <HoverWatcher onHoverChange={setHoverIndex} />
                </LineChart>
            </div>
        </div>
    )
}

function HoverWatcher({ onHoverChange }: { onHoverChange: (i: number) => void }): null {
    const { hoverIndex } = useChartHover()
    useEffect(() => {
        onHoverChange(hoverIndex)
    }, [hoverIndex, onHoverChange])
    return null
}

interface ChangePillProps {
    positive: boolean
    label: string
}

function ChangePill({ positive, label }: ChangePillProps): React.ReactElement {
    const cls = positive
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    return (
        <div
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${cls}`}
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
            style={{ transform: up ? 'none' : 'rotate(180deg)' }}
        >
            <path d="M2 6.5 L5 3.5 L8 6.5" />
        </svg>
    )
}

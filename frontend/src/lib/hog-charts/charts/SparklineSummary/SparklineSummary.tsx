import React, { useEffect, useMemo, useState } from 'react'

import { useChartHover } from '../../core/chart-context'
import { ChartErrorBoundary } from '../../core/ChartErrorBoundary'
import type { ChartTheme, LineChartConfig, Series } from '../../core/types'
import { percentage } from '../../utils/format'
import { LineChart } from '../LineChart'
import { useTweenNumber } from './useTweenNumber'

export interface SparklineSummaryProps {
    title: React.ReactNode
    /** Series values. Same length as `labels`. */
    data: number[]
    labels: string[]
    theme: ChartTheme
    /** Line + fill color. Falls back to `theme.colors[0]`. */
    color?: string
    chartHeight?: number
    formatValue?: (value: number) => string
    formatChange?: (percent: number) => string
    /** Whether to show the change pill. */
    showChange?: boolean
    /** Colors for the change pill when the value rose vs. fell. */
    positiveColor?: ChangeColor
    negativeColor?: ChangeColor
    /** Peak opacity of the gradient fill under the line (0–1). Defaults to 0.35. */
    fillOpacity?: number
    /** Class applied to the chart container — useful for removing the default top margin
     *  when the chart should bleed to the card edges. Defaults to `mt-4`. */
    chartClassName?: string
    animationMs?: number
    className?: string
    dataAttr?: string
    onError?: (error: Error, info: React.ErrorInfo) => void
}

export interface ChangeColor {
    background: string
    foreground: string
}

const DEFAULT_POSITIVE_COLOR: ChangeColor = { background: 'rgb(56 134 0 / 10%)', foreground: '#388600' }
const DEFAULT_NEGATIVE_COLOR: ChangeColor = { background: 'rgb(219 55 7 / 10%)', foreground: '#db3707' }

const DEFAULT_FORMAT_VALUE = (v: number): string => v.toLocaleString()
const DEFAULT_FORMAT_CHANGE = (p: number): string => {
    const formatted = percentage(p / 100, 1, true)
    return p > 0 ? `+${formatted}` : formatted
}

const SPARKLINE_CONFIG: LineChartConfig = {
    hideXAxis: true,
    hideYAxis: true,
    showCrosshair: true,
    tooltip: { enabled: false },
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
}

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
    positiveColor = DEFAULT_POSITIVE_COLOR,
    negativeColor = DEFAULT_NEGATIVE_COLOR,
    fillOpacity = 0.35,
    chartClassName = 'mt-4',
    animationMs = 350,
    className,
    dataAttr,
}: Omit<SparklineSummaryProps, 'onError'>): React.ReactElement | null {
    const lastIndex = data.length - 1
    const [hoverIndex, setHoverIndex] = useState(-1)
    const activeIndex = hoverIndex >= 0 ? hoverIndex : lastIndex

    const resolvedColor = color ?? theme.colors[0]
    const seriesLabel = typeof title === 'string' ? title : 'sparkline'
    const series = useMemo<Series[]>(
        () => [
            {
                key: 'sparkline',
                label: seriesLabel,
                data,
                color: resolvedColor,
                fill: { gradient: true, opacity: fillOpacity },
            },
        ],
        [data, resolvedColor, seriesLabel, fillOpacity]
    )

    const rawValue = data[activeIndex] ?? 0
    const tweenedValue = useTweenNumber(rawValue, animationMs)

    const baselineValue = useMemo(() => data.find((v) => v !== 0 && Number.isFinite(v)), [data])
    const changePercent = baselineValue == null ? null : ((rawValue - baselineValue) / Math.abs(baselineValue)) * 100
    const isPositive = changePercent != null && changePercent >= 0

    if (lastIndex < 0) {
        return null
    }

    return (
        <div className={`flex flex-col w-full ${className ?? ''}`} data-attr={dataAttr}>
            <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{title}</div>
                {showChange && changePercent != null && Number.isFinite(changePercent) && (
                    <ChangePill
                        positive={isPositive}
                        label={formatChange(changePercent)}
                        colors={isPositive ? positiveColor : negativeColor}
                    />
                )}
            </div>

            <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{formatValue(tweenedValue)}</div>

            <div className="mt-1 text-sm opacity-60">{labels[activeIndex] ?? ' '}</div>

            <div className={`relative flex flex-col ${chartClassName}`} style={{ height: chartHeight }}>
                <LineChart series={series} labels={labels} theme={theme} config={SPARKLINE_CONFIG}>
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

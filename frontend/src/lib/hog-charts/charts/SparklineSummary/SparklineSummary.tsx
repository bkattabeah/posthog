import React, { useMemo, useState } from 'react'

import { ChartErrorBoundary } from '../../core/ChartErrorBoundary'
import type { ChartTheme } from '../../core/types'
import { percentage } from '../../utils/format'
import { type ChangeColor, MetricTile, type MetricTileChange } from '../MetricTile/MetricTile'
import { Sparkline } from '../Sparkline/Sparkline'
import { useTweenNumber } from './useTweenNumber'

export type { ChangeColor } from '../MetricTile/MetricTile'

export interface SparklineSummaryProps {
    title: React.ReactNode
    /** Series values. Same length as `labels`. */
    data: number[]
    labels: string[]
    theme: ChartTheme
    /** Line + fill color. Falls back to `theme.colors[0]`. */
    color?: string
    chartHeight?: number
    /** Formats the headline number — applied both to the resting value and to the hover-driven
     *  value, after the tween. */
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
    /** Resting headline value. When set, replaces `data[lastIndex]` as the value shown when not
     *  hovering — the sparkline still draws from `data`. Use this when the metric's aggregate
     *  (e.g. a sum, average, or backend-computed total) doesn't match the last data point. */
    value?: number
    /** Comparison pill. When supplied, the pill is rendered fixed across hover and the
     *  first-non-zero fallback is skipped. Pass `null` to explicitly suppress the pill. When
     *  omitted, the pill is computed from the hovered/resting value against the first
     *  non-zero point. `label` defaults to `formatChange(value)`. */
    change?: { value: number; label?: React.ReactNode } | null
    /** Which direction reads as "good" for the change pill. Defaults to `up`. */
    goodDirection?: 'up' | 'down'
    /** Caption under the headline. Defaults to `labels[activeIndex]`, which follows the
     *  hovered point. */
    subtitle?: React.ReactNode
}

const DEFAULT_FORMAT_VALUE = (v: number): string => v.toLocaleString()
const DEFAULT_FORMAT_CHANGE = (p: number): string => {
    const formatted = percentage(p / 100, 1, true)
    return p > 0 ? `+${formatted}` : formatted
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
    positiveColor,
    negativeColor,
    fillOpacity = 0.35,
    chartClassName = 'mt-4',
    animationMs = 350,
    className,
    dataAttr,
    value,
    change,
    goodDirection = 'up',
    subtitle,
}: Omit<SparklineSummaryProps, 'onError'>): React.ReactElement | null {
    const lastIndex = data.length - 1
    const [hoverIndex, setHoverIndex] = useState(-1)
    const activeIndex = hoverIndex >= 0 ? hoverIndex : lastIndex

    const restingValue = value ?? data[lastIndex] ?? 0
    const tweenTarget = hoverIndex >= 0 ? (data[hoverIndex] ?? 0) : restingValue
    const tweenedValue = useTweenNumber(tweenTarget, animationMs)

    // Fallback change calc — only used when `change` is not explicitly passed.
    const baselineValue = useMemo(() => data.find((v) => v !== 0 && Number.isFinite(v)), [data])
    const liveValue = data[activeIndex] ?? 0
    const fallbackChangePercent =
        baselineValue == null ? null : ((liveValue - baselineValue) / Math.abs(baselineValue)) * 100

    if (lastIndex < 0) {
        return null
    }

    const delta = resolveDelta({
        showChange,
        change,
        fallbackChangePercent,
        formatChange,
    })

    const resolvedSubtitle = subtitle ?? labels[activeIndex] ?? ' '

    return (
        <MetricTile
            title={title}
            value={formatValue(tweenedValue)}
            delta={delta}
            goodDirection={goodDirection}
            subtitle={resolvedSubtitle}
            positiveColor={positiveColor}
            negativeColor={negativeColor}
            className={className}
            dataAttr={dataAttr}
        >
            <Sparkline
                data={data}
                labels={labels}
                theme={theme}
                color={color}
                height={chartHeight}
                fillOpacity={fillOpacity}
                onHoverIndexChange={setHoverIndex}
                className={chartClassName}
            />
        </MetricTile>
    )
}

function resolveDelta({
    showChange,
    change,
    fallbackChangePercent,
    formatChange,
}: {
    showChange: boolean
    change: SparklineSummaryProps['change']
    fallbackChangePercent: number | null
    formatChange: (p: number) => string
}): MetricTileChange | null {
    if (!showChange) {
        return null
    }
    if (change !== undefined) {
        if (change === null) {
            return null
        }
        return {
            value: change.value,
            label: change.label ?? formatChange(change.value),
        }
    }
    if (fallbackChangePercent == null || !Number.isFinite(fallbackChangePercent)) {
        return null
    }
    return {
        value: fallbackChangePercent,
        label: formatChange(fallbackChangePercent),
    }
}

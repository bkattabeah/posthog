import { Meta, StoryObj } from '@storybook/react'

import { Stage, useReactiveTheme } from '../../story-helpers'
import { SparklineSummary } from './SparklineSummary'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const REVENUE = [4200, 5100, 4700, 5400, 6000, 5800, 6400, 6900, 7200, 7700, 8100, 8800]
const FALLING = [9800, 9200, 8600, 8400, 7700, 7300, 6900, 6500, 6000, 5400, 4800, 4200]

const meta: Meta = { title: 'Components/HogCharts/SparklineSummary', parameters: { layout: 'centered' } }
export default meta

type Story = StoryObj<{}>

export const Default: Story = {
    render: () => {
        const theme = useReactiveTheme()
        return (
            <Stage width={360} height={320}>
                <div className="rounded-xl border border-primary bg-surface-primary p-5 shadow-sm w-full h-full flex flex-col">
                    <SparklineSummary
                        title="Total Revenue"
                        data={REVENUE}
                        labels={MONTHS}
                        theme={theme}
                        color="#22d3ee"
                        chartClassName="mt-4 -mx-5 -mb-5"
                        formatValue={(v) => `US$${Math.round(v).toLocaleString()}`}
                    />
                </div>
            </Stage>
        )
    },
}

export const Falling: Story = {
    render: () => {
        const theme = useReactiveTheme()
        return (
            <Stage width={360} height={320}>
                <div className="rounded-xl border border-primary bg-surface-primary p-5 shadow-sm w-full h-full flex flex-col">
                    <SparklineSummary
                        title="Active users"
                        data={FALLING}
                        labels={MONTHS}
                        theme={theme}
                        color="#fb7185"
                        chartClassName="mt-4 -mx-5 -mb-5"
                        formatValue={(v) => Math.round(v).toLocaleString()}
                    />
                </div>
            </Stage>
        )
    },
}

export const NoChange: Story = {
    render: () => {
        const theme = useReactiveTheme()
        return (
            <Stage width={360} height={320}>
                <div className="rounded-xl border border-primary bg-surface-primary p-5 shadow-sm w-full h-full flex flex-col">
                    <SparklineSummary
                        title="Daily signups"
                        data={REVENUE}
                        labels={MONTHS}
                        theme={theme}
                        color="#22d3ee"
                        showChange={false}
                        chartClassName="mt-4 -mx-5 -mb-5"
                        formatValue={(v) => Math.round(v).toLocaleString()}
                    />
                </div>
            </Stage>
        )
    },
}

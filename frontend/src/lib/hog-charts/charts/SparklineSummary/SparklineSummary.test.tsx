import { render } from '@testing-library/react'

import type { ChartTheme } from '../../core/types'
import { ensureJsdom } from '../../testing/jsdom'
import { SparklineSummary } from './SparklineSummary'

const THEME: ChartTheme = { colors: ['#22d3ee'], backgroundColor: '#ffffff' }
const LABELS = ['Jan', 'Feb', 'Mar', 'Apr']

describe('SparklineSummary', () => {
    beforeAll(() => {
        ensureJsdom()
    })

    it('shows the last data point and label by default', () => {
        const { container } = render(
            <SparklineSummary
                title="Total"
                data={[100, 200, 300, 400]}
                labels={LABELS}
                theme={THEME}
                formatValue={(v) => `$${Math.round(v)}`}
            />
        )
        expect(container.textContent).toContain('$400')
        expect(container.textContent).toContain('Apr')
    })

    it('renders a positive change pill when the series ends above the first non-zero value', () => {
        const { container } = render(
            <SparklineSummary
                title="Total"
                data={[100, 200, 300, 400]}
                labels={LABELS}
                theme={THEME}
                formatValue={(v) => `$${Math.round(v)}`}
            />
        )
        // (400 - 100) / 100 = +300.0%
        expect(container.textContent).toContain('+300.0%')
    })

    it('renders a negative change pill when the series ends below the first value', () => {
        const { container } = render(
            <SparklineSummary
                title="Total"
                data={[400, 300, 200, 100]}
                labels={LABELS}
                theme={THEME}
                formatValue={(v) => `$${Math.round(v)}`}
            />
        )
        expect(container.textContent).toContain('-75.0%')
    })

    it('skips the change pill when showChange is false', () => {
        const { container } = render(
            <SparklineSummary
                title="Total"
                data={[100, 200]}
                labels={['Jan', 'Feb']}
                theme={THEME}
                showChange={false}
            />
        )
        expect(container.textContent).not.toContain('%')
    })

    it('omits the change pill when the first non-zero value is undefined', () => {
        const { container } = render(
            <SparklineSummary title="Total" data={[0, 0, 0]} labels={['Jan', 'Feb', 'Mar']} theme={THEME} />
        )
        expect(container.textContent).not.toContain('%')
    })
})

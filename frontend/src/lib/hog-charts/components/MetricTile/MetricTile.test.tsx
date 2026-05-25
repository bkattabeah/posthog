import { render } from '@testing-library/react'

import { MetricTile } from './MetricTile'

const POSITIVE_COLOR = { background: 'rgb(0 200 0 / 10%)', foreground: '#008800' }
const NEGATIVE_COLOR = { background: 'rgb(200 0 0 / 10%)', foreground: '#aa0000' }

describe('MetricTile', () => {
    it('renders the value', () => {
        const { container } = render(<MetricTile title="Revenue" value="$8,800" />)
        expect(container.textContent).toContain('Revenue')
        expect(container.textContent).toContain('$8,800')
    })

    it('renders a supplied delta with the positive color and an up arrow', () => {
        const { container } = render(
            <MetricTile
                title="Revenue"
                value="$8,800"
                delta={{ value: 12.5, label: '+12.5%' }}
                positiveColor={POSITIVE_COLOR}
                negativeColor={NEGATIVE_COLOR}
            />
        )
        expect(container.textContent).toContain('+12.5%')
        const pill = container.querySelector('.rounded-full') as HTMLElement | null
        expect(pill).not.toBeNull()
        expect(pill?.style.color).toBe('rgb(0, 136, 0)')
        const chevron = pill?.querySelector('svg')
        expect(chevron?.className.baseVal ?? chevron?.getAttribute('class')).not.toContain('rotate-180')
    })

    it('renders a supplied delta with the negative color and a down arrow when negative', () => {
        const { container } = render(
            <MetricTile
                title="Revenue"
                value="$8,800"
                delta={{ value: -4.2, label: '-4.2%' }}
                positiveColor={POSITIVE_COLOR}
                negativeColor={NEGATIVE_COLOR}
            />
        )
        const pill = container.querySelector('.rounded-full') as HTMLElement | null
        expect(pill?.style.color).toBe('rgb(170, 0, 0)')
        const chevron = pill?.querySelector('svg')
        expect(chevron?.className.baseVal ?? chevron?.getAttribute('class')).toContain('rotate-180')
    })

    it('flips the pill color for a negative delta when goodDirection is "down"', () => {
        const { container } = render(
            <MetricTile
                title="Error rate"
                value="0.5%"
                delta={{ value: -1.2, label: '-1.2%' }}
                goodDirection="down"
                positiveColor={POSITIVE_COLOR}
                negativeColor={NEGATIVE_COLOR}
            />
        )
        const pill = container.querySelector('.rounded-full') as HTMLElement | null
        expect(pill?.style.color).toBe('rgb(0, 136, 0)')
    })

    it('renders no pill when delta is null or omitted', () => {
        const { container: omitted } = render(<MetricTile title="Revenue" value="$8,800" />)
        expect(omitted.querySelector('.rounded-full')).toBeNull()

        const { container: nulled } = render(<MetricTile title="Revenue" value="$8,800" delta={null} />)
        expect(nulled.querySelector('.rounded-full')).toBeNull()
    })

    it('renders nothing in the viz slot when no children are provided', () => {
        const { container } = render(<MetricTile title="Revenue" value="$8,800" />)
        // Headline + title + (empty) subtitle = three text containers, no <canvas>.
        expect(container.querySelector('canvas')).toBeNull()
    })

    it('renders the viz slot when children are provided', () => {
        const { container } = render(
            <MetricTile title="Revenue" value="$8,800">
                <div data-testid="viz-slot" />
            </MetricTile>
        )
        expect(container.querySelector('[data-testid="viz-slot"]')).not.toBeNull()
    })

    it('renders subtitle when supplied', () => {
        const { container } = render(<MetricTile title="Revenue" value="$8,800" subtitle="Dec" />)
        expect(container.textContent).toContain('Dec')
    })

    it('applies dataAttr to the root', () => {
        const { container } = render(<MetricTile title="Revenue" value="$8,800" dataAttr="metric-revenue" />)
        expect(container.querySelector('[data-attr="metric-revenue"]')).not.toBeNull()
    })
})

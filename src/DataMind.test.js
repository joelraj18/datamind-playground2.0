import { act, fireEvent, render, screen } from '@testing-library/react';
import DataMind from './DataMind';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
beforeAll(() => {
    window.scrollTo = jest.fn();
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => localStorage.clear());

test('register, load sample data, explore and ask a question', () => {
    jest.useFakeTimers();
    render(<DataMind />);

    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    fireEvent.change(screen.getByPlaceholderText('Jane Appleseed'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('heading', { name: 'Datasets' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('datamind_current_user'))).not.toHaveProperty('password');

    fireEvent.click(screen.getByRole('button', { name: /Try a sample dataset/ }));
    expect(screen.getByRole('heading', { name: 'sample_phone_sales' })).toBeInTheDocument();

    for (const tab of ['Correlation', 'Bivariate', 'Insights', 'Decision Center', 'Data Quality', 'Segmentation', 'Predictive', 'Python Template']) {
        fireEvent.click(screen.getByRole('tab', { name: tab }));
        expect(screen.getByRole('tabpanel', { name: tab })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'average of price' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText(/The average of/)).toBeInTheDocument();
    jest.useRealTimers();
});

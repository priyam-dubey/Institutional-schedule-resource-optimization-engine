import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AvailabilityGrid, { fromKeyMap, toKeyMap } from '../components/common/AvailabilityGrid';

const periods = [{ index: 0, label: 'I', isBreak: false }, { index: 1, label: 'Break', isBreak: true }, { index: 2, label: 'II', isBreak: false }];

describe('AvailabilityGrid', () => {
  it('cycles free → unavailable → preferred → free and skips break periods', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<AvailabilityGrid days={['MONDAY']} periods={periods} value={{}} onChange={onChange} allowPreferred />);
    expect(screen.getAllByRole('button')).toHaveLength(2); // break column has no cell
    await userEvent.click(screen.getByLabelText('MONDAY I: available'));
    expect(onChange).toHaveBeenLastCalledWith({ 'MONDAY|0': 'UNAVAILABLE' });
    rerender(<AvailabilityGrid days={['MONDAY']} periods={periods} value={{ 'MONDAY|0': 'UNAVAILABLE' }} onChange={onChange} allowPreferred />);
    await userEvent.click(screen.getByLabelText('MONDAY I: UNAVAILABLE'));
    expect(onChange).toHaveBeenLastCalledWith({ 'MONDAY|0': 'PREFERRED' });
    rerender(<AvailabilityGrid days={['MONDAY']} periods={periods} value={{ 'MONDAY|0': 'PREFERRED' }} onChange={onChange} allowPreferred />);
    await userEvent.click(screen.getByLabelText('MONDAY I: PREFERRED'));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('two-state mode (rooms) never produces PREFERRED, and disabled grids ignore clicks', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<AvailabilityGrid days={['MONDAY']} periods={periods} value={{ 'MONDAY|2': 'UNAVAILABLE' }} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('MONDAY II: UNAVAILABLE'));
    expect(onChange).toHaveBeenLastCalledWith({});
    rerender(<AvailabilityGrid days={['MONDAY']} periods={periods} value={{}} onChange={onChange} disabled />);
    onChange.mockClear();
    await userEvent.click(screen.getByLabelText('MONDAY I: available'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('converts to and from the API representation losslessly', () => {
    const api = [{ day: 'MONDAY' as const, periodIndex: 0, kind: 'UNAVAILABLE' as const }, { day: 'FRIDAY' as const, periodIndex: 2, kind: 'PREFERRED' as const }];
    expect(fromKeyMap(toKeyMap(api))).toEqual(api);
  });
});

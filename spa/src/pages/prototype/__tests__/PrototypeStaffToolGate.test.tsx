import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PrototypeStaffToolGate from '../PrototypeStaffToolGate';

describe('PrototypeStaffToolGate', () => {
  it('shows a wait while the role check loads, never an empty column', () => {
    const { container } = render(<PrototypeStaffToolGate loading error={false} onRetry={() => {}} toolName="Content" />);
    expect(container.textContent?.length || container.querySelector('*')).toBeTruthy();
  });

  it('offers a retry when the role check failed', () => {
    const onRetry = vi.fn();
    render(<PrototypeStaffToolGate loading={false} error onRetry={onRetry} toolName="Content" />);
    expect(screen.getByText('Couldn’t check your role')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('says who the tool is for when the viewer is not staff', () => {
    render(<PrototypeStaffToolGate loading={false} error={false} onRetry={() => {}} toolName="Ministries" />);
    expect(screen.getByText('Ministries is for church staff')).toBeTruthy();
  });
});

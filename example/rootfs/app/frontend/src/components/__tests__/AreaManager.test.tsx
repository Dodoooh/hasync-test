import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AreaManager } from '../AreaManager';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock zustand store
jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    user: { id: 'user1', username: 'testuser', role: 'admin' },
    token: 'test-token'
  }))
}));

describe('AreaManager - Simple Ordering UI', () => {
  const mockAreas = [
    {
      id: 'area1',
      name: 'Living Room',
      client_id: 'client1',
      entities: [
        { id: 'entity1', friendly_name: 'Light 1', entity_id: 'light.living_room_1', display_order: 0 },
        { id: 'entity2', friendly_name: 'Light 2', entity_id: 'light.living_room_2', display_order: 1 },
        { id: 'entity3', friendly_name: 'Light 3', entity_id: 'light.living_room_3', display_order: 2 }
      ]
    },
    {
      id: 'area2',
      name: 'Kitchen',
      client_id: 'client1',
      entities: []
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: mockAreas });
  });

  describe('Unit Tests - SimpleEntityChip', () => {
    it('renders entity chip with correct name', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockAreas });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });
    });

    it('shows up arrow disabled for first entity', async () => {
      render(<AreaManager />);

      await waitFor(() => {
        const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
        const upButton = within(chip).getByLabelText('Move up');
        expect(upButton).toBeDisabled();
      });
    });

    it('shows down arrow disabled for last entity', async () => {
      render(<AreaManager />);

      await waitFor(() => {
        const chip = screen.getByText('Light 3').closest('.MuiChip-root') as HTMLElement;
        const downButton = within(chip).getByLabelText('Move down');
        expect(downButton).toBeDisabled();
      });
    });

    it('shows both arrows enabled for middle entity', async () => {
      render(<AreaManager />);

      await waitFor(() => {
        const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
        const upButton = within(chip).getByLabelText('Move up');
        const downButton = within(chip).getByLabelText('Move down');
        expect(upButton).not.toBeDisabled();
        expect(downButton).not.toBeDisabled();
      });
    });

    it('shows delete confirmation dialog when delete clicked', async () => {
      const user = userEvent.setup();
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
      const deleteButton = within(chip).getByLabelText('Delete');

      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();
      });
    });
  });

  describe('Integration Tests - Reordering', () => {
    it('moves entity up and updates order', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      await user.click(upButton);

      await waitFor(() => {
        expect(mockedAxios.patch).toHaveBeenCalledWith(
          expect.stringContaining('/api/areas/area1/reorder'),
          expect.objectContaining({
            entityId: 'entity2',
            direction: 'up'
          }),
          expect.any(Object)
        );
      });
    });

    it('moves entity down and updates order', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const downButton = within(chip).getByLabelText('Move down');

      await user.click(downButton);

      await waitFor(() => {
        expect(mockedAxios.patch).toHaveBeenCalledWith(
          expect.stringContaining('/api/areas/area1/reorder'),
          expect.objectContaining({
            entityId: 'entity2',
            direction: 'down'
          }),
          expect.any(Object)
        );
      });
    });

    it('deletes entity and removes from list', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
      const deleteButton = within(chip).getByLabelText('Delete');

      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Remove/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockedAxios.patch).toHaveBeenCalledWith(
          expect.stringContaining('/api/areas/area1/entities'),
          expect.objectContaining({
            entityId: 'entity1'
          }),
          expect.any(Object)
        );
      });
    });

    it('moves entity between areas', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      // Open move dialog
      const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
      const moveButton = within(chip).getByLabelText(/Move to another area/);

      await user.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText(/Move to/)).toBeInTheDocument();
      });

      // Select target area
      const kitchenOption = screen.getByText('Kitchen');
      await user.click(kitchenOption);

      await waitFor(() => {
        expect(mockedAxios.patch).toHaveBeenCalledWith(
          expect.stringContaining('/api/areas/area1/move'),
          expect.objectContaining({
            entityId: 'entity1',
            targetAreaId: 'area2'
          }),
          expect.any(Object)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message when API call fails', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockRejectedValue(new Error('Network error'));

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      await user.click(upButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to reorder/)).toBeInTheDocument();
      });
    });

    it('rolls back optimistic update on error', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockRejectedValue(new Error('Network error'));

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      await user.click(upButton);

      // After error, order should be restored
      await waitFor(() => {
        const chips = screen.getAllByRole('button', { name: /Light/ });
        expect(chips[0]).toHaveTextContent('Light 1');
        expect(chips[1]).toHaveTextContent('Light 2');
        expect(chips[2]).toHaveTextContent('Light 3');
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('has proper ARIA labels on all buttons', async () => {
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;

      expect(within(chip).getByLabelText('Move up')).toBeInTheDocument();
      expect(within(chip).getByLabelText('Move down')).toBeInTheDocument();
      expect(within(chip).getByLabelText('Delete')).toBeInTheDocument();
      expect(within(chip).getByLabelText(/Move to another area/)).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      upButton.focus();
      expect(upButton).toHaveFocus();

      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockedAxios.patch).toHaveBeenCalled();
      });
    });

    it('maintains focus after operations', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      await user.click(upButton);

      await waitFor(() => {
        expect(document.activeElement).toBe(upButton);
      });
    });
  });

  describe('Mobile Tests', () => {
    it('has minimum touch target size (48x48px)', async () => {
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
      const buttons = within(chip).getAllByRole('button');

      buttons.forEach(button => {
        const styles = window.getComputedStyle(button);
        const minSize = parseInt(styles.minWidth) >= 48 || parseInt(styles.minHeight) >= 48;
        expect(minSize).toBe(true);
      });
    });

    it('uses bottom sheet dialog on mobile', async () => {
      // Mock mobile viewport
      global.innerWidth = 375;
      global.innerHeight = 667;

      const user = userEvent.setup();
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 1').closest('.MuiChip-root') as HTMLElement;
      const deleteButton = within(chip).getByLabelText('Delete');

      await user.click(deleteButton);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveClass('MuiDialog-paperFullScreen');
      });
    });
  });

  describe('Performance Tests', () => {
    it('renders large lists efficiently', async () => {
      const largeAreaList = [{
        id: 'area1',
        name: 'Large Area',
        client_id: 'client1',
        entities: Array.from({ length: 100 }, (_, i) => ({
          id: `entity${i}`,
          friendly_name: `Entity ${i}`,
          entity_id: `light.entity_${i}`,
          display_order: i
        }))
      }];

      mockedAxios.get.mockResolvedValue({ data: largeAreaList });

      const startTime = performance.now();
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Entity 0')).toBeInTheDocument();
      });

      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(1000); // Should render in under 1 second
    });

    it('debounces search input', async () => {
      const user = userEvent.setup();
      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 1')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search/);

      await user.type(searchInput, 'test');

      // Should not trigger immediate re-render for each keystroke
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Only initial load
    });
  });

  describe('Loading States', () => {
    it('shows loading indicator during fetch', async () => {
      mockedAxios.get.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: mockAreas }), 100))
      );

      render(<AreaManager />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });

    it('shows loading state during reorder', async () => {
      const user = userEvent.setup();
      mockedAxios.patch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 100))
      );

      render(<AreaManager />);

      await waitFor(() => {
        expect(screen.getByText('Light 2')).toBeInTheDocument();
      });

      const chip = screen.getByText('Light 2').closest('.MuiChip-root') as HTMLElement;
      const upButton = within(chip).getByLabelText('Move up');

      await user.click(upButton);

      // Button should be disabled during operation
      expect(upButton).toBeDisabled();

      await waitFor(() => {
        expect(upButton).not.toBeDisabled();
      });
    });
  });
});

/**
 * Tests for ReviewMediaUpload Component
 *
 * Covers client-side gating of review photos and videos: type, size, count and
 * (for video) duration. The limits mirror REVIEW_MEDIA_LIMITS on the server —
 * images 10MB, video 200MB and 60s, 5 items per review — so a customer is not
 * told "ok" here only to be refused by the presign call.
 */

import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ReviewMediaUpload,
  MAX_REVIEW_MEDIA,
  type ReviewMediaItem,
} from '~/components/reviews/ReviewMediaUpload';

// ============================================================================
// Test helpers
// ============================================================================

const MB = 1024 * 1024;

/** A File with a forced size — `new File(['a'], ...)` is always 1 byte. */
function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File(['a'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

let objectUrlCounter = 0;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

/** Duration handed back by the next <video> metadata probe, in seconds. */
let nextVideoDuration = 5;

function makeItem(overrides: Partial<ReviewMediaItem> = {}): ReviewMediaItem {
  const file =
    overrides.file ?? makeFile(`${overrides.id ?? 'item'}.jpg`, 'image/jpeg');
  return {
    id: overrides.id ?? `item-${Math.random()}`,
    file,
    kind: overrides.kind ?? 'image',
    previewUrl: overrides.previewUrl ?? 'blob:existing',
    status: overrides.status ?? 'ready',
    progress: overrides.progress ?? 0,
    error: overrides.error,
  };
}

/** Controlled component, so the harness owns the array the way the form does. */
function Harness({
  initialItems = [],
  onRetry,
  disabled,
}: {
  initialItems?: ReviewMediaItem[];
  onRetry?: (item: ReviewMediaItem) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ReviewMediaItem[]>(initialItems);
  return (
    <ReviewMediaUpload
      items={items}
      onChange={setItems}
      onRetry={onRetry}
      disabled={disabled}
    />
  );
}

function selectFiles(files: File[]) {
  const input = screen.getByTestId('review-media-input');
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  objectUrlCounter = 0;
  nextVideoDuration = 5;

  createObjectURL = vi.fn(() => `blob:mock-${++objectUrlCounter}`);
  revokeObjectURL = vi.fn();
  // jsdom ships neither of these.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
  });

  // jsdom never loads media, so `duration` is permanently NaN and
  // `loadedmetadata` never fires. Make assigning `src` resolve the probe.
  Object.defineProperty(window.HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get() {
      return nextVideoDuration;
    },
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get() {
      return this.getAttribute('src') ?? '';
    },
    set(value: string) {
      this.setAttribute('src', value);
      setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0);
    },
  });

  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe('ReviewMediaUpload Component', () => {
  describe('Selecting files', () => {
    it('renders a preview per selected image with a remove button', async () => {
      render(<Harness />);

      selectFiles([
        makeFile('one.jpg', 'image/jpeg'),
        makeFile('two.png', 'image/png'),
      ]);

      await waitFor(() => {
        expect(screen.getAllByRole('img')).toHaveLength(2);
      });

      expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove two.png')).toBeInTheDocument();
    });

    it('removes an item and revokes its object URL', async () => {
      render(<Harness />);

      selectFiles([
        makeFile('one.jpg', 'image/jpeg'),
        makeFile('two.png', 'image/png'),
      ]);

      await waitFor(() => {
        expect(screen.getAllByRole('img')).toHaveLength(2);
      });

      fireEvent.click(screen.getByLabelText('Remove one.jpg'));

      await waitFor(() => {
        expect(screen.getAllByRole('img')).toHaveLength(1);
      });
      expect(screen.queryByLabelText('Remove one.jpg')).not.toBeInTheDocument();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    });

    it('renders a video element, not an img, for a video selection', async () => {
      const { container } = render(<Harness />);

      selectFiles([makeFile('clip.mp4', 'video/mp4', 5 * MB)]);

      await waitFor(() => {
        expect(container.querySelector('video')).toBeInTheDocument();
      });
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('marks a video as still processing after submit', async () => {
      render(<Harness />);

      selectFiles([makeFile('clip.mp4', 'video/mp4', 5 * MB)]);

      await waitFor(() => {
        expect(screen.getByText(/Processing after you submit/i)).toBeInTheDocument();
      });
    });
  });

  describe('Client-side limits', () => {
    it(`refuses selection number ${MAX_REVIEW_MEDIA + 1} with a visible message`, async () => {
      const existing = Array.from({ length: MAX_REVIEW_MEDIA }, (_, i) =>
        makeItem({ id: `existing-${i}`, previewUrl: `blob:existing-${i}` })
      );
      render(<Harness initialItems={existing} />);

      selectFiles([makeFile('sixth.jpg', 'image/jpeg')]);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          new RegExp(`up to ${MAX_REVIEW_MEDIA} photos or videos`, 'i')
        );
      });

      // The sixth never joins the grid.
      expect(screen.queryByLabelText('Remove sixth.jpg')).not.toBeInTheDocument();
      expect(screen.getAllByRole('img')).toHaveLength(MAX_REVIEW_MEDIA);
    });

    it('refuses an oversized image before any network call', async () => {
      render(<Harness />);

      selectFiles([makeFile('huge.jpg', 'image/jpeg', 20 * MB)]);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/10MB/i);
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Remove huge.jpg')).not.toBeInTheDocument();
    });

    it('refuses an oversized video before any network call', async () => {
      render(<Harness />);

      selectFiles([makeFile('huge.mp4', 'video/mp4', 300 * MB)]);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/200MB/i);
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('refuses a video longer than 60 seconds', async () => {
      nextVideoDuration = 90;
      render(<Harness />);

      selectFiles([makeFile('long.mp4', 'video/mp4', 5 * MB)]);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/60 seconds/i);
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Remove long.mp4')).not.toBeInTheDocument();
    });

    it('accepts a video inside the duration limit', async () => {
      nextVideoDuration = 45;
      const { container } = render(<Harness />);

      selectFiles([makeFile('short.mp4', 'video/mp4', 5 * MB)]);

      await waitFor(() => {
        expect(container.querySelector('video')).toBeInTheDocument();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('refuses an unsupported file type', async () => {
      render(<Harness />);

      selectFiles([makeFile('notes.pdf', 'application/pdf')]);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/notes\.pdf/i);
      });

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Upload failure', () => {
    it('keeps a failed item in the list and offers a retry', () => {
      const onRetry = vi.fn();
      const failed = makeItem({
        id: 'failed-1',
        file: makeFile('broken.jpg', 'image/jpeg'),
        status: 'failed',
        error: 'Upload failed (500)',
      });

      render(<Harness initialItems={[failed]} onRetry={onRetry} />);

      // Still listed — a failed upload never silently drops the file.
      expect(screen.getByLabelText('Remove broken.jpg')).toBeInTheDocument();
      expect(screen.getByText(/Upload failed \(500\)/)).toBeInTheDocument();

      const retry = screen.getByRole('button', { name: /retry broken\.jpg/i });
      fireEvent.click(retry);

      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'failed-1' }));
    });

    it('shows progress for an uploading item', () => {
      const uploading = makeItem({
        id: 'up-1',
        file: makeFile('slow.jpg', 'image/jpeg'),
        status: 'uploading',
        progress: 40,
      });

      render(<Harness initialItems={[uploading]} />);

      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '40');
    });
  });

  describe('Cleanup', () => {
    it('revokes every object URL it created on unmount', async () => {
      const { unmount } = render(<Harness />);

      selectFiles([
        makeFile('one.jpg', 'image/jpeg'),
        makeFile('two.png', 'image/png'),
      ]);

      await waitFor(() => {
        expect(screen.getAllByRole('img')).toHaveLength(2);
      });

      revokeObjectURL.mockClear();
      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-2');
    });
  });

  describe('Disabled state', () => {
    it('disables the picker while the form is submitting', () => {
      render(<Harness disabled />);

      expect(screen.getByTestId('review-media-input')).toBeDisabled();
    });
  });
});

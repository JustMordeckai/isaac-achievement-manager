import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextBlocks } from '../../web/src/components/TextBlocks.tsx';

describe('TextBlocks', () => {
  it('renders paragraphs, nested lists and subheadings, in English', () => {
    const { container } = render(
      <TextBlocks
        headingLevel={5}
        blocks={[
          { kind: 'paragraph', level: 0, text: 'Intro.' },
          { kind: 'item', level: 1, text: 'First' },
          { kind: 'item', level: 2, text: 'Nested' },
          { kind: 'item', level: 3, text: 'Deeper' },
          { kind: 'item', level: 1, text: 'Second' },
          { kind: 'heading', level: 1, text: 'Sub' },
          { kind: 'heading', level: 2, text: 'Subsub' },
          { kind: 'item', level: 2, text: 'Orphan' },
          { kind: 'paragraph', level: 0, text: 'Outro.' },
        ]}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('lang', 'en');
    expect(container.innerHTML).toBe(
      '<div class="text-blocks" lang="en">' +
        '<p>Intro.</p>' +
        '<ul><li>First<ul><li>Nested<ul><li>Deeper</li></ul></li></ul></li><li>Second</li></ul>' +
        '<h5 class="text-blocks__heading">Sub</h5>' +
        '<h6 class="text-blocks__heading">Subsub</h6>' +
        '<ul><li>Orphan</li></ul>' +
        '<p>Outro.</p>' +
        '</div>',
    );
  });

  it('caps the subheadings at h6', () => {
    render(<TextBlocks headingLevel={6} blocks={[{ kind: 'heading', level: 3, text: 'Profond' }]} />);
    expect(screen.getByRole('heading', { level: 6, name: 'Profond' })).toBeInTheDocument();
  });
});

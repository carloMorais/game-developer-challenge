import { RoundButton } from '../components/RoundButton';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange(page: number): void;
  label: string;
}

export function Pagination({ page, totalPages, onChange, label }: PaginationProps) {
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <RoundButton
        icon="icon_turn_left"
        label="Previous page"
        size={40}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      />
      <span className="pagination__label" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <RoundButton
        icon="icon_turn_right"
        label="Next page"
        size={40}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  );
}

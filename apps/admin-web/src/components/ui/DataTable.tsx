import type { Key, ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  emptyState?: ReactNode;
}

export function DataTable<T>({ caption, columns, rows, rowKey, emptyState }: DataTableProps<T>) {
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.className}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={columns.length}>{emptyState ?? <p className="table-empty">No records to display.</p>}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

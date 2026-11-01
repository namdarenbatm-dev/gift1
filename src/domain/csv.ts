export type CsvCell = string | number | null | undefined;

/**
 * Builds a CSV that opens correctly in Excel with Persian text (UTF-8 BOM) and
 * neutralises spreadsheet-formula injection in text cells.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  const esc = (cell: CsvCell): string => {
    if (cell === null || cell === undefined) return '';
    let text = typeof cell === 'number' ? String(cell) : cell;
    if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

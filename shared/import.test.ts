import { readFileSync } from 'node:fs'
import { readSheet } from 'read-excel-file/node'
import { describe, expect, it } from 'vitest'
import {
  IMPORT_BATCH,
  decodeCsv,
  detectDelimiter,
  detectTargets,
  firstChoice,
  foldName,
  mapRows,
  parseCsv,
  previewColumns,
  rowStatuses,
  rowsFromContacts,
  tableFromRows,
  willImport,
} from './import'
import { formatPhone } from './phone'
import type {
  ColumnTarget,
  ExistingClients,
  ImportRow,
  RowStatus,
  Table,
} from './import'

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../e2e/fixtures/${name}`, import.meta.url)),
  )

/** The bytes Bulgarian Excel writes for "Save as CSV": windows-1251. */
function windows1251(text: string): Uint8Array {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 128) bytes.push(code)
    else if (code >= 0x410 && code <= 0x44f) bytes.push(code - 0x410 + 0xc0)
    else throw new Error(`not in windows-1251: ${char}`)
  }
  return new Uint8Array(bytes)
}

const none: ExistingClients = { phones: new Set(), names: new Set() }

describe('tableFromRows', () => {
  it('takes the first row as the headers and turns cells into text', () => {
    const table = tableFromRows([
      ['Име', 'Телефон', 'Брой', 'Дата'],
      ['Иван', 888123456, 3.5, new Date(Date.UTC(2026, 9, 7))],
    ])
    expect(table.headers).toEqual(['Име', 'Телефон', 'Брой', 'Дата'])
    expect(table.rows).toEqual([['Иван', '888123456', '3.5', '2026-10-07']])
  })

  it('drops blank rows and columns, and trims', () => {
    const table = tableFromRows([
      [null, null, null],
      ['Име', '', 'Телефон'],
      ['  Иван  ', null, ''],
      [null, null, null],
      ['', '', ' '],
      ['Мария', undefined, '0888 123 456'],
    ])
    expect(table.headers).toEqual(['Име', 'Телефон'])
    expect(table.rows).toEqual([
      ['Иван', ''],
      ['Мария', '0888 123 456'],
    ])
  })

  it('gives repeated and empty headers their own names', () => {
    const table = tableFromRows([
      ['Телефон', 'Телефон', ''],
      ['1', '2', '3'],
    ])
    expect(new Set(table.headers).size).toBe(3)
    expect(table.headers[0]).toBe('Телефон')
    expect(table.headers[1]).toBe('Телефон 2')
    expect(table.headers[2]).not.toBe('')
  })

  it('is empty for a file without data', () => {
    expect(tableFromRows([])).toEqual({ headers: [], rows: [] })
    expect(tableFromRows([['Име']]).rows).toEqual([])
  })
})

describe('decodeCsv', () => {
  const text = 'Име;Телефон\r\nИван;0888 123 456\r\n'

  it('reads UTF-8, with or without a byte order mark', () => {
    const utf8 = new TextEncoder().encode(text)
    expect(decodeCsv(utf8)).toBe(text)
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe(text)
  })

  it('falls back to windows-1251', () => {
    expect(decodeCsv(windows1251(text))).toBe(text)
  })

  it('reads UTF-16 with a byte order mark (Excel "Unicode text")', () => {
    const units = [0xfeff, ...[...text].map((char) => char.charCodeAt(0))]
    const bytes = new Uint8Array(units.length * 2)
    new DataView(bytes.buffer).setUint16(0, units[0], true)
    units.forEach((unit, i) => {
      new DataView(bytes.buffer).setUint16(i * 2, unit, true)
    })
    expect(decodeCsv(bytes)).toBe(text)
  })
})

describe('detectDelimiter', () => {
  it('finds ; , and tab', () => {
    expect(detectDelimiter('Име;Телефон\nИван;0888')).toBe(';')
    expect(detectDelimiter('Name,Phone\nIvan,0888')).toBe(',')
    expect(detectDelimiter('Name\tPhone\nIvan\t0888')).toBe('\t')
  })

  it('prefers the one every line has, over commas inside values', () => {
    const text =
      'Име;Адрес;Телефон\nИван;"ул. Шипка 3, София";0888\nМария;ул. Алабин;0889'
    expect(detectDelimiter(text)).toBe(';')
  })

  it('ignores delimiters inside quotes', () => {
    expect(detectDelimiter('Name,Note\n"a;b;c;d",x\n"e;f;g;h",y')).toBe(',')
  })

  it('defaults to a comma', () => {
    expect(detectDelimiter('Име')).toBe(',')
    expect(detectDelimiter('')).toBe(',')
  })
})

describe('parseCsv', () => {
  it('decodes, splits and keeps quoted values', async () => {
    const bytes = windows1251(
      'Име;Бележка\r\nИван;"Шкаф; 2 врати"\r\n\r\nМария;\r\n',
    )
    const table = await parseCsv(bytes)
    expect(table.headers).toEqual(['Име', 'Бележка'])
    expect(table.rows).toEqual([
      ['Иван', 'Шкаф; 2 врати'],
      ['Мария', ''],
    ])
  })
})

describe('detectTargets', () => {
  const detect = (...headers: string[]) => detectTargets(headers)

  it('knows Bulgarian headers', () => {
    expect(
      detect('Име', 'Фамилия', 'Мобилен', 'Имейл', 'Адрес', 'Коментар'),
    ).toEqual(['name', 'lastName', 'phone', 'email', 'address', 'note'])
  })

  it('knows English headers, in any case', () => {
    expect(
      detect('NAME', 'Last name', 'GSM', 'E-mail', 'address', 'Notes'),
    ).toEqual(['name', 'lastName', 'phone', 'email', 'address', 'note'])
    expect(detect('Client', 'Phone', 'Email', 'Company')).toEqual([
      'name',
      'phone',
      'email',
      'company',
    ])
  })

  it('knows longer headers', () => {
    expect(
      detect(
        'Име на клиент',
        'Телефон 1',
        'Телефон 2',
        'Е-мейл адрес',
        'Фирма',
      ),
    ).toEqual(['name', 'phone', 'phone', 'email', 'company'])
    expect(detect('Тел.', 'Забележка')).toEqual(['phone', 'note'])
  })

  it('leaves unknown columns as extra fields', () => {
    expect(detect('Име', 'Препоръчан от', 'Град')).toEqual([
      'name',
      'extra',
      'extra',
    ])
  })

  it('gives name, e-mail, address and note to the first column only', () => {
    expect(detect('Име', 'Име', 'Адрес', 'Адрес 2')).toEqual([
      'name',
      'extra',
      'address',
      'extra',
    ])
  })

  it('allows five phone columns', () => {
    expect(
      detect(...Array.from({ length: 7 }, (_, i) => `Телефон ${i + 1}`)),
    ).toEqual([...Array<ColumnTarget>(5).fill('phone'), 'extra', 'extra'])
  })
})

function makeTable(headers: string[], ...rows: string[][]): Table {
  return { headers, rows }
}

describe('mapRows', () => {
  it('combines first and last name columns', () => {
    const rows = mapRows(makeTable(['Фамилия', 'Име'], ['Петров', 'Иван']), [
      'lastName',
      'name',
    ])
    expect(rows[0].name).toBe('Иван Петров')
  })

  it('normalizes phones to E.164, splits cells and removes repeats', () => {
    const [row] = mapRows(
      makeTable(
        ['Тел', 'Тел 2'],
        ['0888 123 456, +359 889 654 321', '0888/123456 или 0888 123 456'],
      ),
      ['phone', 'phone'],
    )
    expect(row.phones).toEqual(['+359888123456', '+359889654321'])
  })

  it('reads a phone Excel stored as a number', () => {
    const [row] = mapRows(makeTable(['Тел'], ['888123456']), ['phone'])
    expect(row.phones).toEqual(['+359888123456'])
  })

  it('keeps a phone it cannot read in the note, under its column name', () => {
    const [row] = mapRows(
      makeTable(['Име', 'Тел', 'Бележка'], ['Иван', '12', 'Шкаф']),
      ['name', 'phone', 'note'],
    )
    expect(row.phones).toEqual([])
    expect(row.note).toBe('Шкаф\nТел: 12')
  })

  it('keeps phones beyond five in the note', () => {
    const cell = Array.from({ length: 6 }, (_, i) => `088812345${i}`).join(', ')
    const [row] = mapRows(makeTable(['Тел'], [cell]), ['phone'])
    expect(row.phones).toHaveLength(5)
    expect(row.note).toContain('0888123455')
  })

  it('maps the other client fields', () => {
    const [row] = mapRows(
      makeTable(
        ['Име', 'Имейл', 'Адрес', 'Град', 'Бележка', 'Коментар'],
        ['Иван', ' ivan@example.com ', 'ул. Шипка 3', 'София', 'а', 'б'],
      ),
      ['name', 'email', 'address', 'address', 'note', 'note'],
    )
    expect(row.email).toBe('ivan@example.com')
    expect(row.address).toBe('ул. Шипка 3, София')
    expect(row.note).toBe('а\nб')
  })

  it('puts extra columns under their header and skips empty values', () => {
    const rows = mapRows(
      makeTable(
        ['Име', 'Препоръчан от', 'Град', 'Скрито'],
        ['Иван', 'Мария', '', 'х'],
      ),
      ['name', 'extra', 'extra', 'skip'],
    )
    expect(rows[0].extra).toEqual({ 'Препоръчан от': 'Мария' })
  })

  it('drops rows with nothing in the mapped columns', () => {
    const rows = mapRows(
      makeTable(['Име', 'Скрито'], ['', 'х'], ['Иван', '']),
      ['name', 'skip'],
    )
    expect(rows.map((row) => row.name)).toEqual(['Иван'])
  })

  it('names a client from the company, then the phone, then the e-mail', () => {
    const rows = mapRows(
      makeTable(
        ['Име', 'Фирма', 'Тел', 'Имейл'],
        ['', 'Мебели ООД', '0888 123 456', ''],
        ['Иван', 'Мебели ООД', '', ''],
        ['', '', '0889 123 456', ''],
        ['', '', '', 'a@example.com'],
      ),
      ['name', 'company', 'phone', 'email'],
    )
    expect(rows[0]).toMatchObject({ name: 'Мебели ООД', kind: 'company' })
    expect(rows[1]).toMatchObject({ name: 'Иван', note: 'Фирма: Мебели ООД' })
    expect(rows[1].kind).toBeUndefined()
    expect(rows[2].name).toBe(formatPhone('+359889123456'))
    expect(rows[3].name).toBe('a@example.com')
  })

  it('cuts values to what the server accepts', () => {
    const [row] = mapRows(
      makeTable(
        ['Име', 'Бележка', 'Друго'],
        ['а'.repeat(300), 'б'.repeat(6000), 'в'.repeat(900)],
      ),
      ['name', 'note', 'extra'],
    )
    expect(row.name).toHaveLength(120)
    expect(row.note).toHaveLength(5000)
    expect(row.extra['Друго']).toHaveLength(500)
  })
})

describe('rowStatuses', () => {
  const rows = (phones: string[][], names: string[]) =>
    names.map((name, i) => ({
      name,
      phones: phones[i],
      email: '',
      address: '',
      note: '',
      extra: {},
    }))

  it('is ok when nothing repeats', () => {
    const list = rows([['+359888111111'], ['+359888222222']], ['Иван', 'Мария'])
    expect(rowStatuses(list, none)).toEqual(['ok', 'ok'])
  })

  it('flags a repeated phone in the file, from the second row on', () => {
    const list = rows(
      [['+359888111111'], ['+359888222222', '+359888111111']],
      ['Иван', 'Друг'],
    )
    expect(rowStatuses(list, none)).toEqual(['ok', 'inFile'])
  })

  it('flags a phone the business already has', () => {
    const existing: ExistingClients = {
      phones: new Set(['+359888111111']),
      names: new Set(),
    }
    const list = rows([['+359888111111'], ['+359888222222']], ['Иван', 'Мария'])
    expect(rowStatuses(list, existing)).toEqual(['existing', 'ok'])
  })

  it('flags the same name only when the row has no phone to tell people apart', () => {
    const existing: ExistingClients = {
      phones: new Set(),
      names: new Set([foldName('Иван Петров')]),
    }
    const list = rows(
      [[], ['+359888111111'], [], []],
      ['иван  ПЕТРОВ', 'Иван Петров', 'Мария', 'мария'],
    )
    expect(rowStatuses(list, existing)).toEqual([
      'existing',
      'ok',
      'ok',
      'inFile',
    ])
  })

  it('folds Latin and Cyrillic spellings of a name together', () => {
    expect(foldName('Иван  Петров')).toBe(foldName('ivan petrov'))
  })

  it('marks rows that have no name at all', () => {
    expect(rowStatuses(rows([[]], ['']), none)).toEqual(['noName'])
  })

  it('puts existing before in-file when both apply', () => {
    const existing: ExistingClients = {
      phones: new Set(['+359888111111']),
      names: new Set(),
    }
    const list = rows([['+359888111111'], ['+359888111111']], ['а', 'б'])
    expect(rowStatuses(list, existing)).toEqual(['existing', 'existing'])
  })
})

describe('firstChoice', () => {
  const fields = [{ id: 'f1', name: 'Препоръчан от' }]

  it('a column the app knows goes where it belongs', () => {
    expect(firstChoice('Мобилен', 'phone', fields)).toBe('phone')
    expect(firstChoice('Име', 'name', [])).toBe('name')
  })

  it('a column nobody knows is skipped: a new field is something the person opts in to', () => {
    expect(firstChoice('Препоръчан от', 'extra', [])).toBe('skip')
    expect(firstChoice('Коментар 2', 'extra', fields)).toBe('skip')
  })

  it('a column named like an existing field goes into that field', () => {
    expect(firstChoice('препоръчан ОТ', 'extra', fields)).toBe('field:f1')
  })
})

describe('willImport', () => {
  const statuses: RowStatus[] = ['ok', 'existing', 'inFile', 'noName']

  it('with duplicates skipped, only new rows go in', () => {
    expect(statuses.map((status) => willImport(status, true))).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('with duplicates kept, they go in too, but a row with no name never does', () => {
    expect(statuses.map((status) => willImport(status, false))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})

describe('previewColumns', () => {
  const row = (overrides: Partial<ImportRow>): ImportRow => ({
    name: 'Иван',
    phones: [],
    email: '',
    address: '',
    note: '',
    extra: {},
    ...overrides,
  })

  it('always starts with the name', () => {
    expect(previewColumns([])).toEqual([{ kind: 'name' }])
    expect(previewColumns([row({})])).toEqual([{ kind: 'name' }])
  })

  it('adds a column for everything any row has, in a fixed order', () => {
    const columns = previewColumns([
      row({ address: 'София' }),
      row({ phones: ['+359888123456'] }),
      row({ note: 'Звъни след 18 ч.' }),
      row({ email: 'a@b.bg' }),
    ])
    expect(columns.map((column) => column.kind)).toEqual([
      'name',
      'phone',
      'email',
      'address',
      'note',
    ])
  })

  it('adds the extra fields by header, in the order they first appear', () => {
    const columns = previewColumns([
      row({ extra: { 'Препоръчан от': 'Мария' } }),
      row({ extra: { Град: 'Пловдив', 'Препоръчан от': 'Петър' } }),
    ])
    expect(columns).toEqual([
      { kind: 'name' },
      { kind: 'extra', header: 'Препоръчан от' },
      { kind: 'extra', header: 'Град' },
    ])
  })

  it('leaves out a column that is empty in every row', () => {
    const columns = previewColumns([
      row({ extra: { Град: '' } }),
      row({ email: '' }),
    ])
    expect(columns).toEqual([{ kind: 'name' }])
  })
})

describe('rowsFromContacts', () => {
  it('takes the first name and every phone', () => {
    const rows = rowsFromContacts([
      { name: ['Иван Петров'], tel: ['0888 123 456', '+359 889 654 321'] },
      { name: [undefined], tel: ['0887 111 222'] },
      { name: ['Без телефон'] },
      { tel: ['12'] },
      {},
    ])
    expect(rows.map((row) => [row.name, row.phones])).toEqual([
      ['Иван Петров', ['+359888123456', '+359889654321']],
      [formatPhone('+359887111222'), ['+359887111222']],
      ['Без телефон', []],
      ['12', []],
    ])
  })
})

describe('the 57-row sample', () => {
  const headers = [
    'Име',
    'Фамилия',
    'Мобилен',
    'Имейл',
    'Адрес',
    'Коментар',
    'Препоръчан от',
  ]

  async function xlsxTable(): Promise<Table> {
    const sheet = await readSheet(
      new URL('../e2e/fixtures/clients-57.xlsx', import.meta.url).pathname,
    )
    return tableFromRows(sheet)
  }

  it('reads the windows-1251 CSV with ; and correct Cyrillic', async () => {
    const parsed = await parseCsv(fixture('clients-57.csv'))
    expect(parsed.headers).toEqual(headers)
    expect(parsed.rows).toHaveLength(57)
    expect(parsed.rows[0].slice(0, 2)).toEqual(['Иван', 'Петров'])
    expect(parsed.rows[5][5]).toBe('Шкаф с огледало; 2 врати')
    expect(parsed.rows.flat().join('')).not.toMatch(/[�Ã]/)
  })

  it('reads the .xlsx with the same 57 rows', async () => {
    const parsed = await xlsxTable()
    expect(parsed.headers).toEqual(headers)
    expect(parsed.rows).toHaveLength(57)
    expect(parsed).toEqual(await parseCsv(fixture('clients-57.csv')))
  })

  it('maps by header, imports 57 and flags the two repeated phones', async () => {
    const parsed = await xlsxTable()
    const targets = detectTargets(parsed.headers)
    expect(targets).toEqual([
      'name',
      'lastName',
      'phone',
      'email',
      'address',
      'note',
      'extra',
    ])
    const rows = mapRows(parsed, targets)
    expect(rows).toHaveLength(57)
    expect(rows.every((row) => row.phones.length === 1)).toBe(true)
    expect(rows[0]).toMatchObject({
      name: 'Иван Петров',
      phones: ['+359888100013'],
      address: 'бул. Витоша 3, София',
      extra: { 'Препоръчан от': 'Мария Колева' },
    })
    const statuses = rowStatuses(rows, none)
    expect(statuses.filter((status) => status === 'inFile')).toHaveLength(2)
    expect(statuses.filter((status) => status === 'ok')).toHaveLength(55)
  })

  it('flags rows already in the business', async () => {
    const rows = mapRows(await xlsxTable(), detectTargets(headers))
    const existing: ExistingClients = {
      phones: new Set([rows[1].phones[0]]),
      names: new Set(),
    }
    expect(rowStatuses(rows, existing)[1]).toBe('existing')
  })
})

describe('IMPORT_BATCH', () => {
  it('is what the server takes per call', () => {
    expect(IMPORT_BATCH).toBe(100)
  })
})

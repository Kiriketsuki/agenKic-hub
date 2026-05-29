export const meta = {
  name: 'financial-data-pipeline',
  description: 'Parse FRANK + GXS statement PDFs into a row-level transactions dataset, consolidate/dedup to CSV, then run Python EDA with charts and an analysis report',
  whenToUse: 'When you want a clean structured transaction dataset from the bank/card PDFs plus exploratory data analysis.',
  phases: [
    { title: 'Extract', detail: 'one agent per statement PDF → row-level JSON on disk' },
    { title: 'Consolidate', detail: 'merge, dedup by true statement period, write transactions.csv + dataset.json' },
    { title: 'Analyze', detail: 'Python EDA (pandas/matplotlib) → charts + markdown report' },
  ],
}

const DATA_DIR = '/home/kiriketsuki/dev/obKidian/300-Areas-of-Responsibility/350-Personal-Finance/data'
const RAW_DIR = '/tmp/findata'
const NOTE_PATH = '/home/kiriketsuki/dev/obKidian/300-Areas-of-Responsibility/350-Personal-Finance/Financial Data Analysis.md'

const CATEGORIES = 'Food & Dining, Groceries, Transport, Shopping, Subscriptions & SaaS, Bills & Utilities, Healthcare & Fitness, Entertainment & Leisure, Travel, Transfers & Payments, Cash/ATM, Income/Credits, Other'

const STATEMENTS = [
  // FRANK (OCBC, debit). Oct-25 id is the REAL October (the older Oct file was a June dup — excluded).
  { id: '1Xc07DE2o2hTW3CsoGJe9usLvM2D3jeuy', account: 'FRANK', type: 'debit', hint: 'Jun-25' },
  { id: '1rjoQbZHR2igsR3Gl4wjUuvrUZsHBpJeT', account: 'FRANK', type: 'debit', hint: 'Jul-25' },
  { id: '138RQGM5huquXIgdAAOiYYzjmJk4bqKnU', account: 'FRANK', type: 'debit', hint: 'Aug-25' },
  { id: '1FJXHLSiDTvgLK4UNmIo9Q0YfA-vtX2IQ', account: 'FRANK', type: 'debit', hint: 'Sep-25' },
  { id: '1uzqx07OzXkxvQORazc2Ureof5IZfmLA1', account: 'FRANK', type: 'debit', hint: 'Oct-25' },
  { id: '1D6q7B9rZlmf3Wc5Gx-VAAUgcTL6XLnHv', account: 'FRANK', type: 'debit', hint: 'Nov-25' },
  { id: '1TiZYabdpDozmqN1DsnZQQEKL7My_1mOp', account: 'FRANK', type: 'debit', hint: 'Dec-25' },
  { id: '19A_b6wnfiIXh4rJIh6m1lVokfnQ2U7K-', account: 'FRANK', type: 'debit', hint: 'Jan-26' },
  { id: '1bHl0XMcwvMWiHhTXfdVxrmGqRuzBeeNZ', account: 'FRANK', type: 'debit', hint: 'Feb-26' },
  { id: '1J_lFtJXGwu6WvBmzOlrS6-6dALS89DNY', account: 'FRANK', type: 'debit', hint: 'Mar-26' },
  { id: '1uk7N5kHr28ndD0bE2lwsamV7IHz5xlD_', account: 'FRANK', type: 'debit', hint: 'Apr-26' },
  // GXS FlexiCard (credit). Several filenames are mislabeled dups — dedup happens in Consolidate by TRUE period.
  { id: '15-2dSKFBgtS44Qq72TQi_hdPRVyL9B0g', account: 'GXS', type: 'credit', hint: '27May-26Jun25' },
  { id: '1AP6O8z6Jpr1hut53ceSUxlzqRQ8lschp', account: 'GXS', type: 'credit', hint: '26Jun-27Jul25' },
  { id: '1_bqmX0tEQbYXNjaXpw78T_F2S3xbadbl', account: 'GXS', type: 'credit', hint: '27Jul-27Aug25' },
  { id: '1SNeoszRjfeEIEECW5i_EWrwBj4oI7UMh', account: 'GXS', type: 'credit', hint: '27Aug-26Sep25' },
  { id: '1smFhPU5thda21JTNZ8zrWFQ7-A2V9kk5', account: 'GXS', type: 'credit', hint: '26Sep-27Oct25' },
  { id: '1zgKYjp2xOqLuKWa92D7WJzq71AtM8skd', account: 'GXS', type: 'credit', hint: '27Oct-26Nov25' },
  { id: '1u6vrhfcSepgf1PF-qn9Bqok96m9loKpl', account: 'GXS', type: 'credit', hint: '26Nov-27Dec25' },
  { id: '1WWzL9qWE0jRcbp0eSpsriueN1OGWjmmy', account: 'GXS', type: 'credit', hint: '27Dec25-27Jan26' },
  { id: '1XA5ItWpr0k_EblaF4fsYgFyZB5x7mcbx', account: 'GXS', type: 'credit', hint: '27Jan-24Feb (yr?)' },
  { id: '1b_Q07tHjz8yOyodnA81owawfTJy9Y02u', account: 'GXS', type: 'credit', hint: '27Jan-24Feb26' },
  { id: '1CqdxrJuEjIAnOXhK2goUoqSlZIIyLQGa', account: 'GXS', type: 'credit', hint: '24Feb-27Mar26' },
  { id: '1WqIDE3ygHvOny2idBi_o0tuynoHJ8eee', account: 'GXS', type: 'credit', hint: '27Mar-26Apr26' },
  { id: '1hCGWWLFTLUzDxgQY__KN_HrMcJYp6uLP', account: 'GXS', type: 'credit', hint: '26Apr-27May26' },
]

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    account: { type: 'string' },
    truePeriod: { type: 'string', description: 'Statement period READ FROM THE PDF content (not the filename), e.g. "2025-10" or "27Mar-26Apr2026"' },
    rowsWritten: { type: 'number' },
    outPath: { type: 'string' },
    reconciles: { type: 'boolean' },
    printedWithdrawals: { type: 'number' },
    printedDeposits: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['account', 'truePeriod', 'rowsWritten', 'outPath', 'reconciles'],
}

const CONSOLIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    txnRows: { type: 'number' },
    csvPath: { type: 'string' },
    jsonPath: { type: 'string' },
    accounts: { type: 'array', items: { type: 'string' } },
    dateRange: { type: 'string' },
    distinctStatements: { type: 'number' },
    duplicatesDropped: { type: 'number' },
    dedupNotes: { type: 'string' },
  },
  required: ['txnRows', 'csvPath', 'distinctStatements'],
}

const ANALYZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reportPath: { type: 'string' },
    charts: { type: 'array', items: { type: 'string' } },
    keyFindings: { type: 'array', items: { type: 'string' } },
    headlineStats: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['reportPath', 'keyFindings'],
}

phase('Extract')

const extractResults = await pipeline(
  STATEMENTS,
  (s) => agent(
    `You have Google Drive READ access via \`gws\`, plus \`pdftotext\` and python3. Parse ONE ${s.account} ${s.type === 'credit' ? 'CREDIT CARD' : 'bank account'} statement into ROW-LEVEL transactions and write them to disk.

FILE: id="${s.id}", account=${s.account}, type=${s.type}, filename-hint="${s.hint}" (DO NOT trust the filename for the period — read the real period from the PDF).

STEPS (Bash):
1. mkdir -p ${RAW_DIR}
2. Download: gws drive files get --params '{"fileId":"${s.id}","alt":"media"}' --output ${RAW_DIR}/src_${s.id}.pdf
3. pdftotext -layout ${RAW_DIR}/src_${s.id}.pdf ${RAW_DIR}/src_${s.id}.txt   then read the .txt
4. Read the TRUE statement period from the page header (e.g. "1 OCT 2025 TO 31 OCT 2025" or "27 Mar 2026 - 26 Apr 2026"). Set truePeriod from THIS, not the filename.
5. Extract EVERY transaction as a row. For ${s.type === 'credit'
      ? 'a CREDIT CARD: amount = transaction amount; direction "out" for purchases/charges, "in" for payments-to-card and refunds. Card payments ("PAYMENT RECEIVED"/autopay) -> is_transfer true. Flexi/late fees -> category "Bills & Utilities". Cashback/"rewards" lines -> direction "in", category "Income/Credits", is_transfer true.'
      : 'a DEBIT account: amount from the Withdrawals (direction "out") or Deposits (direction "in") column; running balance is NOT a transaction. Skip opening/closing balance and subtotal lines.'}
6. Categorise each row into EXACTLY ONE of: ${CATEGORIES}. Set is_transfer=true for money-movement (Syfe, GxS card top-ups, self-transfers, loan/GIRO repayments, Orange Credit, PayNow to/from individuals, card payments); false for genuine consumption.
7. Normalise: date -> "YYYY-MM-DD" (infer year from the statement period); counterparty = cleaned merchant/person name; amount = positive number.
8. Write a JSON array to ${RAW_DIR}/rows_${s.account}_${s.id}.json where each element is:
   {"date","account","raw_description","counterparty","amount","direction","category","is_transfer","period","source_file_id"}
   (source_file_id="${s.id}", period=truePeriod, account="${s.account}").
9. Verify your summed out/in vs the statement's printed Total Withdrawals/Deposits (debit) or total charges/payments (credit); set reconciles accordingly.

Return ONLY the structured object (outPath = the JSON file you wrote). If gws auth fails, report it in notes with rowsWritten 0.`,
    { label: `extract:${s.account}-${s.hint}`, phase: 'Extract', schema: EXTRACT_SCHEMA }
  )
)

const ok = extractResults.filter(Boolean).filter((r) => r.rowsWritten > 0)
log(`Extracted ${ok.length}/${STATEMENTS.length} statements; total rows ~${ok.reduce((a, r) => a + (r.rowsWritten || 0), 0)}`)

phase('Consolidate')

const consolidation = await agent(
  `You have python3 + Bash. Consolidate all extracted transaction rows into one clean dataset.

INPUT: every file matching ${RAW_DIR}/rows_*.json (JSON arrays of transaction rows). There are duplicate statements (some GXS filenames were mislabeled copies of the same cycle, and earlier OCBC Oct was a June dup) — you MUST dedup.

STEPS (write a python3 script and run it):
1. Load all ${RAW_DIR}/rows_*.json into one list of rows.
2. DEDUP STATEMENTS: group rows by (account, period). If two source files yielded the SAME statement (identical period AND near-identical row set — same count, same summed amounts), keep only one copy. Report how many duplicate statements you dropped.
3. Also drop exact duplicate rows within a kept statement.
4. Normalise: ensure date is YYYY-MM-DD; sort by date; ensure amount is float; strip whitespace from text fields.
5. Write:
   - ${DATA_DIR}/transactions.csv  (columns: date, account, counterparty, raw_description, amount, direction, category, is_transfer, period, source_file_id)
   - ${DATA_DIR}/dataset.json      (the full row list)
6. Print row count, distinct statement count, duplicates dropped, date range, accounts.

Return ONLY the structured object.`,
  { label: 'consolidate:dataset', phase: 'Consolidate', schema: CONSOLIDATE_SCHEMA }
)

log(`Consolidated ${consolidation ? consolidation.txnRows : 0} rows -> ${consolidation ? consolidation.csvPath : 'FAILED'}`)
if (!consolidation || !consolidation.txnRows) {
  return { error: 'consolidation-failed', extractResults }
}

phase('Analyze')

const analysis = await agent(
  `You are a data analyst with python3 + Bash. Do exploratory data analysis on the personal-finance dataset and write a report.

DATA:
- ${DATA_DIR}/transactions.csv  (row-level bank/card transactions; key flag: is_transfer separates money-movement from real consumption)
- ${DATA_DIR}/subscriptions.csv (recurring subscriptions parsed from email + cards: vendor, monthly_sgd, category, source, cadence)

SETUP: ensure pandas, numpy, matplotlib are importable; if not, \`pip install --user pandas numpy matplotlib\` (use a non-interactive backend: matplotlib.use("Agg")).

ANALYSIS (write one python3 script, run it, iterate if it errors):
1. Overview: date range, #transactions, per-account counts.
2. Money flow vs consumption: per month, total in / out, and CONSUMPTION = out-rows where is_transfer==False. Show how much of gross outflow is just transfers.
3. Savings rate: monthly investing (Syfe) / income (salary credits).
4. Category breakdown of CONSUMPTION only: totals, monthly average, % share.
5. Monthly spending trend (consumption) over time.
6. Top 15 counterparties by spend (consumption) and separately top transfer destinations.
7. Income: identify salary inflows (Aurrigo) and the irregular Ngee Ann Poly income; show monthly income.
8. Subscriptions: total monthly_sgd, split AI/dev vs Telco vs Insurance, and flag the AI-tooling share.
9. Anomalies: flag outlier transactions (z-score on consumption, and any in/out same-day same-amount "wash" pairs like the Jan PayNow<->Syfe round-trip).
CHARTS (matplotlib, save PNG to ${DATA_DIR}/charts/): (a) monthly consumption trend line; (b) consumption-by-category bar; (c) monthly income vs consumption vs investing grouped bars; (d) subscriptions by category. Keep them clean, titled, SGD-labelled.

REPORT: write a markdown note to ${NOTE_PATH} with: frontmatter (title "Financial Data Analysis", type analysis, area "Personal Finance", currency SGD, created 2026-05-29, tags [finance, analysis, eda]); an executive summary; the findings above with real numbers; embedded chart links (relative: data/charts/<name>.png); a data-quality/caveats section (note GXS coverage gaps + duplicate statements); and end with a line: "---" then "*Authored by: Clault KiperO 4.8*". NO emojis anywhere.

Return ONLY the structured object (charts = list of PNG paths written; keyFindings = 5-8 bullet strings; headlineStats = one-line summary).`,
  { label: 'analyze:eda-report', phase: 'Analyze', schema: ANALYZE_SCHEMA }
)

return { analysis, consolidation, extracted: ok.length, totalStatements: STATEMENTS.length }

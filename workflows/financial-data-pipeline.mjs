/**
 * financial-data-pipeline.mjs — WORKED EXAMPLE workflow.
 *
 * What it does: parses bank and card statement PDFs (stored in Google Drive) into a
 * row-level transaction dataset, consolidates and dedups them to CSV, then runs a
 * Python EDA pass that writes charts and a markdown analysis report.
 *
 * This file is a worked example with placeholder data. Before you run it, customize:
 *   - args.dataDir  : absolute output directory for the dataset and charts
 *   - args.notePath : absolute path for the markdown analysis report
 *   - STATEMENTS    : replace the placeholder Drive file ids, account names, and
 *                     period hints with your own statements
 *   - CATEGORIES    : adjust the category list to your spending taxonomy
 *   - The Analyze prompt: income sources, currency (example uses SGD), and any
 *     account-specific quirks are examples — edit them for your data
 * Credentials: Google Drive access comes from the `gws` CLI's own auth
 * (`gws auth login`). Never hardcode credentials in this file.
 */

export const meta = {
  name: 'financial-data-pipeline',
  description: 'Parse bank and card statement PDFs into a row-level transactions dataset, consolidate/dedup to CSV, then run Python EDA with charts and an analysis report',
  whenToUse: 'When you want a clean structured transaction dataset from the bank/card PDFs plus exploratory data analysis.',
  phases: [
    { title: 'Extract', detail: 'one agent per statement PDF → row-level JSON on disk' },
    { title: 'Consolidate', detail: 'merge, dedup by true statement period, write transactions.csv + dataset.json' },
    { title: 'Analyze', detail: 'Python EDA (pandas/matplotlib) → charts + markdown report' },
  ],
}

// Customize: where the consolidated dataset and charts are written.
const A = typeof args === 'string' && args.trim() ? JSON.parse(args) : (args && typeof args === 'object' ? args : {})
const DATA_DIR = A.dataDir || '/absolute/path/to/finance/data'
const RAW_DIR = '/tmp/findata'
// Customize: where the markdown analysis report is written.
const NOTE_PATH = A.notePath || '/absolute/path/to/finance/Financial Data Analysis.md'

const CATEGORIES = 'Food & Dining, Groceries, Transport, Shopping, Subscriptions & SaaS, Bills & Utilities, Healthcare & Fitness, Entertainment & Leisure, Travel, Transfers & Payments, Cash/ATM, Income/Credits, Other'

const STATEMENTS = [
  // WORKED EXAMPLE: replace with your own Google Drive file ids, accounts, and hints.
  // "hint" is the filename's period label only — the extractor reads the TRUE period
  // from the PDF content, so mislabeled filenames are fine.
  { id: 'DRIVE_FILE_ID_1', account: 'EXAMPLE-BANK', type: 'debit', hint: 'Jun-25' },
  { id: 'DRIVE_FILE_ID_2', account: 'EXAMPLE-BANK', type: 'debit', hint: 'Jul-25' },
  { id: 'DRIVE_FILE_ID_3', account: 'EXAMPLE-CARD', type: 'credit', hint: '27May-26Jun25' },
  { id: 'DRIVE_FILE_ID_4', account: 'EXAMPLE-CARD', type: 'credit', hint: '26Jun-27Jul25' },
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
6. Categorise each row into EXACTLY ONE of: ${CATEGORIES}. Set is_transfer=true for money-movement (investment platform contributions, card top-ups, self-transfers, loan/GIRO repayments, peer-to-peer transfers to/from individuals, card payments); false for genuine consumption.
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

INPUT: every file matching ${RAW_DIR}/rows_*.json (JSON arrays of transaction rows). Some exports may contain duplicate statements (mislabeled copies of the same cycle) — you MUST dedup.

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
3. Savings rate: monthly investing (your investment platform) / income (salary credits).
4. Category breakdown of CONSUMPTION only: totals, monthly average, % share.
5. Monthly spending trend (consumption) over time.
6. Top 15 counterparties by spend (consumption) and separately top transfer destinations.
7. Income: identify salary inflows (your employer) and any irregular income sources; show monthly income.
8. Subscriptions: total monthly_sgd, split AI/dev vs Telco vs Insurance, and flag the AI-tooling share.
9. Anomalies: flag outlier transactions (z-score on consumption, and any in/out same-day same-amount "wash" pairs, such as a transfer round-trip).
CHARTS (matplotlib, save PNG to ${DATA_DIR}/charts/): (a) monthly consumption trend line; (b) consumption-by-category bar; (c) monthly income vs consumption vs investing grouped bars; (d) subscriptions by category. Keep them clean, titled, SGD-labelled.

REPORT: write a markdown note to ${NOTE_PATH} with: frontmatter (title "Financial Data Analysis", type analysis, area "Personal Finance", currency SGD (customize), tags [finance, analysis, eda]); an executive summary; the findings above with real numbers; embedded chart links (relative: data/charts/<name>.png); a data-quality/caveats section (note any coverage gaps and duplicate statements). NO emojis anywhere.

Return ONLY the structured object (charts = list of PNG paths written; keyFindings = 5-8 bullet strings; headlineStats = one-line summary).`,
  { label: 'analyze:eda-report', phase: 'Analyze', schema: ANALYZE_SCHEMA }
)

return { analysis, consolidation, extracted: ok.length, totalStatements: STATEMENTS.length }

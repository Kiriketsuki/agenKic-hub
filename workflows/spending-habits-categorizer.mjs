/**
 * spending-habits-categorizer.mjs — WORKED EXAMPLE workflow.
 *
 * What it does: finds bank statement files (PDF/CSV) exported to Google Drive,
 * parses each statement's transactions, categorizes them, and merges everything
 * into a year-long spending-habits report.
 *
 * This file is a worked example built around OCBC (a Singapore bank). Before you
 * run it, customize:
 *   - args.issuer / args.statementType : your bank name and 'debit' or 'credit'
 *   - args.folderHint : the Drive folder holding your statements
 *   - args.files      : optionally pass explicit Drive file objects to skip discovery
 *   - args.password   : statement PDF password, if any (pass via args, never hardcode)
 *   - CATEGORIES and the merchant-cue examples in the parse prompt: they reference
 *     Singapore merchants (NTUC, Grab, Singtel, ...) — swap in your own
 * Credentials: Drive access comes from the `gws` CLI's own auth (`gws auth login`).
 */

export const meta = {
  name: 'spending-habits-categorizer',
  description: 'Crawl OCBC statements in Google Drive, parse transactions, and categorize a year of spending into a habits report',
  whenToUse: 'When OCBC statements (PDF/CSV) have been exported to Drive and you want a categorized year-long spending breakdown.',
  phases: [
    { title: 'Discover', detail: 'one agent locates OCBC statement files in Drive (finance records / inbox)' },
    { title: 'Parse', detail: 'one agent per statement: download, extract transactions, categorize' },
    { title: 'Categorize', detail: 'merge into year-long category totals, monthly trend, top merchants, insights' },
  ],
}

// args: { folderHint?: string, password?: string, after?: "YYYY-MM" }
// NOTE: the Workflow harness passes `args` as a JSON STRING, not an object. Parse defensively.
const ARGS = typeof args === 'string' && args.trim() ? JSON.parse(args) : (args && typeof args === 'object' ? args : {})
const PASSWORD = ARGS.password || ''
const FOLDER_HINT = ARGS.folderHint || 'finance records / inbox'
// 'debit' (bank account) or 'credit' (credit card). Tunes spend vs payment handling.
const STMT_TYPE = ARGS.statementType || 'debit'
const ISSUER = ARGS.issuer || 'the bank'
const PW_NOTE = PASSWORD
  ? `If a PDF is encrypted, decrypt with: pdftotext -upw '${PASSWORD}' -layout <file> <out>.`
  : `If a PDF is encrypted ("Incorrect password"/"Command Line Error: Incorrect password"), set parseStatus="password_required" and stop — no password was provided.`

const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Subscriptions & SaaS',
  'Bills & Utilities', 'Healthcare & Fitness', 'Entertainment & Leisure', 'Travel',
  'Transfers & Payments', 'Cash/ATM', 'Income/Credits', 'Other',
]

const DISCOVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    statements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          mimeType: { type: 'string' },
          periodHint: { type: 'string', description: 'YYYY-MM or range parsed from filename; "unknown" if none' },
        },
        required: ['id', 'name', 'mimeType'],
      },
    },
    folderPath: { type: 'string', description: 'Where the files were found' },
    notes: { type: 'string' },
  },
  required: ['statements'],
}

const MONTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    period: { type: 'string', description: 'YYYY-MM or range' },
    account: { type: 'string', description: 'e.g. OCBC 365 Card, OCBC 360 Savings' },
    currency: { type: 'string' },
    txnCount: { type: 'number' },
    totalSpend: { type: 'number', description: 'Sum of debits/withdrawals' },
    totalIn: { type: 'number', description: 'Sum of credits/deposits' },
    byCategory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          amount: { type: 'number' },
          count: { type: 'number' },
        },
        required: ['category', 'amount'],
      },
    },
    topMerchants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          merchant: { type: 'string' },
          amount: { type: 'number' },
          count: { type: 'number' },
        },
        required: ['merchant', 'amount'],
      },
    },
    parseStatus: { type: 'string', enum: ['ok', 'partial', 'failed', 'password_required'] },
    notes: { type: 'string' },
  },
  required: ['source', 'parseStatus'],
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    monthsCovered: { type: 'array', items: { type: 'string' } },
    totalsByCategory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          total: { type: 'number' },
          pctOfSpend: { type: 'number' },
          monthlyAvg: { type: 'number' },
        },
        required: ['category', 'total', 'monthlyAvg'],
      },
    },
    monthlyTrend: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          month: { type: 'string' },
          totalSpend: { type: 'number' },
          totalIn: { type: 'number' },
        },
        required: ['month', 'totalSpend'],
      },
    },
    topMerchants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          merchant: { type: 'string' },
          total: { type: 'number' },
          count: { type: 'number' },
        },
        required: ['merchant', 'total'],
      },
    },
    avgMonthlySpend: { type: 'number' },
    recurringDetected: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          merchant: { type: 'string' },
          approxMonthly: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['merchant', 'approxMonthly'],
      },
    },
    insights: { type: 'array', items: { type: 'string' } },
    dataQuality: { type: 'string', description: 'Coverage + any months missing or unparsed' },
  },
  required: ['totalsByCategory', 'monthlyTrend', 'avgMonthlySpend'],
}

phase('Discover')

let discovery = null
let files
if (Array.isArray(ARGS.files) && ARGS.files.length) {
  files = ARGS.files
  log(`Using ${files.length} explicitly provided statement file(s); skipping Drive discovery. Type=${STMT_TYPE}, issuer=${ISSUER}.`)
} else {
  discovery = await agent(
    `You have Google Drive READ access via the \`gws\` CLI. Find the user's bank statements (${ISSUER}). They said they exported them to Drive under "${FOLDER_HINT}".

STEPS (run in Bash):
1. Find candidate folders:
   gws drive files list --params "{\\"q\\":\\"mimeType='application/vnd.google-apps.folder' and trashed=false and (name contains 'finance' or name contains 'Finance' or name='inbox' or name='Inbox' or name contains 'record')\\",\\"pageSize\\":100,\\"fields\\":\\"files(id,name,parents)\\"}" --format json
2. Identify the "finance records" folder and its "inbox" subfolder via name + parent relationship (a folder whose parents includes the finance-records folder id).
3. List files in the target folder:
   gws drive files list --params "{\\"q\\":\\"'TARGET_FOLDER_ID' in parents and trashed=false\\",\\"pageSize\\":200,\\"fields\\":\\"files(id,name,mimeType,size,modifiedTime)\\"}" --format json
4. Backstop global search if the folder route is unclear:
   gws drive files list --params "{\\"q\\":\\"trashed=false and (name contains 'OCBC' or name contains 'statement' or name contains 'eStatement' or name contains 'Statement')\\",\\"pageSize\\":200,\\"fields\\":\\"files(id,name,mimeType,parents)\\"}" --format json
5. Return EVERY statement file (mimeType application/pdf or text/csv or application/vnd.ms-excel or spreadsheet) covering roughly the past 12 months. Parse a periodHint (YYYY-MM) from each filename when possible.

If a gws call returns 403 insufficient scopes or an auth error, STOP and report it verbatim in notes with statements:[].
Return ONLY the structured object.`,
    { label: 'discover:drive', phase: 'Discover', schema: DISCOVER_SCHEMA }
  )
  files = (discovery && discovery.statements) || []
  log(`Discovered ${files.length} statement file(s) in ${discovery ? discovery.folderPath || 'Drive' : 'Drive'}`)
}

if (!files.length) {
  log(`No statements found. Discovery notes: ${discovery ? discovery.notes : 'discovery returned null'}`)
  return { error: 'no-statements', discovery }
}

phase('Parse')

const parsePrompt = (f) => `You have Google Drive READ access via the \`gws\` CLI plus \`pdftotext\` (poppler) and standard shell tools. Parse ONE ${ISSUER} ${STMT_TYPE === 'credit' ? 'CREDIT CARD' : 'bank account'} statement and categorize its transactions.

FILE: name="${f.name}", id="${f.id}", mimeType="${f.mimeType}", periodHint="${f.periodHint || 'unknown'}"

STEPS (Bash):
1. Download to /tmp (sanitize the name, no spaces):
   gws drive files get --params '{"fileId":"${f.id}","alt":"media"}' --output /tmp/stmt_${f.id}
2. If PDF (mimeType application/pdf): extract text preserving columns:
   pdftotext -layout /tmp/stmt_${f.id} /tmp/stmt_${f.id}.txt   then read the .txt
   ${PW_NOTE}
   If CSV/Excel: read the file directly (head/cat; for .xls/.xlsx note if you cannot parse it and set parseStatus=partial).
3. ${STMT_TYPE === 'credit'
    ? 'This is a CREDIT CARD statement. Extract each transaction: date, merchant/description, amount. SPEND = purchase/charge lines billed to the card. EXCLUDE from spend: payments TO the card ("PAYMENT RECEIVED", "PAYMENT - THANK YOU", autopay/GIRO from a bank account) and pure balance/credit-limit lines — those are you paying the bill, count them as totalIn, NOT spend. Include interest/late fees as spend only if charged. For foreign-currency lines use the SGD billed amount.'
    : 'This is a BANK ACCOUNT statement. Extract each transaction: date, description/merchant, debit (withdrawal/spend) and credit (deposit/in). Typical columns: Date | Description | Withdrawals | Deposits | Balance. Keep debits and credits separate. Ignore opening/closing balance lines and subtotals.'}
4. Categorize each transaction into EXACTLY ONE of: ${CATEGORIES.join(', ')}.
   Merchant cues: GrabFood/Deliveroo/foodpanda/restaurants/hawker -> Food & Dining; NTUC/FairPrice/Cold Storage/Sheng Siong/Giant -> Groceries; Grab/Gojek/ComfortDelGro/SimplyGo/TransitLink/Shell/Esso/Caltex/SP petrol -> Transport; Shopee/Lazada/Amazon/Qoo10/retail -> Shopping; Netflix/Spotify/YouTube/Anthropic/OpenAI/Apple/Google/Adobe/iCloud/GitHub -> Subscriptions & SaaS; Singtel/StarHub/M1/SP Group/utilities -> Bills & Utilities; clinic/pharmacy/Guardian/Watsons/gym/fitness/supplements -> Healthcare & Fitness; cinema/Klook events/bars -> Entertainment & Leisure; airlines/hotels/Agoda/Booking -> Travel; PayNow/GIRO/FAST/transfer to a person -> Transfers & Payments; ATM/cash withdrawal -> Cash/ATM; salary/refund/interest/incoming -> Income/Credits; unclear -> Other.
5. Aggregate THIS statement only: txnCount, totalSpend (sum debits), totalIn (sum credits), per-category {amount,count}, top ~8 merchants by spend.

Do NOT echo individual transactions. Return ONLY the structured object. Set parseStatus accurately (ok / partial / failed / password_required).`

const perFile = await pipeline(
  files,
  (f) => agent(parsePrompt(f), { label: `parse:${(f.name || f.id).slice(0, 40)}`, phase: 'Parse', schema: MONTH_SCHEMA })
)

const parsed = perFile.filter(Boolean)
const okMonths = parsed.filter((m) => m.parseStatus === 'ok' || m.parseStatus === 'partial')
const locked = parsed.filter((m) => m.parseStatus === 'password_required')
log(`Parsed ${okMonths.length}/${files.length} statements (${locked.length} password-locked)`)

phase('Categorize')

const report = await agent(
  `You are consolidating a year of OCBC spending. Below are per-statement summaries (JSON) already categorized. Merge them into a year-long spending-habits report.

PER-STATEMENT SUMMARIES:
${JSON.stringify(okMonths, null, 2)}

${locked.length ? `NOTE: ${locked.length} statement(s) were password-locked and could not be parsed: ${locked.map((m) => m.source).join(', ')}. Reflect this in dataQuality.` : ''}

TASKS:
1. Sum spend per category across all months -> totalsByCategory with total, pctOfSpend (of total spend), and monthlyAvg (total / number of months covered).
2. Build monthlyTrend: one row per month (chronological) with totalSpend and totalIn.
3. Merge topMerchants across months -> top ~15 by total spend.
4. avgMonthlySpend = total spend / months covered.
5. recurringDetected: merchants appearing in most months with stable amounts (likely subscriptions/bills) -> approxMonthly + note.
6. insights: 4-8 concrete observations (biggest category, trend up/down, surprising spend, subscription creep, months with spikes, etc.).
7. dataQuality: months covered, any gaps or unparsed/locked statements.
Be conservative; do not invent numbers beyond what the summaries support.
Return ONLY the structured object.`,
  { label: 'categorize:year-report', phase: 'Categorize', schema: REPORT_SCHEMA }
)

return { report, monthsParsed: okMonths.length, filesFound: files.length, passwordLocked: locked.map((m) => m.source), discovery }

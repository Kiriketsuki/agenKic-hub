export const meta = {
  name: 'gmail-recurring-payments',
  description: 'Crawl Gmail via gws CLI to surface recurring payments, subscriptions, and bills, then synthesize a monthly-equivalent SGD spend list',
  whenToUse: 'When you want to discover subscriptions / recurring charges from email receipts to inform a budget.',
  phases: [
    { title: 'Crawl', detail: 'parallel gws Gmail searches by category (SaaS, banks, telco/utilities, catch-all)' },
    { title: 'Synthesize', detail: 'dedupe, classify recurring vs one-off, compute monthly SGD total' },
  ],
}

// Date window: default last ~6 months. Override by passing args = { after: "2025/11/01" }.
const AFTER = (args && args.after) || '2025/11/01'

const FINDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    payments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          vendor: { type: 'string', description: 'Merchant/service name, e.g. "Anthropic", "DBS", "Spotify"' },
          description: { type: 'string' },
          amount: { type: 'number', description: 'Numeric amount; 0 if not found' },
          currency: { type: 'string', description: 'ISO code e.g. USD, SGD; "unknown" if not found' },
          cadence: { type: 'string', enum: ['monthly', 'annual', 'weekly', 'quarterly', 'one-off', 'unknown'] },
          occurrences: { type: 'number', description: 'Distinct dates/months this charge was seen' },
          lastSeen: { type: 'string', description: 'YYYY-MM-DD or "unknown"' },
          sampleSubject: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['vendor', 'amount', 'currency', 'cadence', 'occurrences', 'confidence'],
      },
    },
    searched: { type: 'number', description: 'Messages inspected' },
    notes: { type: 'string' },
  },
  required: ['payments', 'searched'],
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recurring: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          vendor: { type: 'string' },
          monthlySGD: { type: 'number', description: 'Monthly-equivalent amount converted to SGD' },
          nativeAmount: { type: 'number' },
          nativeCurrency: { type: 'string' },
          cadence: { type: 'string' },
          occurrences: { type: 'number' },
          lastSeen: { type: 'string' },
          confidence: { type: 'string' },
          category: { type: 'string', description: 'SaaS | Telco | Utilities | Insurance | Bank/Card | Media | Other' },
        },
        required: ['vendor', 'monthlySGD', 'nativeCurrency', 'cadence', 'category', 'confidence'],
      },
    },
    oneOffOrUncertain: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          vendor: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['vendor', 'note'],
      },
    },
    totalMonthlySGD: { type: 'number' },
    fxAssumption: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['recurring', 'oneOffOrUncertain', 'totalMonthlySGD', 'fxAssumption'],
}

const commonProcedure = (queries) => `
You are crawling the authenticated personal Gmail account via the \`gws\` CLI (Google Workspace CLI). Goal: find recurring payments / subscriptions / bills.

PROCEDURE (run in Bash):
1. For each search query below, list matching message IDs:
   gws gmail users messages list --params '{"userId":"me","q":"<QUERY>","maxResults":40}' --format json | jq -r '.messages[]?.id'
   (If a query errors with auth failure, STOP and report the auth error verbatim in notes — do not fabricate data.)
2. Collect the union of IDs (dedupe). Cap total at 50 messages to inspect.
3. For each ID, fetch headers + snippet:
   gws gmail users messages get --params '{"userId":"me","messageId":"<ID>","format":"metadata","metadataHeaders":["Subject","From","Date"]}' --format json
   The response includes a "snippet" field (preview text) and payload.headers. Amounts usually appear in Subject or snippet.
4. If a message clearly is a receipt/invoice but no amount is in subject/snippet, fetch the body:
   gws gmail users messages get --params '{"userId":"me","messageId":"<ID>","format":"full"}' --format json
   then decode a text/plain part: pull payload...body.data, then: echo "<DATA>" | tr '_-' '/+' | base64 -d 2>/dev/null
   Only do this for up to ~10 ambiguous receipts to stay bounded.
5. Extract for each distinct vendor: amount, currency (USD/SGD/etc), cadence, how many distinct dates/months you saw it (occurrences), last seen date, a sample subject, and your confidence.
   - cadence "monthly" if seen ~once/month or labelled monthly; "annual" if yearly; "one-off" if a single non-recurring purchase; "unknown" if unclear.
   - Currency: Anthropic/OpenAI/Apple/Google bill USD by default unless the email says SGD. Local SG vendors bill SGD.
6. Merge duplicates of the same vendor into one entry (highest occurrences, latest date).

Search queries (Gmail search syntax, all already date-bounded with after:${AFTER}):
${queries.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}

Return ONLY the structured object. Do not message the user. If auth failed for every query, return payments:[] and explain in notes.`

phase('Crawl')

const FINDERS = [
  {
    key: 'saas',
    label: 'crawl:saas-subscriptions',
    queries: [
      `from:(anthropic.com OR openai.com OR apple.com OR google.com OR github.com OR netflix.com OR spotify.com OR youtube.com OR adobe.com OR notion.so OR figma.com OR vercel.com OR cursor.com OR openrouter.ai OR microsoft.com OR dropbox.com) (receipt OR invoice OR subscription OR payment OR renew OR renewed) after:${AFTER}`,
      `subject:(receipt OR invoice OR "payment received" OR "your subscription" OR "auto-renew" OR renewed OR "thanks for your payment") after:${AFTER}`,
    ],
  },
  {
    key: 'banks',
    label: 'crawl:banks-cards',
    queries: [
      `from:(dbs.com OR ocbc.com OR uob.com.sg OR citibank.com OR sc.com OR trustbank.sg OR gxs.com.sg OR hsbc.com.sg OR maribank.sg OR posb.com.sg) after:${AFTER}`,
      `subject:(transaction OR statement OR "card ending" OR "you've paid" OR "payment to" OR GIRO OR "monthly statement") after:${AFTER}`,
    ],
  },
  {
    key: 'telco_util',
    label: 'crawl:telco-utilities-insurance',
    queries: [
      `from:(singtel.com OR starhub.com OR m1.com.sg OR circles.life OR spgroup.com.sg OR myrepublic.com.sg OR simba.sg OR prudential.com.sg OR aia.com OR greateasternlife.com OR income.com.sg OR fwd.com.sg) after:${AFTER}`,
      `subject:(bill OR "your bill" OR premium OR membership OR utilities OR "amount due") after:${AFTER}`,
    ],
  },
  {
    key: 'catchall',
    label: 'crawl:recurring-catchall',
    queries: [
      `subject:("recurring" OR "your receipt" OR "payment confirmation" OR "order confirmation" OR "we've charged" OR "successfully charged") after:${AFTER}`,
      `("auto-renew" OR "your subscription has renewed" OR "next billing" OR "billed monthly" OR "billed annually") after:${AFTER}`,
    ],
  },
]

const crawlResults = await parallel(
  FINDERS.map((f) => () =>
    agent(commonProcedure(f.queries), { label: f.label, phase: 'Crawl', schema: FINDER_SCHEMA })
  )
)

const allPayments = crawlResults.filter(Boolean).flatMap((r) => r.payments || [])
const authFailed = crawlResults.filter(Boolean).every((r) => (r.payments || []).length === 0)
  && crawlResults.filter(Boolean).some((r) => /auth|invalid_grant|401|expired|revoked/i.test(r.notes || ''))

log(`Crawl found ${allPayments.length} raw payment rows across ${FINDERS.length} finders`)
if (authFailed) {
  log('AUTH FAILURE detected in finders — gws Gmail token likely expired. Re-run after `gws auth login`.')
}

phase('Synthesize')

const summary = await agent(
  `You are consolidating recurring-payment findings crawled from Gmail. Below is the merged raw list (JSON) from 4 category finders. Some rows duplicate the same vendor across finders.

RAW FINDINGS:
${JSON.stringify(allPayments, null, 2)}

TASKS:
1. Dedupe by normalized vendor name (case-insensitive, strip domain suffixes).
2. Classify each vendor as RECURRING (cadence monthly/annual/quarterly/weekly, OR occurrences >= 2) vs ONE-OFF/UNCERTAIN.
3. For recurring items, compute monthlySGD = monthly-equivalent in SGD:
   - monthly: amount as-is
   - annual: amount / 12
   - quarterly: amount / 3
   - weekly: amount * 52 / 12
   - Convert USD to SGD at 1.34 (state this). Other currencies: note if you cannot convert.
4. Assign a category: SaaS | Media | Telco | Utilities | Insurance | Bank/Card | Other. (Bank/card transaction alerts that are just notifications of OTHER spending are NOT separate recurring costs — put them in oneOffOrUncertain with a note, since they double-count card spending.)
5. Sum totalMonthlySGD across the RECURRING list only.
6. Be conservative: if amount/currency is unknown, put the item in oneOffOrUncertain rather than inventing a number.

Return ONLY the structured object.`,
  { label: 'synthesize:recurring-summary', phase: 'Synthesize', schema: SUMMARY_SCHEMA }
)

return { summary, rawCount: allPayments.length, authFailed }

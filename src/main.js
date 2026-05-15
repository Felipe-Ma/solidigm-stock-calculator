const DATABASE_NAME = 'solidigm-stock-calculator';
const DATABASE_VERSION = 2;
const GRANT_STORE = 'grants';
const METADATA_STORE = 'metadata';
const QUARTERS_IN_LTI_PLAN = 16;
const STOCK_PRICE_KEY = 'stockPrice';
const GRANT_GROSS_OVERRIDES_KEY = 'grantGrossOverrides';
const NET_UNIT_OVERRIDES_KEY = 'netUnitOverrides';
const TAXABLE_INCOME_INPUT_KEY = 'taxableIncomeInput';
const TAXABLE_INCOME_ENTRIES_KEY = 'taxableIncomeEntries';
const INCOME_BASELINES_KEY = 'incomeBaselines';
const RETIREMENT_INPUT_KEY = 'retirementInput';
const RETIREMENT_ENTRIES_KEY = 'retirementContributionEntries';
const RETIREMENT_BASELINES_KEY = 'retirementBaselines';
const RETIREMENT_DATA_URL = '/data/401k-contributions.json';
const RETIREMENT_CONTRIBUTION_CAP = 24500;
const RETIREMENT_CAP_YEAR = 2026;
const TAX_WITHHOLDING_RATE = 0.415;

const DEFAULT_GRANTS = [
  { id: crypto.randomUUID(), label: 'Grant A', shares: '1200', firstVestDate: '2025-01-30' },
  { id: crypto.randomUUID(), label: 'Grant B', shares: '800', firstVestDate: '2025-04-30' },
];

const PAYCHECK_SCHEDULE_2026 = [
  { paycheckNumber: 1, dateKey: '2026-01-15' },
  { paycheckNumber: 2, dateKey: '2026-01-30' },
  { paycheckNumber: 3, dateKey: '2026-02-13' },
  { paycheckNumber: 4, dateKey: '2026-02-27' },
  { paycheckNumber: 5, dateKey: '2026-03-13' },
  { paycheckNumber: 6, dateKey: '2026-03-31' },
  { paycheckNumber: 7, dateKey: '2026-04-15' },
  { paycheckNumber: 8, dateKey: '2026-04-30' },
  { paycheckNumber: 9, dateKey: '2026-05-15' },
  { paycheckNumber: 10, dateKey: '2026-05-29' },
  { paycheckNumber: 11, dateKey: '2026-06-15' },
  { paycheckNumber: 12, dateKey: '2026-06-30' },
  { paycheckNumber: 13, dateKey: '2026-07-15' },
  { paycheckNumber: 14, dateKey: '2026-07-31' },
  { paycheckNumber: 15, dateKey: '2026-08-14' },
  { paycheckNumber: 16, dateKey: '2026-08-31' },
  { paycheckNumber: 17, dateKey: '2026-09-15' },
  { paycheckNumber: 18, dateKey: '2026-09-30' },
  { paycheckNumber: 19, dateKey: '2026-10-15' },
  { paycheckNumber: 20, dateKey: '2026-10-30' },
  { paycheckNumber: 21, dateKey: '2026-11-13' },
  { paycheckNumber: 22, dateKey: '2026-11-30' },
  { paycheckNumber: 23, dateKey: '2026-12-15' },
  { paycheckNumber: 24, dateKey: '2026-12-31' },
];

let grants = [];
let database;
let saveTimer;
let stockPrice = 0;
let grantGrossOverrides = {};
let netUnitOverrides = {};
let taxableIncomeEntries = [];
let taxableIncomeDraftInput = '';
let incomeBaselines = { J1: '', J2: '' };
let retirementContributionEntries = [];
let retirementDraftInput = '';
let retirementBaselines = { J1: '', J2: '' };

const databaseStatus = document.querySelector('#database-status');
const grantList = document.querySelector('#grant-list');
const scheduleGrid = document.querySelector('#schedule-grid');
const grandTotal = document.querySelector('#grand-total');
const totalValue = document.querySelector('#total-value');
const nextVestValue = document.querySelector('#next-vest-value');
const heldUnits = document.querySelector('#held-units');
const heldValue = document.querySelector('#held-value');
const futureUnits = document.querySelector('#future-units');
const futureValue = document.querySelector('#future-value');
const stockPriceInput = document.querySelector('#stock-price');
const grantTemplate = document.querySelector('#grant-template');
const addGrantButton = document.querySelector('#add-grant');
const resetCorrectionsButton = document.querySelector('#reset-corrections');
const tabButtons = document.querySelectorAll('[data-tab-target]');
const taxableIncomeInputField = document.querySelector('#taxable-income-input');
const taxableIncomeJsonOutput = document.querySelector('#taxable-income-json');
const taxableIncomeTotal = document.querySelector('#taxable-income-total');
const taxableIncomeJ1Total = document.querySelector('#taxable-income-j1-total');
const taxableIncomeJ2Total = document.querySelector('#taxable-income-j2-total');
const futureTaxableIncomeTotal = document.querySelector('#future-taxable-income-total');
const futureTaxableIncomeJ1Total = document.querySelector('#future-taxable-income-j1-total');
const futureTaxableIncomeJ2Total = document.querySelector('#future-taxable-income-j2-total');
const taxableIncomeStatus = document.querySelector('#taxable-income-status');
const currentPaycheckTitle = document.querySelector('#current-paycheck-title');
const currentPaycheckDetail = document.querySelector('#current-paycheck-detail');
const currentPaycheckRemaining = document.querySelector('#current-paycheck-remaining');
const currentPaycheckDate = document.querySelector('#current-paycheck-date');
const taxableIncomeSummary = document.querySelector('#taxable-income-summary');
const taxableIncomeTable = document.querySelector('#taxable-income-table');
const incomeEntryForm = document.querySelector('#income-entry-form');
const incomeDateInput = document.querySelector('#income-date');
const incomeAmountInput = document.querySelector('#income-amount');
const incomeCategoryInput = document.querySelector('#income-category');
const incomeJobInput = document.querySelector('#income-job');
const importIncomeRowsButton = document.querySelector('#import-income-rows');
const copyIncomeJsonButton = document.querySelector('#copy-income-json');
const downloadIncomeJsonButton = document.querySelector('#download-income-json');
const incomeBaselineJ1Input = document.querySelector('#income-baseline-j1');
const incomeBaselineJ2Input = document.querySelector('#income-baseline-j2');
const autofillFuturePaychecksButton = document.querySelector('#autofill-future-paychecks');
const futurePaycheckSummary = document.querySelector('#future-paycheck-summary');
const futureIncomeList = document.querySelector('#future-income-list');
const futureIncomeListSummary = document.querySelector('#future-income-list-summary');
const paycheckScheduleGrid = document.querySelector('#paycheck-schedule-grid');
const clearAutofillPaychecksButton = document.querySelector('#clear-autofill-paychecks');
const resetFutureIncomeButton = document.querySelector('#reset-future-income');
const resetFutureIncomeInlineButton = document.querySelector('#reset-future-income-inline');
const resetAllIncomeButton = document.querySelector('#reset-all-income');
const retirementInputField = document.querySelector('#retirement-input');
const retirementJsonOutput = document.querySelector('#retirement-json');
const retirementTotal = document.querySelector('#retirement-total');
const retirementJ1Total = document.querySelector('#retirement-j1-total');
const retirementJ2Total = document.querySelector('#retirement-j2-total');
const futureRetirementTotal = document.querySelector('#future-retirement-total');
const futureRetirementJ1Total = document.querySelector('#future-retirement-j1-total');
const futureRetirementJ2Total = document.querySelector('#future-retirement-j2-total');
const retirementYearlyCap = document.querySelector('#retirement-yearly-cap');
const retirementCurrentYearTotal = document.querySelector('#retirement-current-year-total');
const retirementCapRemaining = document.querySelector('#retirement-cap-remaining');
const retirementCapStatusCard = document.querySelector('#retirement-cap-status-card');
const retirementStatus = document.querySelector('#retirement-status');
const retirementSummary = document.querySelector('#retirement-summary');
const retirementTable = document.querySelector('#retirement-table');
const retirementEntryForm = document.querySelector('#retirement-entry-form');
const retirementDateInput = document.querySelector('#retirement-date');
const retirementAmountInput = document.querySelector('#retirement-amount');
const retirementCategoryInput = document.querySelector('#retirement-category');
const retirementJobInput = document.querySelector('#retirement-job');
const importRetirementRowsButton = document.querySelector('#import-retirement-rows');
const copyRetirementJsonButton = document.querySelector('#copy-retirement-json');
const downloadRetirementJsonButton = document.querySelector('#download-retirement-json');
const retirementBaselineJ1Input = document.querySelector('#retirement-baseline-j1');
const retirementBaselineJ2Input = document.querySelector('#retirement-baseline-j2');
const autofillFutureRetirementButton = document.querySelector('#autofill-future-retirement');
const clearAutofillRetirementButton = document.querySelector('#clear-autofill-retirement');
const resetFutureRetirementButton = document.querySelector('#reset-future-retirement');
const resetFutureRetirementInlineButton = document.querySelector('#reset-future-retirement-inline');
const resetAllRetirementButton = document.querySelector('#reset-all-retirement');
const futureRetirementSummary = document.querySelector('#future-retirement-summary');
const futureRetirementList = document.querySelector('#future-retirement-list');
const futureRetirementListSummary = document.querySelector('#future-retirement-list-summary');
const retirementPaycheckScheduleGrid = document.querySelector('#retirement-paycheck-schedule-grid');

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GRANT_STORE)) {
        db.createObjectStore(GRANT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readGrants() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GRANT_STORE, 'readonly');
    const store = transaction.objectStore(GRANT_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readMetadata(key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

function writeMetadata(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    store.put({ key, value });

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function saveGrantsNow() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GRANT_STORE, 'readwrite');
    const store = transaction.objectStore(GRANT_STORE);
    store.clear();
    grants.forEach((grant) => store.put(grant));

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  databaseStatus.textContent = 'Saving to local database…';
  saveTimer = setTimeout(() => {
    saveGrantsNow()
      .then(() => {
        databaseStatus.textContent = `Saved ${grants.length} grant${grants.length === 1 ? '' : 's'} locally.`;
      })
      .catch(() => {
        databaseStatus.textContent = 'Could not save to the local database.';
      });
  }, 200);
}

function saveStockPrice() {
  if (!database) return;
  writeMetadata(STOCK_PRICE_KEY, stockPrice).catch(() => {
    databaseStatus.textContent = 'Could not save stock price locally.';
  });
}

function saveGrantGrossOverrides() {
  if (!database) return;
  writeMetadata(GRANT_GROSS_OVERRIDES_KEY, grantGrossOverrides).catch(() => {
    databaseStatus.textContent = 'Could not save grant gross correction locally.';
  });
}

function saveNetUnitOverrides() {
  if (!database) return;
  writeMetadata(NET_UNIT_OVERRIDES_KEY, netUnitOverrides).catch(() => {
    databaseStatus.textContent = 'Could not save post-tax unit correction locally.';
  });
}

function saveTaxableIncomeEntries() {
  if (!database) return;
  writeMetadata(TAXABLE_INCOME_ENTRIES_KEY, taxableIncomeEntries).catch(() => {
    taxableIncomeStatus.textContent = 'Could not save taxable income entries locally.';
  });
}

function saveIncomeBaselines() {
  if (!database) return;
  writeMetadata(INCOME_BASELINES_KEY, incomeBaselines).catch(() => {
    taxableIncomeStatus.textContent = 'Could not save income baselines locally.';
  });
}

function saveTaxableIncomeDraftInput() {
  if (!database) return;
  writeMetadata(TAXABLE_INCOME_INPUT_KEY, taxableIncomeDraftInput).catch(() => {
    taxableIncomeStatus.textContent = 'Could not save pasted income rows locally.';
  });
}

function saveRetirementContributionEntries() {
  if (!database) return;
  writeMetadata(RETIREMENT_ENTRIES_KEY, retirementContributionEntries).catch(() => {
    retirementStatus.textContent = 'Could not save 401k contribution entries locally.';
  });
}

function saveRetirementBaselines() {
  if (!database) return;
  writeMetadata(RETIREMENT_BASELINES_KEY, retirementBaselines).catch(() => {
    retirementStatus.textContent = 'Could not save 401k baselines locally.';
  });
}

function saveRetirementDraftInput() {
  if (!database) return;
  writeMetadata(RETIREMENT_INPUT_KEY, retirementDraftInput).catch(() => {
    retirementStatus.textContent = 'Could not save pasted 401k rows locally.';
  });
}

async function readRetirementCodeJson() {
  try {
    const response = await fetch(RETIREMENT_DATA_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function parseDate(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    const parsed = new Date(fullYear, Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMonths(date, monthsToAdd) {
  const target = new Date(date);
  const originalDay = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + monthsToAdd);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return target;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatShares(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function parseShareAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function getAfterTaxValue(value) {
  return value * (1 - TAX_WITHHOLDING_RATE);
}

function parseCurrencyAmount(value) {
  const amount = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function getEffectiveNetShares(calculatedNetShares, override) {
  return override === undefined || override === '' ? calculatedNetShares : parseShareAmount(override);
}

function parseWholeShareAmount(value) {
  return Math.max(Math.round(parseShareAmount(value)), 0);
}

function toGrantOverrideKey(grantId, vestNumber) {
  return `${grantId}:${vestNumber}`;
}

function distributeWholeShares(entries, sharesToDistribute) {
  const targetTotal = parseWholeShareAmount(sharesToDistribute);
  const calculatedTotal = entries.reduce((sum, entry) => sum + entry.calculatedAmount, 0);

  if (entries.length === 0 || calculatedTotal <= 0) return;

  const allocations = entries.map((entry) => {
    const rawAmount = targetTotal * (entry.calculatedAmount / calculatedTotal);
    const amount = Math.floor(rawAmount);
    return { entry, amount, remainder: rawAmount - amount };
  });
  let unitsRemaining = targetTotal - allocations.reduce((sum, allocation) => sum + allocation.amount, 0);

  allocations
    .sort((a, b) => b.remainder - a.remainder || a.entry.date - b.entry.date)
    .forEach((allocation) => {
      allocation.entry.amount = allocation.amount + (unitsRemaining > 0 ? 1 : 0);
      unitsRemaining -= unitsRemaining > 0 ? 1 : 0;
    });
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getGrantVestDates(firstVestDate) {
  return Array.from({ length: QUARTERS_IN_LTI_PLAN }, (_, index) => addMonths(firstVestDate, index * 3));
}

function getSchedule() {
  const rowsByDate = new Map();

  grants.forEach((grant) => {
    const shares = parseShareAmount(grant.shares);
    const firstVestDate = parseDate(grant.firstVestDate);

    if (!shares || shares <= 0 || !firstVestDate) return;

    const sharesPerQuarter = shares / QUARTERS_IN_LTI_PLAN;
    getGrantVestDates(firstVestDate).forEach((date, index) => {
      const key = toDateKey(date);
      if (!rowsByDate.has(key)) rowsByDate.set(key, { date, total: 0, grants: [] });

      const vestNumber = index + 1;
      const row = rowsByDate.get(key);
      row.total += sharesPerQuarter;
      row.grants.push({
        id: grant.id,
        label: grant.label || 'Untitled grant',
        totalShares: shares,
        amount: sharesPerQuarter,
        calculatedAmount: sharesPerQuarter,
        vestNumber,
      });
    });
  });

  return Array.from(rowsByDate.values()).sort((a, b) => a.date - b.date);
}

function getAdjustedSchedule(schedule) {
  const adjustedSchedule = schedule.map((row) => ({
    ...row,
    calculatedTotal: row.total,
    grants: row.grants.map((grant) => ({ ...grant, calculatedAmount: grant.amount })),
  }));
  const entriesByGrant = new Map();

  adjustedSchedule.forEach((row, rowIndex) => {
    row.grants.forEach((grant, grantIndex) => {
      const overrideKey = toGrantOverrideKey(grant.id, grant.vestNumber);
      const grossOverride = grantGrossOverrides[overrideKey];
      const hasGrossOverride = grossOverride !== undefined && grossOverride !== '';
      const entry = {
        date: row.date,
        rowIndex,
        grantIndex,
        calculatedAmount: grant.calculatedAmount,
        amount: hasGrossOverride ? parseWholeShareAmount(grossOverride) : grant.calculatedAmount,
        isLocked: hasGrossOverride,
      };

      if (!entriesByGrant.has(grant.id)) {
        entriesByGrant.set(grant.id, {
          totalShares: grant.totalShares,
          entries: [],
        });
      }
      entriesByGrant.get(grant.id).entries.push(entry);
    });
  });

  entriesByGrant.forEach(({ totalShares, entries }) => {
    const lockedTotal = entries
      .filter((entry) => entry.isLocked)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const unlockedEntries = entries.filter((entry) => !entry.isLocked);
    const unlockedCalculatedTotal = unlockedEntries.reduce((sum, entry) => sum + entry.calculatedAmount, 0);
    const sharesToDistribute = Math.max(totalShares - lockedTotal, 0);

    if (unlockedEntries.length > 0 && unlockedCalculatedTotal > 0) {
      distributeWholeShares(unlockedEntries, sharesToDistribute);
    }

    let vestedToDate = 0;
    entries
      .sort((a, b) => a.date - b.date)
      .forEach((entry) => {
        vestedToDate += entry.amount;
        const grant = adjustedSchedule[entry.rowIndex].grants[entry.grantIndex];
        grant.amount = entry.amount;
        grant.vestedToDate = vestedToDate;
        grant.remainingPercentage = totalShares > 0
          ? Math.max(((totalShares - vestedToDate) / totalShares) * 100, 0)
          : 0;
        grant.expectedNetAmount = getAfterTaxValue(entry.amount);
      });
  });

  adjustedSchedule.forEach((row) => {
    row.total = row.grants.reduce((sum, grant) => sum + grant.amount, 0);
    row.expectedNetTotal = getAfterTaxValue(row.total);
    row.netTotal = getEffectiveNetShares(row.expectedNetTotal, netUnitOverrides[toDateKey(row.date)]);
  });

  return adjustedSchedule;
}


function normalizeIncomeCategory(value) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  const categories = {
    bonus: 'Bonus',
    'normal paycheck': 'Normal paycheck',
    'normal paycheck +rcu': 'Normal paycheck + RCU',
    'normal paycheck + rcu': 'Normal paycheck + RCU',
    rsu: 'RSU',
  };

  return categories[normalized] || value.trim() || 'Uncategorized';
}

function normalizeIncomeJob(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'j1') return 'J1';
  if (normalized === 'j2') return 'J2';
  return value.trim() || 'Unassigned';
}

function splitCommaFields(line) {
  const fields = [];
  let field = '';
  let isQuoted = false;

  Array.from(line).forEach((character) => {
    if (character === '"') {
      isQuoted = !isQuoted;
      return;
    }
    if (character === ',' && !isQuoted) {
      fields.push(field.trim());
      field = '';
      return;
    }
    field += character;
  });
  fields.push(field.trim());

  return fields;
}

function getEntrySignature(entry) {
  return [
    entry.dateKey,
    Number(entry.amount).toFixed(2),
    normalizeIncomeCategory(entry.category || ''),
    normalizeIncomeJob(entry.job || ''),
  ].join('|');
}

function splitNewAndDuplicateEntries(existingEntries, importedEntries) {
  const seenSignatures = new Set(existingEntries.map(getEntrySignature));
  const newEntries = [];
  const duplicateEntries = [];

  importedEntries.forEach((entry) => {
    const signature = getEntrySignature(entry);
    if (seenSignatures.has(signature)) {
      duplicateEntries.push(entry);
      return;
    }

    seenSignatures.add(signature);
    newEntries.push(entry);
  });

  return { newEntries, duplicateEntries };
}

function formatImportMessage({ label, newCount, duplicateCount, errors }) {
  const entryLabel = `${label} entr${newCount === 1 ? 'y' : 'ies'}`;
  const duplicateText = duplicateCount > 0
    ? ` Skipped ${duplicateCount} duplicate entr${duplicateCount === 1 ? 'y' : 'ies'} already present in saved data or repeated in the pasted rows.`
    : '';
  const errorText = errors.length > 0 ? ` ${errors.join(' ')}` : '';
  return `Imported ${newCount} new ${entryLabel} from pasted rows.${duplicateText}${errorText}`;
}

function createTaxableIncomeEntry({ date, amount, category, job, source = 'manual', paycheckNumber }) {
  return {
    id: crypto.randomUUID(),
    dateKey: toDateKey(date),
    amount,
    category: normalizeIncomeCategory(category),
    job: normalizeIncomeJob(job),
    source,
    paycheckNumber,
  };
}

function sanitizeSavedIncomeEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      const date = parseDate(entry.dateKey || entry.date || '');
      const amount = parseCurrencyAmount(entry.amount);
      if (!date || !amount || amount < 0) return null;
      return {
        id: entry.id || crypto.randomUUID(),
        dateKey: toDateKey(date),
        amount,
        category: normalizeIncomeCategory(entry.category || ''),
        job: normalizeIncomeJob(entry.job || ''),
        source: entry.source || 'manual',
        paycheckNumber: entry.paycheckNumber,
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
}

function parseTaxableIncomeEntries(input) {
  const entries = [];
  const errors = [];

  input.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const fields = splitCommaFields(trimmed);
    if (fields.length < 4) {
      errors.push(`Line ${index + 1} needs date, taxable income, category, and job.`);
      return;
    }

    const [dateValue, amountValue, ...remainingFields] = fields;
    const jobValue = remainingFields.pop();
    const categoryValue = remainingFields.join(', ');
    const date = parseDate(dateValue);
    const amount = parseCurrencyAmount(amountValue);

    if (!date) {
      errors.push(`Line ${index + 1} has an invalid date.`);
      return;
    }
    if (!amount || amount < 0) {
      errors.push(`Line ${index + 1} has an invalid taxable income amount.`);
      return;
    }

    entries.push(createTaxableIncomeEntry({ date, amount, category: categoryValue, job: jobValue }));
  });

  return { entries, errors };
}

function getIncomeJson() {
  return JSON.stringify({
    incomeBaselines,
    paycheckSchedule2026: PAYCHECK_SCHEDULE_2026,
    taxableIncomeEntries,
  }, null, 2);
}

function isFutureIncomeEntry(entry) {
  const entryDate = parseDate(entry.dateKey);
  return entryDate && entryDate > startOfToday();
}

function getFutureIncomeEntries() {
  return taxableIncomeEntries
    .filter(isFutureIncomeEntry)
    .sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
}

function getPaycheckProgress() {
  const today = startOfToday();
  const totalPaychecks = PAYCHECK_SCHEDULE_2026.length;
  const completedPaychecks = PAYCHECK_SCHEDULE_2026.filter((paycheck) => parseDate(paycheck.dateKey) <= today);
  const currentPaycheck = completedPaychecks[completedPaychecks.length - 1] || PAYCHECK_SCHEDULE_2026[0];
  const nextPaycheck = PAYCHECK_SCHEDULE_2026.find((paycheck) => parseDate(paycheck.dateKey) > today);
  const currentNumber = completedPaychecks.length === 0 ? 0 : currentPaycheck.paycheckNumber;
  const remainingPaychecks = Math.max(totalPaychecks - currentNumber, 0);

  return {
    currentPaycheck,
    currentNumber,
    nextPaycheck,
    remainingPaychecks,
    totalPaychecks,
  };
}

function renderPaycheckProgress() {
  const { currentPaycheck, currentNumber, nextPaycheck, remainingPaychecks, totalPaychecks } = getPaycheckProgress();
  const currentDate = parseDate(currentPaycheck.dateKey);

  currentPaycheckTitle.textContent = `Paycheck ${currentNumber || 'not started'} of ${totalPaychecks}`;
  currentPaycheckDetail.textContent = currentNumber === 0
    ? `First scheduled paycheck is ${formatDate(currentDate)}.`
    : `Current scheduled paycheck date: ${formatDate(currentDate)}.`;
  currentPaycheckRemaining.textContent = `${remainingPaychecks} paycheck${remainingPaychecks === 1 ? '' : 's'} left`;
  currentPaycheckDate.textContent = nextPaycheck
    ? `Next: ${formatDate(parseDate(nextPaycheck.dateKey))}`
    : '2026 schedule complete';
}

function getIncomeTotals() {
  return taxableIncomeEntries.reduce((totals, entry) => {
    const isFuture = isFutureIncomeEntry(entry);
    totals.total += entry.amount;
    if (entry.job === 'J1') totals.j1 += entry.amount;
    if (entry.job === 'J2') totals.j2 += entry.amount;
    if (isFuture) {
      totals.future.total += entry.amount;
      if (entry.job === 'J1') totals.future.j1 += entry.amount;
      if (entry.job === 'J2') totals.future.j2 += entry.amount;
    }
    totals.byCategory[entry.category] = (totals.byCategory[entry.category] || 0) + entry.amount;
    return totals;
  }, { total: 0, j1: 0, j2: 0, future: { total: 0, j1: 0, j2: 0 }, byCategory: {} });
}

function renderTaxableIncome(message) {
  const totals = getIncomeTotals();
  taxableIncomeTotal.textContent = formatCurrency(totals.total);
  taxableIncomeJ1Total.textContent = formatCurrency(totals.j1);
  taxableIncomeJ2Total.textContent = formatCurrency(totals.j2);
  futureTaxableIncomeTotal.textContent = formatCurrency(totals.future.total);
  futureTaxableIncomeJ1Total.textContent = formatCurrency(totals.future.j1);
  futureTaxableIncomeJ2Total.textContent = formatCurrency(totals.future.j2);
  taxableIncomeJsonOutput.value = getIncomeJson();
  renderPaycheckProgress();
  futurePaycheckSummary.textContent = getFuturePaycheckSummary();
  renderFutureIncomeList();
  renderPaycheckScheduleBoxes();
  taxableIncomeStatus.textContent = message || `${taxableIncomeEntries.length} taxable income entr${taxableIncomeEntries.length === 1 ? 'y' : 'ies'} saved locally as JSON.`;

  const summaryCards = Object.entries(totals.byCategory).map(([label, value]) => ({ label, value, type: 'category' }));

  taxableIncomeSummary.innerHTML = summaryCards.length === 0
    ? '<p class="empty-row income-empty-state">Add or import taxable income entries to calculate category totals.</p>'
    : summaryCards.map((card) => `
      <article class="income-summary-card income-${escapeHtml(card.type)}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${formatCurrency(card.value)}</strong>
      </article>
    `).join('');

  const rows = [...taxableIncomeEntries].sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
  taxableIncomeTable.innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="income-table-empty">No taxable income entries yet.</td></tr>'
    : rows.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <tr class="income-row income-${toClassToken(entry.job)}${isFutureIncomeEntry(entry) ? ' future-income-row' : ''}">
          <td><time datetime="${entry.dateKey}">${formatDate(date)}</time></td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td><span class="job-pill job-${toClassToken(entry.job)}">${escapeHtml(entry.job)}</span></td>
          <td>${formatIncomeSource(entry)}</td>
          <td><button class="text-button" type="button" data-action="remove-income-entry" data-entry-id="${entry.id}">Remove</button></td>
        </tr>
      `;
    }).join('');
}



function getPaycheckDateStatus(dateKey) {
  const date = parseDate(dateKey);
  const today = startOfToday();
  if (date < today) return 'past';
  if (date.getTime() === today.getTime()) return 'today';
  return 'future';
}

function getRunningIncomeTotalsThroughDate(dateKey) {
  const paycheckDate = parseDate(dateKey);

  return taxableIncomeEntries.reduce((totals, entry) => {
    const entryDate = parseDate(entry.dateKey);
    if (!entryDate || entryDate > paycheckDate) return totals;

    totals.total += entry.amount;
    if (entry.job === 'J1') totals.j1 += entry.amount;
    if (entry.job === 'J2') totals.j2 += entry.amount;
    return totals;
  }, { total: 0, j1: 0, j2: 0 });
}

function renderPaycheckScheduleBoxes() {
  paycheckScheduleGrid.innerHTML = PAYCHECK_SCHEDULE_2026.map((paycheck) => {
    const date = parseDate(paycheck.dateKey);
    const status = getPaycheckDateStatus(paycheck.dateKey);
    const entries = taxableIncomeEntries
      .filter((entry) => entry.dateKey === paycheck.dateKey)
      .sort((a, b) => a.job.localeCompare(b.job) || a.category.localeCompare(b.category));
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const runningTotals = getRunningIncomeTotalsThroughDate(paycheck.dateKey);

    return `
      <article class="paycheck-date-card paycheck-${status}">
        <div class="paycheck-date-header">
          <div>
            <span>Paycheck ${paycheck.paycheckNumber}</span>
            <time datetime="${paycheck.dateKey}">${formatDate(date)}</time>
          </div>
          <strong>${formatCurrency(total)}</strong>
        </div>
        <div class="paycheck-running-total" aria-label="Running taxable income through paycheck ${paycheck.paycheckNumber}">
          <span>Running taxable income</span>
          <strong>${formatCurrency(runningTotals.total)}</strong>
          <small>J1 ${formatCurrency(runningTotals.j1)} · J2 ${formatCurrency(runningTotals.j2)}</small>
        </div>
        <span class="paycheck-status-pill">${status === 'today' ? 'Today' : status}</span>
        <div class="paycheck-entry-list">
          ${entries.length === 0
    ? '<p class="empty-row paycheck-empty-state">No entries for this date yet.</p>'
    : entries.map((entry) => `
            <div class="paycheck-entry income-${toClassToken(entry.job)}">
              <span>${escapeHtml(entry.job)} · ${escapeHtml(entry.category)}</span>
              <strong>${formatCurrency(entry.amount)}</strong>
              <button class="text-button" type="button" data-action="remove-income-entry" data-entry-id="${entry.id}">Remove</button>
            </div>
          `).join('')}
        </div>
        <button class="text-button use-date-button" type="button" data-action="use-paycheck-date" data-date-key="${paycheck.dateKey}">Use this date</button>
      </article>
    `;
  }).join('');
}

function renderFutureIncomeList() {
  const futureEntries = getFutureIncomeEntries();
  const futureAutofillCount = futureEntries.filter((entry) => entry.source === 'paycheck-autofill').length;
  futureIncomeListSummary.textContent = futureEntries.length === 0
    ? 'No future taxable income entries yet.'
    : `${futureEntries.length} future entr${futureEntries.length === 1 ? 'y' : 'ies'} visible here, including ${futureAutofillCount} autofilled entr${futureAutofillCount === 1 ? 'y' : 'ies'}.`;

  futureIncomeList.innerHTML = futureEntries.length === 0
    ? '<p class="empty-row future-income-empty-state">Autofill or manually add future-dated taxable income to see it here.</p>'
    : futureEntries.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <article class="future-income-card income-${toClassToken(entry.job)}">
          <div>
            <time datetime="${entry.dateKey}">${formatDate(date)}</time>
            <strong>${formatCurrency(entry.amount)}</strong>
            <span>${escapeHtml(entry.category)} · ${escapeHtml(entry.job)} · ${formatIncomeSource(entry)}</span>
          </div>
          <button class="text-button" type="button" data-action="remove-income-entry" data-entry-id="${entry.id}">Remove</button>
        </article>
      `;
    }).join('');
}

function persistTaxableIncomeEntries(message) {
  taxableIncomeEntries = sanitizeSavedIncomeEntries(taxableIncomeEntries);
  renderTaxableIncome(message);
  saveTaxableIncomeEntries();
}

function addTaxableIncomeEntry(event) {
  event.preventDefault();
  const date = parseDate(incomeDateInput.value);
  const amount = parseCurrencyAmount(incomeAmountInput.value);

  if (!date || !amount || amount < 0) {
    renderTaxableIncome('Enter a valid date and taxable income amount before saving.');
    return;
  }

  taxableIncomeEntries = [
    ...taxableIncomeEntries,
    createTaxableIncomeEntry({
      date,
      amount,
      category: incomeCategoryInput.value,
      job: incomeJobInput.value,
    }),
  ];
  incomeEntryForm.reset();
  incomeCategoryInput.value = 'Normal paycheck';
  incomeJobInput.value = 'J1';
  persistTaxableIncomeEntries('Saved taxable income entry locally as JSON.');
}

function getFuturePaycheckSchedule() {
  const today = startOfToday();
  return PAYCHECK_SCHEDULE_2026.filter((paycheck) => parseDate(paycheck.dateKey) > today);
}

function getFuturePaycheckSummary() {
  const futurePaychecks = getFuturePaycheckSchedule();
  const j1Baseline = parseCurrencyAmount(incomeBaselines.J1);
  const j2Baseline = parseCurrencyAmount(incomeBaselines.J2);
  const projectedTotal = futurePaychecks.length * (j1Baseline + j2Baseline);
  return `${futurePaychecks.length} future 2026 paycheck date${futurePaychecks.length === 1 ? '' : 's'} available for autofill. Baseline projection: ${formatCurrency(projectedTotal)}.`;
}

function formatIncomeSource(entry) {
  if (entry.source === 'paycheck-autofill') {
    return `Autofill #${entry.paycheckNumber || ''}`;
  }
  if (entry.source === 'retirement-autofill') {
    return `401k autofill #${entry.paycheckNumber || ''}`;
  }
  return 'Manual';
}

function updateIncomeBaseline(job, value) {
  incomeBaselines = { ...incomeBaselines, [job]: value };
  renderTaxableIncome('Updated future paycheck baseline.');
  saveIncomeBaselines();
}

function autofillFuturePaychecks() {
  const jobs = [
    { job: 'J1', amount: parseCurrencyAmount(incomeBaselines.J1) },
    { job: 'J2', amount: parseCurrencyAmount(incomeBaselines.J2) },
  ].filter(({ amount }) => amount > 0);
  const futurePaychecks = getFuturePaycheckSchedule();

  if (jobs.length === 0) {
    renderTaxableIncome('Enter a J1 and/or J2 baseline amount before autofilling future paychecks.');
    return;
  }
  if (futurePaychecks.length === 0) {
    renderTaxableIncome('No future 2026 paycheck dates remain in the hardcoded schedule.');
    return;
  }

  taxableIncomeEntries = taxableIncomeEntries.filter((entry) => entry.source !== 'paycheck-autofill');
  const generatedEntries = futurePaychecks.flatMap((paycheck) => jobs.map(({ job, amount }) => createTaxableIncomeEntry({
    date: parseDate(paycheck.dateKey),
    amount,
    category: 'Normal paycheck',
    job,
    source: 'paycheck-autofill',
    paycheckNumber: paycheck.paycheckNumber,
  })));

  taxableIncomeEntries = [...taxableIncomeEntries, ...generatedEntries];
  persistTaxableIncomeEntries(`Autofilled ${generatedEntries.length} future paycheck entr${generatedEntries.length === 1 ? 'y' : 'ies'} from the 2026 schedule.`);
}

function importTaxableIncomeRows() {
  const { entries, errors } = parseTaxableIncomeEntries(taxableIncomeInputField.value);
  const { newEntries, duplicateEntries } = splitNewAndDuplicateEntries(taxableIncomeEntries, entries);
  if (entries.length > 0) {
    taxableIncomeEntries = [...taxableIncomeEntries, ...newEntries];
    taxableIncomeDraftInput = '';
    taxableIncomeInputField.value = '';
    saveTaxableIncomeDraftInput();
  }

  persistTaxableIncomeEntries(formatImportMessage({
    label: 'taxable income',
    newCount: newEntries.length,
    duplicateCount: duplicateEntries.length,
    errors,
  }));
}

function removeTaxableIncomeEntry(id) {
  taxableIncomeEntries = taxableIncomeEntries.filter((entry) => entry.id !== id);
  persistTaxableIncomeEntries('Removed taxable income entry and updated saved JSON.');
}

function clearAutofillPaychecks() {
  const removedCount = taxableIncomeEntries.filter((entry) => entry.source === 'paycheck-autofill').length;
  taxableIncomeEntries = taxableIncomeEntries.filter((entry) => entry.source !== 'paycheck-autofill');
  persistTaxableIncomeEntries(`Cleared ${removedCount} autofilled paycheck entr${removedCount === 1 ? 'y' : 'ies'}.`);
}

function resetFutureIncomeEntries() {
  const removedCount = getFutureIncomeEntries().length;
  taxableIncomeEntries = taxableIncomeEntries.filter((entry) => !isFutureIncomeEntry(entry));
  persistTaxableIncomeEntries(`Reset ${removedCount} future taxable income entr${removedCount === 1 ? 'y' : 'ies'}.`);
}

function resetAllTaxableIncomeEntries() {
  const removedCount = taxableIncomeEntries.length;
  taxableIncomeEntries = [];
  persistTaxableIncomeEntries(`Reset ${removedCount} taxable income entr${removedCount === 1 ? 'y' : 'ies'}, including current and future entries.`);
}

function updateTaxableIncomeDraft(value) {
  taxableIncomeDraftInput = value;
  saveTaxableIncomeDraftInput();
}

async function copyIncomeJson() {
  const json = getIncomeJson();
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(json);
    renderTaxableIncome('Copied taxable income JSON for VS Code.');
    return;
  }

  taxableIncomeJsonOutput.select();
  document.execCommand('copy');
  renderTaxableIncome('Copied taxable income JSON for VS Code.');
}

function downloadIncomeJson() {
  const blob = new Blob([getIncomeJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'taxable-income-entries.json';
  link.click();
  URL.revokeObjectURL(link.href);
  renderTaxableIncome('Downloaded taxable-income-entries.json for VS Code.');
}


function createRetirementContributionEntry({ date, amount, category, job, source = 'manual', paycheckNumber }) {
  return {
    id: crypto.randomUUID(),
    dateKey: toDateKey(date),
    amount,
    category: normalizeIncomeCategory(category),
    job: normalizeIncomeJob(job),
    source,
    paycheckNumber,
  };
}

function sanitizeSavedRetirementEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      const date = parseDate(entry.dateKey || entry.date || '');
      const amount = parseCurrencyAmount(entry.amount);
      if (!date || !amount || amount < 0) return null;
      return {
        id: entry.id || crypto.randomUUID(),
        dateKey: toDateKey(date),
        amount,
        category: normalizeIncomeCategory(entry.category || ''),
        job: normalizeIncomeJob(entry.job || ''),
        source: entry.source || 'manual',
        paycheckNumber: entry.paycheckNumber,
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
}

function parseRetirementContributionEntries(input) {
  const entries = [];
  const errors = [];

  input.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const fields = splitCommaFields(trimmed);
    if (fields.length < 4) {
      errors.push(`Line ${index + 1} needs date, 401k contribution, category, and job.`);
      return;
    }

    const [dateValue, amountValue, ...remainingFields] = fields;
    const jobValue = remainingFields.pop();
    const categoryValue = remainingFields.join(', ');
    const date = parseDate(dateValue);
    const amount = parseCurrencyAmount(amountValue);

    if (!date) {
      errors.push(`Line ${index + 1} has an invalid date.`);
      return;
    }
    if (!amount || amount < 0) {
      errors.push(`Line ${index + 1} has an invalid 401k contribution amount.`);
      return;
    }

    entries.push(createRetirementContributionEntry({ date, amount, category: categoryValue, job: jobValue }));
  });

  return { entries, errors };
}

function getRetirementJson() {
  return JSON.stringify({
    yearlyContributionCap: RETIREMENT_CONTRIBUTION_CAP,
    capYear: RETIREMENT_CAP_YEAR,
    retirementBaselines,
    paycheckSchedule2026: PAYCHECK_SCHEDULE_2026,
    retirementContributionEntries,
  }, null, 2);
}

function isFutureRetirementEntry(entry) {
  const entryDate = parseDate(entry.dateKey);
  return entryDate && entryDate > startOfToday();
}

function getFutureRetirementEntries() {
  return retirementContributionEntries
    .filter(isFutureRetirementEntry)
    .sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
}

function isRetirementCapYearEntry(entry) {
  const entryDate = parseDate(entry.dateKey);
  return entryDate && entryDate.getFullYear() === RETIREMENT_CAP_YEAR;
}

function getRetirementTotals() {
  return retirementContributionEntries.reduce((totals, entry) => {
    const isFuture = isFutureRetirementEntry(entry);
    const isCapYear = isRetirementCapYearEntry(entry);
    totals.total += entry.amount;
    if (entry.job === 'J1') totals.j1 += entry.amount;
    if (entry.job === 'J2') totals.j2 += entry.amount;
    if (isFuture) {
      totals.future.total += entry.amount;
      if (entry.job === 'J1') totals.future.j1 += entry.amount;
      if (entry.job === 'J2') totals.future.j2 += entry.amount;
    }
    if (isCapYear) totals.capYearTotal += entry.amount;
    totals.byCategory[entry.category] = (totals.byCategory[entry.category] || 0) + entry.amount;
    return totals;
  }, { total: 0, j1: 0, j2: 0, future: { total: 0, j1: 0, j2: 0 }, capYearTotal: 0, byCategory: {} });
}

function getFutureRetirementSummary() {
  const futurePaychecks = getFuturePaycheckSchedule();
  const j1Baseline = parseCurrencyAmount(retirementBaselines.J1);
  const j2Baseline = parseCurrencyAmount(retirementBaselines.J2);
  const projectedTotal = futurePaychecks.length * (j1Baseline + j2Baseline);
  return `${futurePaychecks.length} future 2026 paycheck date${futurePaychecks.length === 1 ? '' : 's'} available for 401k autofill. Baseline projection: ${formatCurrency(projectedTotal)}.`;
}

function renderFutureRetirementList() {
  const futureEntries = getFutureRetirementEntries();
  const futureAutofillCount = futureEntries.filter((entry) => entry.source === 'retirement-autofill').length;
  futureRetirementListSummary.textContent = futureEntries.length === 0
    ? 'No future 401k contribution entries yet.'
    : `${futureEntries.length} future 401k entr${futureEntries.length === 1 ? 'y' : 'ies'} visible here, including ${futureAutofillCount} autofilled entr${futureAutofillCount === 1 ? 'y' : 'ies'}.`;

  futureRetirementList.innerHTML = futureEntries.length === 0
    ? '<p class="empty-row future-income-empty-state">Autofill or manually add future-dated 401k contributions to see them here.</p>'
    : futureEntries.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <article class="future-income-card income-${toClassToken(entry.job)}">
          <div>
            <time datetime="${entry.dateKey}">${formatDate(date)}</time>
            <strong>${formatCurrency(entry.amount)}</strong>
            <span>${escapeHtml(entry.category)} · ${escapeHtml(entry.job)} · ${formatIncomeSource(entry)}</span>
          </div>
          <button class="text-button" type="button" data-action="remove-retirement-entry" data-entry-id="${entry.id}">Remove</button>
        </article>
      `;
    }).join('');
}

function renderRetirementPaycheckScheduleBoxes() {
  retirementPaycheckScheduleGrid.innerHTML = PAYCHECK_SCHEDULE_2026.map((paycheck) => {
    const date = parseDate(paycheck.dateKey);
    const status = getPaycheckDateStatus(paycheck.dateKey);
    const entries = retirementContributionEntries.filter((entry) => entry.dateKey === paycheck.dateKey);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

    return `
      <article class="paycheck-date-card paycheck-${status}">
        <div class="paycheck-date-header">
          <div>
            <span>Paycheck ${paycheck.paycheckNumber}</span>
            <time datetime="${paycheck.dateKey}">${formatDate(date)}</time>
          </div>
          <strong>${formatCurrency(total)}</strong>
        </div>
        <span class="paycheck-status-pill">${status === 'today' ? 'Today' : status}</span>
        <div class="paycheck-entry-list">
          ${entries.length === 0
    ? '<p class="empty-row paycheck-empty-state">No 401k contributions for this date yet.</p>'
    : entries.map((entry) => `
            <div class="paycheck-entry income-${toClassToken(entry.job)}">
              <span>${escapeHtml(entry.job)} · ${escapeHtml(entry.category)} · ${formatIncomeSource(entry)}</span>
              <strong>${formatCurrency(entry.amount)}</strong>
              <button class="text-button" type="button" data-action="remove-retirement-entry" data-entry-id="${entry.id}">Remove</button>
            </div>
          `).join('')}
        </div>
        <button class="text-button use-date-button" type="button" data-action="use-retirement-date" data-date-key="${paycheck.dateKey}">Use this date</button>
      </article>
    `;
  }).join('');
}

function renderRetirementContributions(message) {
  const totals = getRetirementTotals();
  const capRemaining = RETIREMENT_CONTRIBUTION_CAP - totals.capYearTotal;
  retirementTotal.textContent = formatCurrency(totals.total);
  retirementJ1Total.textContent = formatCurrency(totals.j1);
  retirementJ2Total.textContent = formatCurrency(totals.j2);
  futureRetirementTotal.textContent = formatCurrency(totals.future.total);
  futureRetirementJ1Total.textContent = formatCurrency(totals.future.j1);
  futureRetirementJ2Total.textContent = formatCurrency(totals.future.j2);
  retirementYearlyCap.textContent = formatCurrency(RETIREMENT_CONTRIBUTION_CAP);
  retirementCurrentYearTotal.textContent = formatCurrency(totals.capYearTotal);
  retirementCapRemaining.textContent = capRemaining >= 0 ? formatCurrency(capRemaining) : `${formatCurrency(Math.abs(capRemaining))} over`;
  retirementCapStatusCard.classList.toggle('is-over-cap', capRemaining < 0);
  retirementJsonOutput.value = getRetirementJson();
  futureRetirementSummary.textContent = getFutureRetirementSummary();
  renderFutureRetirementList();
  renderRetirementPaycheckScheduleBoxes();

  const capMessage = capRemaining < 0
    ? ` You are ${formatCurrency(Math.abs(capRemaining))} over the ${RETIREMENT_CAP_YEAR} cap.`
    : ` ${formatCurrency(capRemaining)} remains under the ${RETIREMENT_CAP_YEAR} cap.`;
  retirementStatus.textContent = message || `${retirementContributionEntries.length} 401k contribution entr${retirementContributionEntries.length === 1 ? 'y' : 'ies'} saved locally as JSON.${capMessage}`;

  const summaryCards = Object.entries(totals.byCategory).map(([label, value]) => ({ label, value, type: 'category' }));

  retirementSummary.innerHTML = summaryCards.length === 0
    ? '<p class="empty-row income-empty-state">Add or import 401k contributions to calculate category totals.</p>'
    : summaryCards.map((card) => `
      <article class="income-summary-card income-${escapeHtml(card.type)}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${formatCurrency(card.value)}</strong>
      </article>
    `).join('');

  const rows = [...retirementContributionEntries].sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
  retirementTable.innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="income-table-empty">No 401k contribution entries yet.</td></tr>'
    : rows.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <tr class="income-row income-${toClassToken(entry.job)}${isFutureRetirementEntry(entry) ? ' future-income-row' : ''}">
          <td><time datetime="${entry.dateKey}">${formatDate(date)}</time></td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td><span class="job-pill job-${toClassToken(entry.job)}">${escapeHtml(entry.job)}</span></td>
          <td>${formatIncomeSource(entry)}</td>
          <td><button class="text-button" type="button" data-action="remove-retirement-entry" data-entry-id="${entry.id}">Remove</button></td>
        </tr>
      `;
    }).join('');
}

function persistRetirementContributionEntries(message) {
  retirementContributionEntries = sanitizeSavedRetirementEntries(retirementContributionEntries);
  renderRetirementContributions(message);
  saveRetirementContributionEntries();
}

function addRetirementContributionEntry(event) {
  event.preventDefault();
  const date = parseDate(retirementDateInput.value);
  const amount = parseCurrencyAmount(retirementAmountInput.value);

  if (!date || !amount || amount < 0) {
    renderRetirementContributions('Enter a valid date and 401k contribution amount before saving.');
    return;
  }

  retirementContributionEntries = [
    ...retirementContributionEntries,
    createRetirementContributionEntry({
      date,
      amount,
      category: retirementCategoryInput.value,
      job: retirementJobInput.value,
    }),
  ];
  retirementEntryForm.reset();
  retirementCategoryInput.value = 'Normal paycheck';
  retirementJobInput.value = 'J1';
  persistRetirementContributionEntries('Saved 401k contribution entry locally as JSON.');
}

function updateRetirementBaseline(job, value) {
  retirementBaselines = { ...retirementBaselines, [job]: value };
  renderRetirementContributions('Updated future 401k contribution baseline.');
  saveRetirementBaselines();
}

function autofillFutureRetirementContributions() {
  const jobs = [
    { job: 'J1', amount: parseCurrencyAmount(retirementBaselines.J1) },
    { job: 'J2', amount: parseCurrencyAmount(retirementBaselines.J2) },
  ].filter(({ amount }) => amount > 0);
  const futurePaychecks = getFuturePaycheckSchedule();

  if (jobs.length === 0) {
    renderRetirementContributions('Enter a J1 and/or J2 401k amount before autofilling future contributions.');
    return;
  }
  if (futurePaychecks.length === 0) {
    renderRetirementContributions('No future 2026 paycheck dates remain in the hardcoded schedule.');
    return;
  }

  retirementContributionEntries = retirementContributionEntries.filter((entry) => entry.source !== 'retirement-autofill');
  const generatedEntries = futurePaychecks.flatMap((paycheck) => jobs.map(({ job, amount }) => createRetirementContributionEntry({
    date: parseDate(paycheck.dateKey),
    amount,
    category: 'Normal paycheck',
    job,
    source: 'retirement-autofill',
    paycheckNumber: paycheck.paycheckNumber,
  })));

  retirementContributionEntries = [...retirementContributionEntries, ...generatedEntries];
  persistRetirementContributionEntries(`Autofilled ${generatedEntries.length} future 401k contribution entr${generatedEntries.length === 1 ? 'y' : 'ies'} from the 2026 schedule.`);
}

function importRetirementContributionRows() {
  const { entries, errors } = parseRetirementContributionEntries(retirementInputField.value);
  const { newEntries, duplicateEntries } = splitNewAndDuplicateEntries(retirementContributionEntries, entries);
  if (entries.length > 0) {
    retirementContributionEntries = [...retirementContributionEntries, ...newEntries];
    retirementDraftInput = '';
    retirementInputField.value = '';
    saveRetirementDraftInput();
  }

  persistRetirementContributionEntries(formatImportMessage({
    label: '401k',
    newCount: newEntries.length,
    duplicateCount: duplicateEntries.length,
    errors,
  }));
}

function removeRetirementContributionEntry(id) {
  retirementContributionEntries = retirementContributionEntries.filter((entry) => entry.id !== id);
  persistRetirementContributionEntries('Removed 401k contribution entry and updated saved JSON.');
}

function clearAutofillRetirementContributions() {
  const removedCount = retirementContributionEntries.filter((entry) => entry.source === 'retirement-autofill').length;
  retirementContributionEntries = retirementContributionEntries.filter((entry) => entry.source !== 'retirement-autofill');
  persistRetirementContributionEntries(`Cleared ${removedCount} autofilled 401k entr${removedCount === 1 ? 'y' : 'ies'}.`);
}

function resetFutureRetirementContributions() {
  const removedCount = getFutureRetirementEntries().length;
  retirementContributionEntries = retirementContributionEntries.filter((entry) => !isFutureRetirementEntry(entry));
  persistRetirementContributionEntries(`Reset ${removedCount} future 401k contribution entr${removedCount === 1 ? 'y' : 'ies'}.`);
}

function resetAllRetirementContributions() {
  const removedCount = retirementContributionEntries.length;
  retirementContributionEntries = [];
  persistRetirementContributionEntries(`Reset ${removedCount} 401k contribution entr${removedCount === 1 ? 'y' : 'ies'}, including current and future entries.`);
}

function updateRetirementDraft(value) {
  retirementDraftInput = value;
  saveRetirementDraftInput();
}

async function copyRetirementJson() {
  const json = getRetirementJson();
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(json);
    renderRetirementContributions('Copied 401k JSON. Paste it into data/401k-contributions.json and commit the JSON change.');
    return;
  }

  retirementJsonOutput.select();
  document.execCommand('copy');
  renderRetirementContributions('Copied 401k JSON. Paste it into data/401k-contributions.json and commit the JSON change.');
}

function downloadRetirementJson() {
  const blob = new Blob([getRetirementJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '401k-contributions.json';
  link.click();
  URL.revokeObjectURL(link.href);
  renderRetirementContributions('Downloaded 401k-contributions.json. Replace data/401k-contributions.json with it and commit the JSON change.');
}

function switchTab(targetPanelId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === targetPanelId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.id === targetPanelId;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });
}

function renderGrantInputs() {
  grantList.replaceChildren();

  if (grants.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-row grant-empty-state';
    emptyState.textContent = 'No grants yet. Add your first grant to build the 4-year schedule.';
    grantList.append(emptyState);
    return;
  }

  grants.forEach((grant) => {
    const fragment = grantTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.grant-card');
    card.dataset.id = grant.id;
    card.querySelector('[data-action="remove"]').setAttribute('aria-label', `Remove ${grant.label || 'grant'}`);

    card.querySelectorAll('[data-field]').forEach((input) => {
      input.value = grant[input.dataset.field] || '';
      input.addEventListener('input', (event) => {
        updateGrant(grant.id, event.target.dataset.field, event.target.value);
      });
    });

    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeGrant(grant.id));
    grantList.append(card);
  });
}

function renderSchedule() {
  const schedule = getAdjustedSchedule(getSchedule());
  const today = startOfToday();
  const totalGrossShares = schedule.reduce((sum, row) => sum + row.total, 0);
  const totalNetShares = schedule.reduce((sum, row) => sum + row.netTotal, 0);
  const heldNetShares = schedule
    .filter((row) => row.date <= today)
    .reduce((sum, row) => sum + row.netTotal, 0);
  const futureNetShares = totalNetShares - heldNetShares;
  const nextRow = schedule.find((row) => row.date >= today) || schedule[0];
  const nextNetShares = nextRow?.netTotal || 0;

  grandTotal.textContent = formatShares(totalGrossShares);
  totalValue.textContent = formatCurrency(totalNetShares * stockPrice);
  nextVestValue.textContent = formatCurrency(nextNetShares * stockPrice);
  heldUnits.textContent = formatShares(heldNetShares);
  heldValue.textContent = formatCurrency(heldNetShares * stockPrice);
  futureUnits.textContent = formatShares(futureNetShares);
  futureValue.textContent = formatCurrency(futureNetShares * stockPrice);
  scheduleGrid.replaceChildren();

  if (schedule.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-row schedule-empty-state';
    emptyState.textContent = 'Add a grant with shares and a first vest date to see the calculated schedule.';
    scheduleGrid.append(emptyState);
    return;
  }

  let runningGrossShares = 0;
  let runningNetShares = 0;
  const periodList = document.createElement('div');
  periodList.className = 'payout-period-list';
  periodList.innerHTML = schedule.map((row, index) => {
    const dateKey = toDateKey(row.date);
    const netOverride = netUnitOverrides[dateKey];
    const calculatedGrossShares = row.calculatedTotal;
    const effectiveGrossShares = row.total;
    const expectedNetShares = row.expectedNetTotal;
    const netShares = row.netTotal;
    const taxWithheldShares = effectiveGrossShares - netShares;
    const grossValue = effectiveGrossShares * stockPrice;
    const withheldValue = taxWithheldShares * stockPrice;
    const netValue = netShares * stockPrice;

    runningGrossShares += effectiveGrossShares;
    runningNetShares += netShares;

    return `
      <article class="payout-card">
        <div class="payout-card-header">
          <div>
            <strong class="payout-period">Period ${index + 1}</strong>
            <time datetime="${dateKey}">${formatDate(row.date)}</time>
          </div>
          <div class="combined-payout">
            <span>${formatShares(netShares)} net units</span>
            <small>${formatShares(effectiveGrossShares)} gross units from ${row.grants.length} grant${row.grants.length === 1 ? '' : 's'}</small>
          </div>
        </div>

        <div class="payout-summary-grid" aria-label="Payout period totals">
          <div class="payout-summary-item">
            <span>Calculated gross</span>
            <strong>${formatShares(calculatedGrossShares)}</strong>
          </div>
          <div class="payout-summary-item">
            <span>Adjusted gross</span>
            <strong>${formatShares(effectiveGrossShares)}</strong>
          </div>
          <div class="payout-summary-item net-item">
            <span>Expected post-tax</span>
            <strong>${formatShares(expectedNetShares)}</strong>
          </div>
          <label class="payout-summary-item net-override-item">
            <span>Correct post-tax units</span>
            <input
              data-action="correct-net-payout"
              data-date-key="${dateKey}"
              type="number"
              step="0.01"
              min="0"
              placeholder="${formatShares(expectedNetShares)}"
              value="${netOverride ?? ''}"
            />
          </label>
          <div class="payout-summary-item withholding-item">
            <span>Units withheld</span>
            <strong>${formatShares(taxWithheldShares)}</strong>
          </div>
          <div class="payout-summary-item net-item">
            <span>Final post-tax units</span>
            <strong>${formatShares(netShares)}</strong>
          </div>
          <div class="payout-summary-item">
            <span>Gross value</span>
            <strong>${formatCurrency(grossValue)}</strong>
          </div>
          <div class="payout-summary-item withholding-item">
            <span>Withheld value</span>
            <strong>${formatCurrency(withheldValue)}</strong>
          </div>
          <div class="payout-summary-item net-item">
            <span>Net payout</span>
            <strong>${formatCurrency(netValue)}</strong>
          </div>
          <div class="payout-summary-item running-item">
            <span>Running gross units</span>
            <strong>${formatShares(runningGrossShares)}</strong>
          </div>
          <div class="payout-summary-item running-item">
            <span>Running net units</span>
            <strong>${formatShares(runningNetShares)}</strong>
          </div>
        </div>

        <details class="grant-breakdown-details">
          <summary>View grant sources & remaining</summary>
          <div class="grant-breakdown">
            ${row.grants.map((grant) => `
              <div class="grant-vest-line">
                <span class="grant-name">${escapeHtml(grant.label)}</span>
                <span>Vest ${grant.vestNumber}/${QUARTERS_IN_LTI_PLAN}</span>
                <span>${formatShares(grant.calculatedAmount)} calc. gross</span>
                <label class="grant-override-field">
                  Correct gross
                  <input
                    data-action="correct-grant-gross"
                    data-grant-id="${grant.id}"
                    data-vest-number="${grant.vestNumber}"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="${formatShares(grant.calculatedAmount)}"
                    value="${grantGrossOverrides[toGrantOverrideKey(grant.id, grant.vestNumber)] ?? ''}"
                  />
                </label>
                <span>${formatShares(grant.amount)} adjusted gross</span>
                <span>${formatShares(grant.expectedNetAmount)} expected net</span>
                <span class="remaining-percent">${formatShares(grant.remainingPercentage)}% remaining</span>
              </div>
            `).join('')}
          </div>
        </details>
      </article>
    `;
  }).join('');

  scheduleGrid.append(periodList);
}

function updateGrant(id, field, value) {
  grants = grants.map((grant) => (grant.id === id ? { ...grant, [field]: value } : grant));
  renderSchedule();
  scheduleSave();
}

function updateGrantGrossOverride(grantId, vestNumber, value) {
  const overrideKey = toGrantOverrideKey(grantId, vestNumber);
  grantGrossOverrides = { ...grantGrossOverrides };
  if (value === '') {
    delete grantGrossOverrides[overrideKey];
  } else {
    grantGrossOverrides[overrideKey] = value;
  }

  renderSchedule();
  saveGrantGrossOverrides();
}

function updateNetUnitOverride(dateKey, value) {
  netUnitOverrides = { ...netUnitOverrides };
  if (value === '') {
    delete netUnitOverrides[dateKey];
  } else {
    netUnitOverrides[dateKey] = value;
  }

  renderSchedule();
  saveNetUnitOverrides();
}

function resetManualCorrections() {
  grantGrossOverrides = {};
  netUnitOverrides = {};
  renderSchedule();
  saveGrantGrossOverrides();
  saveNetUnitOverrides();
}

function addGrant() {
  grants = [
    ...grants,
    { id: crypto.randomUUID(), label: `Grant ${String.fromCharCode(65 + grants.length)}`, shares: '', firstVestDate: '' },
  ];
  renderGrantInputs();
  renderSchedule();
  scheduleSave();
}

function removeGrant(id) {
  grants = grants.filter((grant) => grant.id !== id);
  renderGrantInputs();
  renderSchedule();
  scheduleSave();
}

function toClassToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));
}

async function initializeApp() {
  database = await openDatabase();
  const hasInitialized = await readMetadata('initialized');
  const savedStockPrice = await readMetadata(STOCK_PRICE_KEY);
  const savedGrantGrossOverrides = await readMetadata(GRANT_GROSS_OVERRIDES_KEY);
  const savedNetUnitOverrides = await readMetadata(NET_UNIT_OVERRIDES_KEY);
  const savedTaxableIncomeInput = await readMetadata(TAXABLE_INCOME_INPUT_KEY);
  const savedTaxableIncomeEntries = await readMetadata(TAXABLE_INCOME_ENTRIES_KEY);
  const savedIncomeBaselines = await readMetadata(INCOME_BASELINES_KEY);
  const savedRetirementInput = await readMetadata(RETIREMENT_INPUT_KEY);
  const savedRetirementEntries = await readMetadata(RETIREMENT_ENTRIES_KEY);
  const savedRetirementBaselines = await readMetadata(RETIREMENT_BASELINES_KEY);
  const codeRetirementData = await readRetirementCodeJson();
  stockPrice = Number(savedStockPrice) || 0;
  grantGrossOverrides = savedGrantGrossOverrides || {};
  netUnitOverrides = savedNetUnitOverrides || {};
  taxableIncomeDraftInput = savedTaxableIncomeInput || '';
  taxableIncomeInputField.value = taxableIncomeDraftInput;
  incomeBaselines = { J1: '', J2: '', ...(savedIncomeBaselines || {}) };
  incomeBaselineJ1Input.value = incomeBaselines.J1 || '';
  incomeBaselineJ2Input.value = incomeBaselines.J2 || '';
  taxableIncomeEntries = sanitizeSavedIncomeEntries(savedTaxableIncomeEntries || parseTaxableIncomeEntries(taxableIncomeDraftInput).entries);
  retirementDraftInput = savedRetirementInput || '';
  retirementInputField.value = retirementDraftInput;
  const codeRetirementBaselines = codeRetirementData?.retirementBaselines || {};
  const codeRetirementEntries = sanitizeSavedRetirementEntries(codeRetirementData?.retirementContributionEntries || []);
  const draftRetirementEntries = parseRetirementContributionEntries(retirementDraftInput).entries;
  const browserRetirementEntries = sanitizeSavedRetirementEntries(
    savedRetirementEntries === undefined ? draftRetirementEntries : savedRetirementEntries,
  );
  const { newEntries: browserOnlyRetirementEntries } = splitNewAndDuplicateEntries(
    codeRetirementEntries,
    browserRetirementEntries,
  );
  retirementBaselines = {
    J1: '',
    J2: '',
    ...codeRetirementBaselines,
    ...(savedRetirementBaselines || {}),
  };
  retirementBaselineJ1Input.value = retirementBaselines.J1 || '';
  retirementBaselineJ2Input.value = retirementBaselines.J2 || '';
  retirementContributionEntries = [...codeRetirementEntries, ...browserOnlyRetirementEntries];
  stockPriceInput.value = stockPrice || '';
  grants = await readGrants();

  if (!hasInitialized && grants.length === 0) {
    grants = DEFAULT_GRANTS;
    await saveGrantsNow();
  }
  if (!hasInitialized) await writeMetadata('initialized', true);

  databaseStatus.textContent = `Loaded ${grants.length} grant${grants.length === 1 ? '' : 's'} from local database.`;
  addGrantButton.disabled = false;
  renderGrantInputs();
  renderSchedule();
  renderTaxableIncome();
  renderRetirementContributions();
}

function updateStockPrice(value) {
  stockPrice = Number(value) || 0;
  renderSchedule();
  saveStockPrice();
}

addGrantButton.disabled = true;
addGrantButton.addEventListener('click', addGrant);
resetCorrectionsButton.addEventListener('click', resetManualCorrections);
stockPriceInput.addEventListener('input', (event) => updateStockPrice(event.target.value));
taxableIncomeInputField.addEventListener('input', (event) => updateTaxableIncomeDraft(event.target.value));
retirementInputField.addEventListener('input', (event) => updateRetirementDraft(event.target.value));
incomeEntryForm.addEventListener('submit', addTaxableIncomeEntry);
retirementEntryForm.addEventListener('submit', addRetirementContributionEntry);
importIncomeRowsButton.addEventListener('click', importTaxableIncomeRows);
importRetirementRowsButton.addEventListener('click', importRetirementContributionRows);
copyIncomeJsonButton.addEventListener('click', () => {
  copyIncomeJson().catch(() => {
    renderTaxableIncome('Could not copy JSON automatically. Select the JSON text and copy it manually.');
  });
});
downloadIncomeJsonButton.addEventListener('click', downloadIncomeJson);
copyRetirementJsonButton.addEventListener('click', () => {
  copyRetirementJson().catch(() => {
    renderRetirementContributions('Could not copy JSON automatically. Select the JSON text and copy it manually.');
  });
});
downloadRetirementJsonButton.addEventListener('click', downloadRetirementJson);
incomeBaselineJ1Input.addEventListener('input', (event) => updateIncomeBaseline('J1', event.target.value));
incomeBaselineJ2Input.addEventListener('input', (event) => updateIncomeBaseline('J2', event.target.value));
retirementBaselineJ1Input.addEventListener('input', (event) => updateRetirementBaseline('J1', event.target.value));
retirementBaselineJ2Input.addEventListener('input', (event) => updateRetirementBaseline('J2', event.target.value));
autofillFuturePaychecksButton.addEventListener('click', autofillFuturePaychecks);
clearAutofillPaychecksButton.addEventListener('click', clearAutofillPaychecks);
resetFutureIncomeButton.addEventListener('click', resetFutureIncomeEntries);
resetFutureIncomeInlineButton.addEventListener('click', resetFutureIncomeEntries);
resetAllIncomeButton.addEventListener('click', resetAllTaxableIncomeEntries);
autofillFutureRetirementButton.addEventListener('click', autofillFutureRetirementContributions);
clearAutofillRetirementButton.addEventListener('click', clearAutofillRetirementContributions);
resetFutureRetirementButton.addEventListener('click', resetFutureRetirementContributions);
resetFutureRetirementInlineButton.addEventListener('click', resetFutureRetirementContributions);
resetAllRetirementButton.addEventListener('click', resetAllRetirementContributions);
tabButtons.forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tabTarget));
});
scheduleGrid.addEventListener('change', (event) => {
  if (event.target.dataset.action === 'correct-grant-gross') {
    updateGrantGrossOverride(event.target.dataset.grantId, event.target.dataset.vestNumber, event.target.value);
  }
  if (event.target.dataset.action === 'correct-net-payout') {
    updateNetUnitOverride(event.target.dataset.dateKey, event.target.value);
  }
});
document.querySelector('#income-panel').addEventListener('click', (event) => {
  if (event.target.dataset.action === 'remove-income-entry') {
    removeTaxableIncomeEntry(event.target.dataset.entryId);
  }
  if (event.target.dataset.action === 'use-paycheck-date') {
    incomeDateInput.value = event.target.dataset.dateKey;
    incomeAmountInput.focus();
    renderTaxableIncome(`Selected ${formatDate(parseDate(event.target.dataset.dateKey))} for the next taxable income entry.`);
  }
});
document.querySelector('#retirement-panel').addEventListener('click', (event) => {
  if (event.target.dataset.action === 'remove-retirement-entry') {
    removeRetirementContributionEntry(event.target.dataset.entryId);
  }
  if (event.target.dataset.action === 'use-retirement-date') {
    retirementDateInput.value = event.target.dataset.dateKey;
    retirementAmountInput.focus();
    renderRetirementContributions(`Selected ${formatDate(parseDate(event.target.dataset.dateKey))} for the next 401k contribution entry.`);
  }
});
initializeApp().catch(() => {
  databaseStatus.textContent = 'Could not open the local database. Refresh and try again.';
  grants = DEFAULT_GRANTS;
  renderGrantInputs();
  renderSchedule();
  renderTaxableIncome();
  renderRetirementContributions();
});

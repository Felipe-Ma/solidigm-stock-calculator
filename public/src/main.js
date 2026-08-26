import { flushCloudSave, loadCloudState, onCloudStatus, queueCloudSave } from './cloud-store.js';

const DATABASE_NAME = 'solidigm-stock-calculator';
const DATABASE_VERSION = 2;
const GRANT_STORE = 'grants';
const METADATA_STORE = 'metadata';
const DEFAULT_INSTALLMENTS = 16;
// The plan vests on fixed calendar dates: Jan 30, Apr 30, Jul 30, Oct 30.
const LTI_VEST_MONTHS = [0, 3, 6, 9];
const LTI_VEST_DAY = 30;
const GRANT_CATEGORIES = ['LTI', 'NH', 'Special', 'Other'];
const TRANSACTION_TYPES = {
  'cash-out': { label: 'Cash-out', direction: -1, requiresPrice: true },
  sale: { label: 'Sale', direction: -1, requiresPrice: true },
  purchase: { label: 'Purchase', direction: 1, requiresPrice: true },
  'transfer-in': { label: 'Transfer in', direction: 1, requiresPrice: false },
  'transfer-out': { label: 'Transfer out', direction: -1, requiresPrice: false },
};
const STOCK_PRICE_KEY = 'stockPrice';
const GRANT_GROSS_OVERRIDES_KEY = 'grantGrossOverrides';
const VEST_ACTUALS_KEY = 'vestActuals';
const TRANSACTIONS_KEY = 'shareTransactions';
const APPLIED_SEEDS_KEY = 'appliedSeeds';
const TAXABLE_INCOME_INPUT_KEY = 'taxableIncomeInput';
const TAXABLE_INCOME_ENTRIES_KEY = 'taxableIncomeEntries';
const INCOME_BASELINES_KEY = 'incomeBaselines';
const RETIREMENT_INPUT_KEY = 'retirementInput';
const RETIREMENT_ENTRIES_KEY = 'retirementContributionEntries';
const RETIREMENT_BASELINES_KEY = 'retirementBaselines';
const APP_STATE_DATA_URL = '/data/app-state.json';
const RETIREMENT_DATA_URL = '/data/401k-contributions.json';
const RETIREMENT_CONTRIBUTION_CAP = 24500;
const RETIREMENT_CAP_YEAR = 2026;
const RETIREMENT_AUTOFILL_SOURCE = 'retirement-autofill';
const RETIREMENT_OVERRIDE_SOURCE = 'retirement-override';

const DEFAULT_GRANTS = [
  { id: crypto.randomUUID(), label: 'LTI 2025', category: 'LTI', shares: '1200', grantDate: '2025-04-30', vestingStartDate: '2025-04-30', installments: '16' },
  { id: crypto.randomUUID(), label: 'New hire', category: 'NH', shares: '800', grantDate: '2025-04-30', vestingStartDate: '2024-10-30', installments: '16' },
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
let vestActuals = {};
let shareTransactions = [];
let appliedSeeds = [];
let taxableIncomeEntries = [];
let taxableIncomeDraftInput = '';
let incomeBaselines = { J1: '', J2: '' };
let retirementContributionEntries = [];
let retirementDraftInput = '';
let retirementBaselines = { J1: '', J2: '' };
let cloudSyncReady = false;

const databaseStatus = document.querySelector('#database-status');
const cloudStatus = document.querySelector('#cloud-status');
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
const nextVestCaption = document.querySelector('#next-vest-caption');
const realizedValue = document.querySelector('#realized-value');
const ledgerOwned = document.querySelector('#ledger-owned');
const ledgerOwnedValue = document.querySelector('#ledger-owned-value');
const ledgerUnvested = document.querySelector('#ledger-unvested');
const ledgerGrossVested = document.querySelector('#ledger-gross-vested');
const ledgerCash = document.querySelector('#ledger-cash');
const ledgerCashNote = document.querySelector('#ledger-cash-note');
const ledgerWarnings = document.querySelector('#ledger-warnings');
const ledgerTable = document.querySelector('#ledger-table');
const transactionForm = document.querySelector('#transaction-form');
const transactionDateInput = document.querySelector('#transaction-date');
const transactionTypeInput = document.querySelector('#transaction-type');
const transactionSharesInput = document.querySelector('#transaction-shares');
const transactionPriceInput = document.querySelector('#transaction-price');
const transactionPriceLabel = document.querySelector('#transaction-price-label');
const transactionNoteInput = document.querySelector('#transaction-note');
const transactionStatus = document.querySelector('#transaction-status');
const grantTemplate = document.querySelector('#grant-template');
const addGrantButton = document.querySelector('#add-grant');
const copyAppStateJsonButton = document.querySelector('#copy-app-state-json');
const downloadAppStateJsonButton = document.querySelector('#download-app-state-json');
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

function syncToCloud() {
  if (!cloudSyncReady) return;
  queueCloudSave(getAppStateData());
}

function scheduleSave() {
  clearTimeout(saveTimer);
  databaseStatus.textContent = 'Saving…';
  saveTimer = setTimeout(() => {
    saveGrantsNow()
      .then(() => {
        databaseStatus.textContent = `Saved ${grants.length} grant${grants.length === 1 ? '' : 's'}.`;
      })
      .catch(() => {
        databaseStatus.textContent = 'Could not cache grants on this device.';
      });
  }, 200);
  syncToCloud();
}

function saveStockPrice() {
  syncToCloud();
  if (!database) return;
  writeMetadata(STOCK_PRICE_KEY, stockPrice).catch(() => {
    databaseStatus.textContent = 'Could not cache stock price on this device.';
  });
}

function saveGrantGrossOverrides() {
  syncToCloud();
  if (!database) return;
  writeMetadata(GRANT_GROSS_OVERRIDES_KEY, grantGrossOverrides).catch(() => {
    databaseStatus.textContent = 'Could not cache grant gross correction on this device.';
  });
}

function saveVestActuals() {
  syncToCloud();
  if (!database) return;
  writeMetadata(VEST_ACTUALS_KEY, vestActuals).catch(() => {
    databaseStatus.textContent = 'Could not cache recorded vest on this device.';
  });
}

function saveShareTransactions() {
  syncToCloud();
  if (!database) return;
  writeMetadata(TRANSACTIONS_KEY, shareTransactions).catch(() => {
    databaseStatus.textContent = 'Could not cache share transactions on this device.';
  });
}

function saveAppliedSeeds() {
  syncToCloud();
  if (!database) return;
  writeMetadata(APPLIED_SEEDS_KEY, appliedSeeds).catch(() => {});
}

function saveTaxableIncomeEntries() {
  syncToCloud();
  if (!database) return;
  writeMetadata(TAXABLE_INCOME_ENTRIES_KEY, taxableIncomeEntries).catch(() => {
    taxableIncomeStatus.textContent = 'Could not cache taxable income entries on this device.';
  });
}

function saveIncomeBaselines() {
  syncToCloud();
  if (!database) return;
  writeMetadata(INCOME_BASELINES_KEY, incomeBaselines).catch(() => {
    taxableIncomeStatus.textContent = 'Could not cache income baselines on this device.';
  });
}

function saveTaxableIncomeDraftInput() {
  if (!database) return;
  writeMetadata(TAXABLE_INCOME_INPUT_KEY, taxableIncomeDraftInput).catch(() => {
    taxableIncomeStatus.textContent = 'Could not cache pasted income rows on this device.';
  });
}

function saveRetirementContributionEntries() {
  syncToCloud();
  if (!database) return;
  writeMetadata(RETIREMENT_ENTRIES_KEY, retirementContributionEntries).catch(() => {
    retirementStatus.textContent = 'Could not cache 401k contribution entries on this device.';
  });
}

function saveRetirementBaselines() {
  syncToCloud();
  if (!database) return;
  writeMetadata(RETIREMENT_BASELINES_KEY, retirementBaselines).catch(() => {
    retirementStatus.textContent = 'Could not cache 401k baselines on this device.';
  });
}

function saveRetirementDraftInput() {
  if (!database) return;
  writeMetadata(RETIREMENT_INPUT_KEY, retirementDraftInput).catch(() => {
    retirementStatus.textContent = 'Could not cache pasted 401k rows on this device.';
  });
}

async function readJsonFile(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function readAppStateCodeJson() {
  return readJsonFile(APP_STATE_DATA_URL);
}

async function readRetirementCodeJson() {
  return readJsonFile(RETIREMENT_DATA_URL);
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

function parseCurrencyAmount(value) {
  const amount = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function getVestActual(dateKey) {
  const actual = vestActuals[dateKey];
  if (!actual) return null;

  const netUnits = actual.netUnits === '' || actual.netUnits === undefined ? null : parseShareAmount(actual.netUnits);
  const price = actual.price === '' || actual.price === undefined ? null : parseCurrencyAmount(actual.price);
  const settlementDate = actual.settlementDate ? parseDate(actual.settlementDate) : null;
  if (netUnits === null && price === null && !settlementDate) return null;

  return { netUnits, price, settlementDate, raw: actual };
}

function isVestRecorded(dateKey) {
  const actual = getVestActual(dateKey);
  return Boolean(actual && actual.netUnits !== null);
}

function parseWholeShareAmount(value) {
  return Math.max(Math.round(parseShareAmount(value)), 0);
}

function toGrantOverrideKey(grantId, vestNumber) {
  return `${grantId}:${vestNumber}`;
}

// Vesting agreements floor the cumulative vested total at each tranche, so fractional remainders roll forward
// rather than being handed to whichever tranche has the largest remainder.
function distributeWholeShares(entries, sharesToDistribute) {
  const targetTotal = parseWholeShareAmount(sharesToDistribute);
  const ordered = [...entries].sort((a, b) => a.trancheNumber - b.trancheNumber);

  if (ordered.length === 0) return;

  let previousCumulative = 0;
  ordered.forEach((entry, index) => {
    const cumulative = Math.floor((targetTotal * (index + 1)) / ordered.length);
    entry.amount = cumulative - previousCumulative;
    previousCumulative = cumulative;
  });
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// The agreement excludes the vesting start date itself, so the first vest is the next plan date strictly after it.
function getFirstVestDate(vestingStartDate) {
  if (!vestingStartDate) return null;

  const startYear = vestingStartDate.getFullYear();
  for (const year of [startYear, startYear + 1]) {
    for (const month of LTI_VEST_MONTHS) {
      const candidate = new Date(year, month, LTI_VEST_DAY);
      if (candidate > vestingStartDate) return candidate;
    }
  }
  return null;
}

function getGrantInstallments(grant) {
  const count = Math.round(parseShareAmount(grant.installments));
  return count > 0 ? count : DEFAULT_INSTALLMENTS;
}

// A tranche scheduled on or before the grant date could not have vested yet, so it catches up on the grant date.
function getGrantTranches(grant) {
  const shares = parseShareAmount(grant.shares);
  const vestingStartDate = parseDate(grant.vestingStartDate);
  const grantDate = parseDate(grant.grantDate);

  if (!shares || shares <= 0) return [];

  // One-off awards vest in full on the grant date rather than following the quarterly calendar.
  if (grant.vestsImmediately) {
    if (!grantDate) return [];
    return [{
      trancheNumber: 1,
      installments: 1,
      scheduledDate: grantDate,
      vestDate: grantDate,
      isCaughtUp: false,
      amount: shares,
    }];
  }

  if (!vestingStartDate) return [];

  const firstVestDate = getFirstVestDate(vestingStartDate);
  if (!firstVestDate) return [];

  const installments = getGrantInstallments(grant);
  const sharesPerTranche = shares / installments;

  return Array.from({ length: installments }, (_, index) => {
    const scheduledDate = addMonths(firstVestDate, index * 3);
    const isCaughtUp = Boolean(grantDate && scheduledDate <= grantDate);
    return {
      trancheNumber: index + 1,
      installments,
      scheduledDate,
      vestDate: isCaughtUp ? grantDate : scheduledDate,
      isCaughtUp,
      amount: sharesPerTranche,
    };
  });
}

function getSchedule() {
  const rowsByDate = new Map();

  grants.forEach((grant) => {
    const shares = parseShareAmount(grant.shares);

    getGrantTranches(grant).forEach((tranche) => {
      const dateKey = toDateKey(tranche.vestDate);
      // One-off awards are recorded separately so their actuals are not merged with regular vests on the same date.
      const key = grant.vestsImmediately ? `${dateKey}::${grant.id}` : dateKey;
      if (!rowsByDate.has(key)) rowsByDate.set(key, { date: tranche.vestDate, actualsKey: key, total: 0, tranches: [] });

      const row = rowsByDate.get(key);
      row.total += tranche.amount;
      row.tranches.push({
        id: grant.id,
        label: grant.label || 'Untitled grant',
        category: grant.category || '',
        totalShares: shares,
        amount: tranche.amount,
        calculatedAmount: tranche.amount,
        trancheNumber: tranche.trancheNumber,
        installments: tranche.installments,
        scheduledDate: tranche.scheduledDate,
        isCaughtUp: tranche.isCaughtUp,
        vestsImmediately: Boolean(grant.vestsImmediately),
      });
    });
  });

  return Array.from(rowsByDate.values()).sort((a, b) => a.date - b.date);
}

function getAdjustedSchedule(schedule) {
  const adjustedSchedule = schedule.map((row) => ({
    ...row,
    calculatedTotal: row.total,
    tranches: row.tranches.map((tranche) => ({ ...tranche, calculatedAmount: tranche.amount })),
  }));
  const entriesByGrant = new Map();

  adjustedSchedule.forEach((row, rowIndex) => {
    row.tranches.forEach((tranche, trancheIndex) => {
      const overrideKey = toGrantOverrideKey(tranche.id, tranche.trancheNumber);
      const grossOverride = grantGrossOverrides[overrideKey];
      const hasGrossOverride = grossOverride !== undefined && grossOverride !== '';
      const entry = {
        date: row.date,
        trancheNumber: tranche.trancheNumber,
        rowIndex,
        trancheIndex,
        calculatedAmount: tranche.calculatedAmount,
        amount: hasGrossOverride ? parseWholeShareAmount(grossOverride) : tranche.calculatedAmount,
        isLocked: hasGrossOverride,
      };

      if (!entriesByGrant.has(tranche.id)) {
        entriesByGrant.set(tranche.id, {
          totalShares: tranche.totalShares,
          entries: [],
        });
      }
      entriesByGrant.get(tranche.id).entries.push(entry);
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
      .sort((a, b) => a.trancheNumber - b.trancheNumber)
      .forEach((entry) => {
        vestedToDate += entry.amount;
        const tranche = adjustedSchedule[entry.rowIndex].tranches[entry.trancheIndex];
        tranche.amount = entry.amount;
        tranche.vestedToDate = vestedToDate;
        tranche.remainingPercentage = totalShares > 0
          ? Math.max(((totalShares - vestedToDate) / totalShares) * 100, 0)
          : 0;
      });
  });

  adjustedSchedule.forEach((row) => {
    row.total = row.tranches.reduce((sum, tranche) => sum + tranche.amount, 0);
    row.actual = getVestActual(row.actualsKey);
    row.isRecorded = Boolean(row.actual && row.actual.netUnits !== null);
    row.netUnits = row.isRecorded ? row.actual.netUnits : null;
    row.vestPrice = row.actual && row.actual.price !== null ? row.actual.price : null;
    row.withheldUnits = row.isRecorded ? Math.max(row.total - row.netUnits, 0) : null;

    const hasValues = row.isRecorded && row.vestPrice !== null;
    row.grossVestValue = hasValues ? row.total * row.vestPrice : null;
    row.withheldValue = hasValues ? row.withheldUnits * row.vestPrice : null;
    row.receivedValue = hasValues ? row.netUnits * row.vestPrice : null;
    row.settlementDate = row.actual?.settlementDate || row.date;
    row.isImmediate = row.tranches.every((tranche) => tranche.vestsImmediately);
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


function sanitizeSavedGrants(savedGrants) {
  if (!Array.isArray(savedGrants)) return [];

  return savedGrants
    .map((grant, index) => {
      if (!grant || typeof grant !== 'object') return null;
      const id = typeof grant.id === 'string' && grant.id ? grant.id : crypto.randomUUID();
      // Older saves called this firstVestDate, but it always held the vesting start date.
      const startDate = grant.vestingStartDate ?? grant.firstVestDate;
      const category = GRANT_CATEGORIES.includes(grant.category) ? grant.category : '';
      return {
        id,
        label: String(grant.label || `Grant ${String.fromCharCode(65 + index)}`),
        category,
        shares: grant.shares === undefined ? '' : String(grant.shares),
        grantDate: grant.grantDate === undefined || grant.grantDate === null ? '' : String(grant.grantDate),
        vestingStartDate: startDate === undefined || startDate === null ? '' : String(startDate),
        installments: grant.installments === undefined || grant.installments === null || grant.installments === ''
          ? String(DEFAULT_INSTALLMENTS)
          : String(grant.installments),
        vestsImmediately: Boolean(grant.vestsImmediately),
      };
    })
    .filter(Boolean);
}

function sanitizeSavedTransactions(savedTransactions) {
  if (!Array.isArray(savedTransactions)) return [];

  return savedTransactions
    .map((transaction) => {
      if (!transaction || typeof transaction !== 'object') return null;
      const type = TRANSACTION_TYPES[transaction.type] ? transaction.type : null;
      const dateKey = transaction.dateKey ? String(transaction.dateKey) : '';
      if (!type || !parseDate(dateKey)) return null;

      return {
        id: typeof transaction.id === 'string' && transaction.id ? transaction.id : crypto.randomUUID(),
        dateKey,
        type,
        shares: String(transaction.shares ?? ''),
        price: String(transaction.price ?? ''),
        note: String(transaction.note ?? ''),
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
}

function getAppStateData() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    stockPrice,
    grants: sanitizeSavedGrants(grants),
    grantGrossOverrides,
    vestActuals,
    shareTransactions: sanitizeSavedTransactions(shareTransactions),
    appliedSeeds,
    incomeBaselines,
    paycheckSchedule2026: PAYCHECK_SCHEDULE_2026,
    taxableIncomeEntries: sanitizeSavedIncomeEntries(taxableIncomeEntries),
    yearlyContributionCap: RETIREMENT_CONTRIBUTION_CAP,
    capYear: RETIREMENT_CAP_YEAR,
    retirementBaselines,
    retirementContributionEntries: sanitizeSavedRetirementEntries(retirementContributionEntries),
  };
}

function getAppStateJson() {
  return JSON.stringify(getAppStateData(), null, 2);
}

async function copyAppStateJson() {
  const json = getAppStateJson();
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(json);
    databaseStatus.textContent = 'Copied a backup of your data to the clipboard.';
    return;
  }

  await copyTextWithHiddenTextarea(json);
  databaseStatus.textContent = 'Copied a backup of your data to the clipboard.';
}

function downloadAppStateJson() {
  const blob = new Blob([getAppStateJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'app-state.json';
  link.click();
  URL.revokeObjectURL(link.href);
  databaseStatus.textContent = 'Downloaded a backup copy of your data.';
}

function copyTextWithHiddenTextarea(text) {
  return new Promise((resolve) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    resolve();
  });
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
  taxableIncomeStatus.textContent = message || `${taxableIncomeEntries.length} taxable income entr${taxableIncomeEntries.length === 1 ? 'y' : 'ies'} saved.`;

  const summaryCards = Object.entries(totals.byCategory).map(([label, value]) => ({ label, value, type: 'category' }));

  taxableIncomeSummary.innerHTML = summaryCards.length === 0
    ? '<p class="empty-state">Add or import taxable income entries to calculate category totals.</p>'
    : summaryCards.map((card) => `
      <article class="summary-card">
        <span>${escapeHtml(card.label)}</span>
        <strong>${formatCurrency(card.value)}</strong>
      </article>
    `).join('');

  const rows = [...taxableIncomeEntries].sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
  taxableIncomeTable.innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="table-empty">No taxable income entries yet.</td></tr>'
    : rows.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <tr class="${isFutureIncomeEntry(entry) ? 'is-future' : ''}">
          <td><time datetime="${entry.dateKey}">${formatDate(date)}</time></td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td><span class="pill pill-${toClassToken(entry.job)}">${escapeHtml(entry.job)}</span></td>
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
      <article class="date-card is-${status}">
        <div class="date-card-head">
          <div>
            <span>Paycheck ${paycheck.paycheckNumber}</span>
            <time datetime="${paycheck.dateKey}">${formatDate(date)}</time>
          </div>
          <strong>${formatCurrency(total)}</strong>
        </div>
        <div class="date-running" aria-label="Running taxable income through paycheck ${paycheck.paycheckNumber}">
          <span>Running total</span>
          <strong>${formatCurrency(runningTotals.total)}</strong>
          <small>J1 ${formatCurrency(runningTotals.j1)} · J2 ${formatCurrency(runningTotals.j2)}</small>
        </div>
        <div class="date-entries">
          ${entries.length === 0
    ? '<p class="status-line">No entries for this date.</p>'
    : entries.map((entry) => `
            <div class="date-entry income-${toClassToken(entry.job)}">
              <span>${escapeHtml(entry.job)} · ${escapeHtml(entry.category)}</span>
              <strong>${formatCurrency(entry.amount)}</strong>
              <button class="text-button" type="button" data-action="remove-income-entry" data-entry-id="${entry.id}">Remove</button>
            </div>
          `).join('')}
        </div>
        <button class="text-button" type="button" data-action="use-paycheck-date" data-date-key="${paycheck.dateKey}">Use this date</button>
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
    ? '<p class="empty-state">Autofill or manually add future-dated taxable income to see it here.</p>'
    : futureEntries.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <article class="future-card income-${toClassToken(entry.job)}">
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
  persistTaxableIncomeEntries('Saved taxable income entry.');
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
  if (entry.source === RETIREMENT_AUTOFILL_SOURCE) {
    return `401k autofill #${entry.paycheckNumber || ''}`;
  }
  if (entry.source === RETIREMENT_OVERRIDE_SOURCE) {
    return `401k override #${entry.paycheckNumber || ''}`;
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
      const hasAmount = entry.amount !== undefined && entry.amount !== null && String(entry.amount).trim() !== '';
      const amount = parseCurrencyAmount(entry.amount);
      if (!date || !hasAmount || !Number.isFinite(amount) || amount < 0) return null;
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
  const futureAutofillCount = futureEntries.filter((entry) => entry.source === RETIREMENT_AUTOFILL_SOURCE).length;
  futureRetirementListSummary.textContent = futureEntries.length === 0
    ? 'No future 401k contribution entries yet.'
    : `${futureEntries.length} future 401k entr${futureEntries.length === 1 ? 'y' : 'ies'} visible here, including ${futureAutofillCount} autofilled entr${futureAutofillCount === 1 ? 'y' : 'ies'}.`;

  futureRetirementList.innerHTML = futureEntries.length === 0
    ? '<p class="empty-state">Autofill or manually add future-dated 401k contributions to see them here.</p>'
    : futureEntries.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <article class="future-card income-${toClassToken(entry.job)}">
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

function getScheduledRetirementAmount(dateKey, job) {
  return retirementContributionEntries
    .filter((entry) => entry.dateKey === dateKey && entry.job === job && [RETIREMENT_AUTOFILL_SOURCE, RETIREMENT_OVERRIDE_SOURCE].includes(entry.source))
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function hasScheduledRetirementOverride(dateKey, job) {
  return retirementContributionEntries.some((entry) => entry.dateKey === dateKey && entry.job === job && entry.source === RETIREMENT_OVERRIDE_SOURCE);
}

function renderRetirementPaycheckScheduleBoxes() {
  retirementPaycheckScheduleGrid.innerHTML = PAYCHECK_SCHEDULE_2026.map((paycheck) => {
    const date = parseDate(paycheck.dateKey);
    const status = getPaycheckDateStatus(paycheck.dateKey);
    const entries = retirementContributionEntries.filter((entry) => entry.dateKey === paycheck.dateKey);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

    const quickEditFields = ['J1', 'J2'].map((job) => {
      const scheduledAmount = getScheduledRetirementAmount(paycheck.dateKey, job);
      const hasOverride = hasScheduledRetirementOverride(paycheck.dateKey, job);
      return `
        <label class="field${hasOverride ? ' is-override' : ''}">
          <span class="field-label">${job}${hasOverride ? ' override' : ''}</span>
          <input
            data-action="update-retirement-scheduled-contribution"
            data-date-key="${paycheck.dateKey}"
            data-job="${job}"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value="${hasOverride || scheduledAmount > 0 ? scheduledAmount.toFixed(2) : ''}"
            aria-label="${job} scheduled 401k contribution for ${formatDate(date)}"
          />
        </label>
      `;
    }).join('');

    return `
      <article class="date-card is-${status}">
        <div class="date-card-head">
          <div>
            <span>Paycheck ${paycheck.paycheckNumber}</span>
            <time datetime="${paycheck.dateKey}">${formatDate(date)}</time>
          </div>
          <strong>${formatCurrency(total)}</strong>
        </div>
        <div class="date-inputs" aria-label="Manual scheduled 401k edits">
          ${quickEditFields}
        </div>
        <div class="date-entries">
          ${entries.length === 0
    ? '<p class="status-line">No contributions for this date.</p>'
    : entries.map((entry) => `
            <div class="date-entry income-${toClassToken(entry.job)}">
              <span>${escapeHtml(entry.job)} · ${escapeHtml(entry.category)}</span>
              <strong>${formatCurrency(entry.amount)}</strong>
              <button class="text-button" type="button" data-action="remove-retirement-entry" data-entry-id="${entry.id}">Remove</button>
            </div>
          `).join('')}
        </div>
        <button class="text-button" type="button" data-action="use-retirement-date" data-date-key="${paycheck.dateKey}">Use this date</button>
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
  retirementCapStatusCard.classList.toggle('is-over', capRemaining < 0);
  retirementCapStatusCard.classList.toggle('is-under', capRemaining >= 0);
  retirementJsonOutput.value = getRetirementJson();
  futureRetirementSummary.textContent = getFutureRetirementSummary();
  renderFutureRetirementList();
  renderRetirementPaycheckScheduleBoxes();

  const capMessage = capRemaining < 0
    ? ` You are ${formatCurrency(Math.abs(capRemaining))} over the ${RETIREMENT_CAP_YEAR} cap.`
    : ` ${formatCurrency(capRemaining)} remains under the ${RETIREMENT_CAP_YEAR} cap.`;
  retirementStatus.textContent = message || `${retirementContributionEntries.length} 401k contribution entr${retirementContributionEntries.length === 1 ? 'y' : 'ies'} saved.${capMessage}`;

  const summaryCards = Object.entries(totals.byCategory).map(([label, value]) => ({ label, value, type: 'category' }));

  retirementSummary.innerHTML = summaryCards.length === 0
    ? '<p class="empty-state">Add or import 401k contributions to calculate category totals.</p>'
    : summaryCards.map((card) => `
      <article class="summary-card">
        <span>${escapeHtml(card.label)}</span>
        <strong>${formatCurrency(card.value)}</strong>
      </article>
    `).join('');

  const rows = [...retirementContributionEntries].sort((a, b) => parseDate(a.dateKey) - parseDate(b.dateKey));
  retirementTable.innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="table-empty">No 401k contribution entries yet.</td></tr>'
    : rows.map((entry) => {
      const date = parseDate(entry.dateKey);
      return `
        <tr class="${isFutureRetirementEntry(entry) ? 'is-future' : ''}">
          <td><time datetime="${entry.dateKey}">${formatDate(date)}</time></td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td><span class="pill pill-${toClassToken(entry.job)}">${escapeHtml(entry.job)}</span></td>
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
  persistRetirementContributionEntries('Saved 401k contribution entry.');
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

  retirementContributionEntries = retirementContributionEntries.filter((entry) => entry.source !== RETIREMENT_AUTOFILL_SOURCE);
  const generatedEntries = futurePaychecks.flatMap((paycheck) => jobs
    .filter(({ job }) => !hasScheduledRetirementOverride(paycheck.dateKey, job))
    .map(({ job, amount }) => createRetirementContributionEntry({
      date: parseDate(paycheck.dateKey),
      amount,
      category: 'Normal paycheck',
      job,
      source: RETIREMENT_AUTOFILL_SOURCE,
      paycheckNumber: paycheck.paycheckNumber,
    })));

  retirementContributionEntries = [...retirementContributionEntries, ...generatedEntries];
  persistRetirementContributionEntries(`Autofilled ${generatedEntries.length} future 401k contribution entr${generatedEntries.length === 1 ? 'y' : 'ies'} from the 2026 schedule.`);
}

function updateScheduledRetirementContribution(dateKey, job, value) {
  const date = parseDate(dateKey);
  const amount = parseCurrencyAmount(value);
  const paycheck = PAYCHECK_SCHEDULE_2026.find((scheduledPaycheck) => scheduledPaycheck.dateKey === dateKey);
  const normalizedJob = normalizeIncomeJob(job);

  if (!date || !paycheck || !['J1', 'J2'].includes(normalizedJob)) {
    renderRetirementContributions('Choose a valid scheduled paycheck and job before changing a 401k amount.');
    return;
  }
  if (value !== '' && (amount < 0 || !Number.isFinite(amount))) {
    renderRetirementContributions('Enter a valid non-negative 401k amount for the scheduled paycheck.');
    return;
  }

  retirementContributionEntries = retirementContributionEntries.filter((entry) => !(
    entry.dateKey === dateKey
    && entry.job === normalizedJob
    && [RETIREMENT_AUTOFILL_SOURCE, RETIREMENT_OVERRIDE_SOURCE].includes(entry.source)
  ));

  if (value !== '') {
    retirementContributionEntries = [
      ...retirementContributionEntries,
      createRetirementContributionEntry({
        date,
        amount,
        category: 'Normal paycheck',
        job: normalizedJob,
        source: RETIREMENT_OVERRIDE_SOURCE,
        paycheckNumber: paycheck.paycheckNumber,
      }),
    ];
  }

  persistRetirementContributionEntries(`Updated ${normalizedJob} scheduled 401k contribution for ${formatDate(date)}. Future autofills will keep this manual override.`);
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
  const removedCount = retirementContributionEntries.filter((entry) => entry.source === RETIREMENT_AUTOFILL_SOURCE).length;
  retirementContributionEntries = retirementContributionEntries.filter((entry) => entry.source !== RETIREMENT_AUTOFILL_SOURCE);
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
    renderRetirementContributions('Copied 401k JSON to the clipboard.');
    return;
  }

  retirementJsonOutput.select();
  document.execCommand('copy');
  renderRetirementContributions('Copied 401k JSON to the clipboard.');
}

function downloadRetirementJson() {
  const blob = new Blob([getRetirementJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '401k-contributions.json';
  link.click();
  URL.revokeObjectURL(link.href);
  renderRetirementContributions('Downloaded a copy of your 401k entries.');
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

function describeGrantVesting(grant) {
  const tranches = getGrantTranches(grant);
  if (tranches.length === 0) return 'Set shares and a vesting start date to build the schedule.';

  const caughtUp = tranches.filter((tranche) => tranche.isCaughtUp);
  const first = tranches[0];
  const last = tranches[tranches.length - 1];
  const catchUpNote = caughtUp.length > 0
    ? ` · tranches ${formatTrancheRange(caughtUp.map((tranche) => tranche.trancheNumber))} caught up on the grant date`
    : '';

  return `First vest ${formatDate(first.vestDate)} · through ${formatDate(last.vestDate)}${catchUpNote}`;
}

function renderGrantInputs() {
  grantList.replaceChildren();

  if (grants.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No grants yet. Add your first grant to build the 4-year schedule.';
    grantList.append(emptyState);
    return;
  }

  grants.forEach((grant) => {
    const fragment = grantTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.grant-card');
    card.dataset.id = grant.id;
    card.querySelector('[data-action="remove"]').setAttribute('aria-label', `Remove ${grant.label || 'grant'}`);

    const derived = card.querySelector('[data-role="first-vest"]');
    derived.textContent = describeGrantVesting(grant);

    card.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.dataset.field;
      if (input.type === 'checkbox') {
        input.checked = Boolean(grant[field]);
        input.addEventListener('change', (event) => updateGrant(grant.id, field, event.target.checked));
        return;
      }
      input.value = grant[field] || '';
      input.addEventListener('input', (event) => {
        updateGrant(grant.id, field, event.target.value);
      });
    });

    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeGrant(grant.id));
    grantList.append(card);
  });
}

function formatTrancheRange(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current !== previous + 1) {
      parts.push(start === previous ? `${start}` : `${start}\u2013${previous}`);
      start = current;
    }
    previous = current;
  }

  return parts.join(', ');
}

function describeEventTranches(row) {
  const byGrant = new Map();
  row.tranches.forEach((tranche) => {
    if (!byGrant.has(tranche.id)) byGrant.set(tranche.id, { installments: tranche.installments, numbers: [] });
    byGrant.get(tranche.id).numbers.push(tranche.trancheNumber);
  });

  if (byGrant.size === 1) {
    const [{ installments, numbers }] = [...byGrant.values()];
    const label = numbers.length === 1 ? 'Tranche' : 'Tranches';
    return `${label} ${formatTrancheRange(numbers)} of ${installments}`;
  }

  return `${row.tranches.length} tranches from ${byGrant.size} grants`;
}

function getTransactionCash(transaction) {
  const info = TRANSACTION_TYPES[transaction.type];
  const price = transaction.price === '' ? null : parseCurrencyAmount(transaction.price);
  if (price === null) return null;
  // Shares leaving the account generate cash; shares arriving consume it.
  return parseShareAmount(transaction.shares) * price * -info.direction;
}

// Owned shares move on settlement, vesting progress moves on the vest date, so one vest can produce two rows.
function getLedger() {
  const schedule = getAdjustedSchedule(getSchedule());
  const today = startOfToday();
  const events = [];

  schedule.forEach((row) => {
    const vestDateKey = toDateKey(row.date);
    const settlementDate = row.settlementDate;
    const settlesLater = toDateKey(settlementDate) !== vestDateKey;
    const hasVested = row.date <= today;
    const label = row.isImmediate ? 'Special RSU vest' : 'RSU vest';

    events.push({
      date: row.date,
      rank: 0,
      type: label,
      detail: describeEventTranches(row),
      grossShares: row.total,
      withheldShares: row.isRecorded ? row.withheldUnits : null,
      netShares: settlesLater ? null : (row.isRecorded ? row.netUnits : null),
      cash: null,
      grossVestedDelta: hasVested ? row.total : 0,
      ownedDelta: settlesLater ? 0 : (row.isRecorded ? row.netUnits : 0),
      isFuture: !hasVested,
      missingActuals: hasVested && !row.isRecorded,
      netExceedsGross: row.isRecorded && row.netUnits > row.total + 0.0001,
      vestDateKey,
    });

    if (settlesLater && row.isRecorded) {
      events.push({
        date: settlementDate,
        rank: 1,
        type: 'RSU settlement',
        detail: `Delivery of ${formatDate(row.date)} vest`,
        grossShares: null,
        withheldShares: null,
        netShares: row.netUnits,
        cash: null,
        grossVestedDelta: 0,
        ownedDelta: row.netUnits,
        isFuture: settlementDate > today,
        missingActuals: false,
        vestDateKey,
      });
    }
  });

  shareTransactions.forEach((transaction) => {
    const info = TRANSACTION_TYPES[transaction.type];
    const shares = parseShareAmount(transaction.shares);
    const signedShares = shares * info.direction;

    events.push({
      date: parseDate(transaction.dateKey),
      rank: 2,
      type: info.label,
      detail: transaction.note || '',
      grossShares: null,
      withheldShares: null,
      netShares: signedShares,
      cash: getTransactionCash(transaction),
      grossVestedDelta: 0,
      ownedDelta: signedShares,
      isFuture: parseDate(transaction.dateKey) > today,
      missingActuals: false,
      transactionId: transaction.id,
    });
  });

  events.sort((a, b) => a.date - b.date || a.rank - b.rank);

  let owned = 0;
  let grossVested = 0;
  events.forEach((event) => {
    event.ownedBefore = owned;
    owned += event.ownedDelta;
    grossVested += event.grossVestedDelta;
    event.ownedAfter = owned;
    event.grossVestedAfter = grossVested;
    event.shortBy = event.ownedDelta < 0 && -event.ownedDelta > event.ownedBefore + 0.0001
      ? -event.ownedDelta - event.ownedBefore
      : 0;
  });

  return events;
}

function getLedgerSummary(ledger) {
  const settled = ledger.filter((event) => !event.isFuture);
  const owned = settled.length > 0 ? settled[settled.length - 1].ownedAfter : 0;
  const grossVested = settled.length > 0 ? settled[settled.length - 1].grossVestedAfter : 0;
  const totalGross = ledger.reduce((sum, event) => sum + (event.grossShares ?? 0), 0);

  const cashGenerated = ledger.reduce((sum, event) => sum + Math.max(event.cash ?? 0, 0), 0);
  const cashUsed = ledger.reduce((sum, event) => sum + Math.min(event.cash ?? 0, 0), 0);

  return {
    owned,
    grossVested,
    unvested: Math.max(totalGross - grossVested, 0),
    cashGenerated,
    cashReinvested: -cashUsed,
    cashRemaining: cashGenerated + cashUsed,
    missingActuals: settled.filter((event) => event.missingActuals),
    netExceedsGross: ledger.filter((event) => event.netExceedsGross),
    shortfalls: ledger.filter((event) => event.shortBy > 0),
  };
}

function formatSignedShares(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatShares(Math.abs(value))}`;
}

function renderLedger(message) {
  const ledger = getLedger();
  const summary = getLedgerSummary(ledger);

  ledgerOwned.textContent = formatShares(summary.owned);
  ledgerOwnedValue.textContent = `${formatCurrency(summary.owned * stockPrice)} at today's price`;
  ledgerUnvested.textContent = formatShares(summary.unvested);
  ledgerGrossVested.textContent = formatShares(summary.grossVested);
  ledgerCash.textContent = formatCurrency(summary.cashGenerated);
  ledgerCashNote.textContent = summary.cashGenerated > 0
    ? `${formatCurrency(summary.cashReinvested)} reinvested · ${formatCurrency(summary.cashRemaining)} not reinvested`
    : 'No corporate events recorded';

  const warnings = [];
  summary.shortfalls.forEach((event) => {
    warnings.push(`${formatDate(event.date)} ${event.type.toLowerCase()} removes ${formatShares(-event.ownedDelta)} shares but only ${formatShares(event.ownedBefore)} were recorded as owned — the earlier net vest history is short by ${formatShares(event.shortBy)}.`);
  });
  if (summary.missingActuals.length > 0) {
    warnings.push(`${summary.missingActuals.length} past vest${summary.missingActuals.length === 1 ? '' : 's'} have no recorded actuals, so their net shares are missing from the balance: ${summary.missingActuals.map((event) => formatDate(event.date)).join(', ')}.`);
  }
  summary.netExceedsGross.forEach((event) => {
    warnings.push(`${formatDate(event.date)} records ${formatShares(event.netShares ?? 0)} net shares against only ${formatShares(event.grossShares)} gross — check the grant's share count or the recorded net figure.`);
  });

  ledgerWarnings.innerHTML = warnings.length === 0
    ? ''
    : warnings.map((text) => `<p class="schedule-warning" role="alert">${escapeHtml(text)}</p>`).join('');

  ledgerTable.innerHTML = ledger.length === 0
    ? '<tr><td colspan="9" class="table-empty">No events yet. Add grants on the Vesting tab or a transaction above.</td></tr>'
    : ledger.map((event) => {
      const classes = [
        event.isFuture ? 'is-future' : '',
        event.shortBy > 0 ? 'is-error' : '',
        event.missingActuals ? 'is-warning' : '',
      ].filter(Boolean).join(' ');

      return `
        <tr class="${classes}">
          <td><time datetime="${toDateKey(event.date)}">${formatDate(event.date)}</time></td>
          <td>
            ${escapeHtml(event.type)}
            ${event.detail ? `<br><small class="row-detail">${escapeHtml(event.detail)}</small>` : ''}
            ${event.missingActuals ? '<br><small class="row-flag">actuals not recorded</small>' : ''}
            ${event.shortBy > 0 ? '<br><small class="row-error">exceeds recorded balance</small>' : ''}
          </td>
          <td class="num">${event.grossShares === null ? '—' : formatShares(event.grossShares)}</td>
          <td class="num">${event.withheldShares === null ? '—' : formatShares(event.withheldShares)}</td>
          <td class="num">${formatSignedShares(event.netShares)}</td>
          <td class="num">${event.cash === null ? '—' : formatCurrency(event.cash)}</td>
          <td class="num">${formatShares(event.grossVestedAfter)}</td>
          <td class="num owned-cell">${formatShares(event.ownedAfter)}</td>
          <td>${event.transactionId ? `<button class="text-button" type="button" data-action="remove-transaction" data-transaction-id="${event.transactionId}">Remove</button>` : ''}</td>
        </tr>
      `;
    }).join('');

  if (message) transactionStatus.textContent = message;
}

function addShareTransaction(event) {
  event.preventDefault();
  const date = parseDate(transactionDateInput.value);
  const shares = parseShareAmount(transactionSharesInput.value);
  const type = transactionTypeInput.value;
  const info = TRANSACTION_TYPES[type];
  const priceValue = transactionPriceInput.value.trim();

  if (!date || !shares || shares <= 0) {
    renderLedger('Enter a valid date and share count.');
    return;
  }
  if (info.requiresPrice && priceValue === '') {
    renderLedger(`${info.label} needs a price per share so the proceeds can be recorded.`);
    return;
  }

  shareTransactions = sanitizeSavedTransactions([
    ...shareTransactions,
    {
      id: crypto.randomUUID(),
      dateKey: toDateKey(date),
      type,
      shares: String(shares),
      price: priceValue,
      note: transactionNoteInput.value.trim(),
    },
  ]);

  transactionForm.reset();
  transactionTypeInput.value = type;
  renderLedger(`Added ${info.label.toLowerCase()} of ${formatShares(shares)} shares.`);
  renderSchedule();
  saveShareTransactions();
}

function removeShareTransaction(id) {
  shareTransactions = shareTransactions.filter((transaction) => transaction.id !== id);
  renderLedger('Removed transaction.');
  renderSchedule();
  saveShareTransactions();
}

function updateTransactionPriceLabel() {
  const info = TRANSACTION_TYPES[transactionTypeInput.value];
  transactionPriceLabel.textContent = info.requiresPrice ? 'Price per share' : 'Price per share (optional)';
  transactionPriceInput.required = info.requiresPrice;
}

function renderSchedule() {
  const schedule = getAdjustedSchedule(getSchedule());
  const today = startOfToday();

  const totalGrossShares = schedule.reduce((sum, row) => sum + row.total, 0);
  const heldNetUnits = schedule.reduce((sum, row) => sum + (row.isRecorded ? row.netUnits : 0), 0);
  const realizedTotal = schedule.reduce((sum, row) => sum + (row.receivedValue ?? 0), 0);
  const remainingGrossUnits = schedule.reduce((sum, row) => sum + (row.isRecorded ? 0 : row.total), 0);
  const nextRow = schedule.find((row) => !row.isRecorded && row.date > today) || null;
  const dueRow = schedule.find((row) => !row.isRecorded && row.date <= today) || null;

  grandTotal.textContent = formatShares(totalGrossShares);
  totalValue.textContent = formatCurrency((heldNetUnits + remainingGrossUnits) * stockPrice);
  heldUnits.textContent = formatShares(heldNetUnits);
  heldValue.textContent = `${formatCurrency(heldNetUnits * stockPrice)} at today's price`;
  realizedValue.textContent = formatCurrency(realizedTotal);
  futureUnits.textContent = formatShares(remainingGrossUnits);
  futureValue.textContent = `${formatCurrency(remainingGrossUnits * stockPrice)} at today's price`;
  nextVestValue.textContent = nextRow ? formatShares(nextRow.total) : '—';
  nextVestCaption.textContent = nextRow ? `Next vest · ${formatDate(nextRow.date)}` : 'Next vest';

  scheduleGrid.replaceChildren();

  if (schedule.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Add a grant with shares and a vesting start date to build the schedule.';
    scheduleGrid.append(emptyState);
    return;
  }

  const overAllocatedGrants = [];
  const grantTotals = new Map();
  schedule.forEach((row) => {
    row.tranches.forEach((tranche) => {
      if (!grantTotals.has(tranche.id)) {
        grantTotals.set(tranche.id, { label: tranche.label, totalShares: tranche.totalShares, scheduled: 0 });
      }
      grantTotals.get(tranche.id).scheduled += tranche.amount;
    });
  });
  grantTotals.forEach((info) => {
    if (info.scheduled > info.totalShares + 0.001) {
      overAllocatedGrants.push(`${info.label} (${formatShares(info.scheduled)} scheduled vs ${formatShares(info.totalShares)} granted)`);
    }
  });
  if (overAllocatedGrants.length > 0) {
    const warning = document.createElement('p');
    warning.className = 'schedule-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = `Gross corrections exceed the grant total for: ${overAllocatedGrants.join(', ')}. Lower the corrections or the schedule will over-count shares.`;
    scheduleGrid.append(warning);
  }

  const dueDateKey = dueRow ? dueRow.actualsKey : null;
  const nextDateKey = nextRow ? nextRow.actualsKey : null;

  const list = document.createElement('div');
  list.className = 'schedule-grid';
  list.innerHTML = schedule.map((row, index) => {
    const dateKey = toDateKey(row.date);
    const actualsKey = row.actualsKey;
    const isDue = actualsKey === dueDateKey;
    const isNext = actualsKey === nextDateKey;
    const canRecord = row.date <= today || row.isRecorded;

    const state = row.isRecorded ? 'is-recorded' : isDue ? 'is-due' : isNext ? 'is-next' : '';
    const badge = row.isRecorded
      ? '<span class="badge badge-recorded">Recorded</span>'
      : isDue
        ? '<span class="badge badge-due">Awaiting actuals</span>'
        : isNext
          ? '<span class="badge badge-next">Next</span>'
          : '<span class="badge badge-upcoming">Upcoming</span>';

    const figures = row.isRecorded
      ? `
          <div class="figure">
            <span class="figure-label">Gross units</span>
            <strong class="figure-value">${formatShares(row.total)}</strong>
          </div>
          <div class="figure figure-positive">
            <span class="figure-label">Net units received</span>
            <strong class="figure-value">${formatShares(row.netUnits)}</strong>
          </div>
          <div class="figure figure-muted">
            <span class="figure-label">Shares withheld</span>
            <strong class="figure-value">${formatShares(row.withheldUnits)}</strong>
          </div>
          <div class="figure">
            <span class="figure-label">Gross vest value</span>
            <strong class="figure-value">${row.grossVestValue === null ? '—' : formatCurrency(row.grossVestValue)}</strong>
          </div>
          <div class="figure figure-warning">
            <span class="figure-label">Withholding value</span>
            <strong class="figure-value">${row.withheldValue === null ? '—' : formatCurrency(row.withheldValue)}</strong>
          </div>
          <div class="figure figure-positive">
            <span class="figure-label">Net value received</span>
            <strong class="figure-value">${row.receivedValue === null ? '—' : formatCurrency(row.receivedValue)}</strong>
          </div>
          <div class="figure figure-muted">
            <span class="figure-label">Worth today</span>
            <strong class="figure-value">${formatCurrency(row.netUnits * stockPrice)}</strong>
          </div>
        `
      : `
          <div class="figure">
            <span class="figure-label">Gross units</span>
            <strong class="figure-value">${formatShares(row.total)}</strong>
          </div>
          <div class="figure figure-muted">
            <span class="figure-label">Gross value today</span>
            <strong class="figure-value">${formatCurrency(row.total * stockPrice)}</strong>
          </div>
          <div class="figure figure-muted">
            <span class="figure-label">From</span>
            <strong class="figure-value">${row.tranches.length} tranche${row.tranches.length === 1 ? '' : 's'}</strong>
          </div>
        `;

    const actualsBlock = canRecord
      ? `
        <div class="vest-actuals">
          <span class="vest-actuals-title">${row.isRecorded ? 'Recorded actuals' : 'Record what you actually received'}</span>
          <label class="field">
            <span class="field-label">Net units received</span>
            <input
              data-action="vest-net-units"
              data-date-key="${actualsKey}"
              type="number"
              step="0.0001"
              min="0"
              placeholder="0"
              value="${escapeHtml(String(row.actual?.raw?.netUnits ?? ''))}"
            />
          </label>
          <label class="field">
            <span class="field-label">Share price at vest</span>
            <input
              data-action="vest-price"
              data-date-key="${actualsKey}"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value="${escapeHtml(String(row.actual?.raw?.price ?? ''))}"
            />
          </label>
          <label class="field">
            <span class="field-label">Settlement date</span>
            <input
              data-action="vest-settlement"
              data-date-key="${actualsKey}"
              type="date"
              value="${escapeHtml(String(row.actual?.raw?.settlementDate ?? ''))}"
            />
          </label>
        </div>
      `
      : '';

    return `
      <article class="vest-card ${state}">
        <div class="vest-head">
          <div class="vest-when">
            <span class="vest-index">Event ${index + 1}</span>
            <time datetime="${dateKey}">${formatDate(row.date)}</time>
            <span class="tranche-chip">${describeEventTranches(row)}</span>
            ${row.tranches.some((tranche) => tranche.isCaughtUp) ? '<span class="badge badge-catchup">Catch-up</span>' : ''}
          </div>
          ${badge}
        </div>

        <div class="vest-figures">${figures}</div>

        ${actualsBlock}

        <details class="vest-sources">
          <summary>Tranche breakdown</summary>
          <div class="source-list">
            ${row.tranches.map((tranche) => `
              <div class="source-row">
                <span class="source-name">
                  ${escapeHtml(tranche.label)}
                  ${tranche.category ? `<span class="pill">${escapeHtml(tranche.category)}</span>` : ''}
                </span>
                <span class="source-muted">Tranche ${tranche.trancheNumber}/${tranche.installments}</span>
                <span class="source-muted">
                  ${formatShares(tranche.amount)} scheduled
                  ${tranche.isCaughtUp ? `<br><span class="source-catchup">from ${formatDate(tranche.scheduledDate)}</span>` : ''}
                </span>
                <label class="field">
                  <span class="field-label">Correct gross</span>
                  <input
                    data-action="correct-grant-gross"
                    data-grant-id="${tranche.id}"
                    data-vest-number="${tranche.trancheNumber}"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="${formatShares(tranche.amount)}"
                    value="${escapeHtml(String(grantGrossOverrides[toGrantOverrideKey(tranche.id, tranche.trancheNumber)] ?? ''))}"
                  />
                </label>
                <span class="source-muted">${formatShares(tranche.remainingPercentage)}% left</span>
              </div>
            `).join('')}
          </div>
        </details>
      </article>
    `;
  }).join('');

  scheduleGrid.append(list);
  renderLedger();
}

function updateGrant(id, field, value) {
  grants = grants.map((grant) => (grant.id === id ? { ...grant, [field]: value } : grant));

  const updated = grants.find((grant) => grant.id === id);
  const derived = grantList.querySelector(`.grant-card[data-id="${id}"] [data-role="first-vest"]`);
  if (updated && derived) derived.textContent = describeGrantVesting(updated);

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

  renderSchedulePreservingFocus();
  saveGrantGrossOverrides();
}

// Re-rendering replaces the inputs, so wait for focus to settle then move it to the equivalent field.
function renderSchedulePreservingFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const dataset = active && active.dataset && active.dataset.action ? { ...active.dataset } : null;
    const selectionStart = active && active.selectionStart !== undefined ? active.selectionStart : null;

    renderSchedule();

    if (!dataset) return;

    const selector = ['action', 'dateKey', 'grantId', 'vestNumber']
      .filter((key) => dataset[key] !== undefined)
      .map((key) => `[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${dataset[key]}"]`)
      .join('');
    const next = scheduleGrid.querySelector(selector);
    if (!next) return;

    next.focus();
    if (selectionStart !== null && next.setSelectionRange && next.type !== 'number') {
      next.setSelectionRange(selectionStart, selectionStart);
    }
  });
}

function updateVestActual(dateKey, field, value) {
  const next = { ...vestActuals };
  const entry = { ...(next[dateKey] || {}) };

  if (value === '') {
    delete entry[field];
  } else {
    entry[field] = value;
  }

  if (Object.keys(entry).length === 0) {
    delete next[dateKey];
  } else {
    next[dateKey] = entry;
  }

  vestActuals = next;
  renderSchedulePreservingFocus();
  saveVestActuals();
}

function resetManualCorrections() {
  grantGrossOverrides = {};
  vestActuals = {};
  renderSchedule();
  saveGrantGrossOverrides();
  saveVestActuals();
}

function addGrant() {
  grants = [
    ...grants,
    { id: crypto.randomUUID(), label: `Grant ${String.fromCharCode(65 + grants.length)}`, category: '', shares: '', grantDate: '', vestingStartDate: '', installments: String(DEFAULT_INSTALLMENTS) },
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

// Older saves stored a single post-tax unit count per vest date instead of recorded actuals.
function migrateNetUnitOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return {};
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([, value]) => value !== '' && value !== undefined && value !== null)
      .map(([dateKey, value]) => [dateKey, { netUnits: String(value) }]),
  );
}

// One-time load of the 2026 cash-out, reinvestment, and Special RSU award.
const CORPORATE_EVENTS_2026_SEED = 'corporate-events-2026';

function applyCorporateEvents2026Seed() {
  if (appliedSeeds.includes(CORPORATE_EVENTS_2026_SEED)) return false;

  shareTransactions = sanitizeSavedTransactions([
    ...shareTransactions,
    {
      id: 'txn-cash-out-2026-03-01',
      dateKey: '2026-03-01',
      type: 'cash-out',
      shares: '1270',
      price: '6.35',
      note: 'Corporate event cash-out',
    },
    {
      id: 'txn-purchase-2026-04-01',
      dateKey: '2026-04-01',
      type: 'purchase',
      shares: '1016',
      price: '6.35',
      note: 'Reinvestment of 80% of proceeds',
    },
  ]);

  if (!grants.some((grant) => grant.id === 'grant-special-rsu-2026')) {
    grants = [
      ...grants,
      {
        id: 'grant-special-rsu-2026',
        label: '2026-04-30 Special RSU-2026',
        category: 'Special',
        shares: '457',
        grantDate: '2026-04-30',
        vestingStartDate: '',
        installments: '1',
        vestsImmediately: true,
      },
    ];
  }

  vestActuals = {
    ...vestActuals,
'2026-04-30::grant-special-rsu-2026': { netUnits: '268', price: '6.35', settlementDate: '2026-05-01' },
    '2025-04-30': { ...(vestActuals['2025-04-30'] || {}), netUnits: '317' },
  };

  appliedSeeds = [...appliedSeeds, CORPORATE_EVENTS_2026_SEED];
  return true;
}

async function initializeApp() {
  database = await openDatabase();
  const cloud = await loadCloudState();
  const cloudState = cloud.state;
  const hasInitialized = await readMetadata('initialized');
  const savedStockPrice = cloudState ? cloudState.stockPrice : await readMetadata(STOCK_PRICE_KEY);
  const savedGrantGrossOverrides = cloudState ? cloudState.grantGrossOverrides : await readMetadata(GRANT_GROSS_OVERRIDES_KEY);
  const savedVestActuals = cloudState ? cloudState.vestActuals : await readMetadata(VEST_ACTUALS_KEY);
  const savedTransactions = cloudState ? cloudState.shareTransactions : await readMetadata(TRANSACTIONS_KEY);
  const savedSeeds = cloudState ? cloudState.appliedSeeds : await readMetadata(APPLIED_SEEDS_KEY);
  const legacyNetOverrides = cloudState ? cloudState.netUnitOverrides : await readMetadata('netUnitOverrides');
  const savedTaxableIncomeInput = await readMetadata(TAXABLE_INCOME_INPUT_KEY);
  const savedTaxableIncomeEntries = cloudState ? cloudState.taxableIncomeEntries : await readMetadata(TAXABLE_INCOME_ENTRIES_KEY);
  const savedIncomeBaselines = cloudState ? cloudState.incomeBaselines : await readMetadata(INCOME_BASELINES_KEY);
  const savedRetirementInput = await readMetadata(RETIREMENT_INPUT_KEY);
  const savedRetirementEntries = cloudState ? cloudState.retirementContributionEntries : await readMetadata(RETIREMENT_ENTRIES_KEY);
  const savedRetirementBaselines = cloudState ? cloudState.retirementBaselines : await readMetadata(RETIREMENT_BASELINES_KEY);
  const codeAppStateData = await readAppStateCodeJson();
  const codeRetirementData = await readRetirementCodeJson();

  stockPrice = Number(savedStockPrice ?? codeAppStateData?.stockPrice) || 0;
  grantGrossOverrides = {
    ...(codeAppStateData?.grantGrossOverrides || {}),
    ...(savedGrantGrossOverrides || {}),
  };
  vestActuals = {
    ...migrateNetUnitOverrides(codeAppStateData?.netUnitOverrides),
    ...migrateNetUnitOverrides(legacyNetOverrides),
    ...(codeAppStateData?.vestActuals || {}),
    ...(savedVestActuals || {}),
  };

  taxableIncomeDraftInput = savedTaxableIncomeInput || '';
  taxableIncomeInputField.value = taxableIncomeDraftInput;
  incomeBaselines = {
    J1: '',
    J2: '',
    ...(codeAppStateData?.incomeBaselines || {}),
    ...(savedIncomeBaselines || {}),
  };
  incomeBaselineJ1Input.value = incomeBaselines.J1 || '';
  incomeBaselineJ2Input.value = incomeBaselines.J2 || '';

  const codeTaxableIncomeEntries = sanitizeSavedIncomeEntries(codeAppStateData?.taxableIncomeEntries || []);
  const draftTaxableIncomeEntries = parseTaxableIncomeEntries(taxableIncomeDraftInput).entries;
  const browserTaxableIncomeEntries = sanitizeSavedIncomeEntries(
    savedTaxableIncomeEntries === undefined ? draftTaxableIncomeEntries : savedTaxableIncomeEntries,
  );
  const { newEntries: browserOnlyTaxableIncomeEntries } = splitNewAndDuplicateEntries(
    codeTaxableIncomeEntries,
    browserTaxableIncomeEntries,
  );
  taxableIncomeEntries = [...codeTaxableIncomeEntries, ...browserOnlyTaxableIncomeEntries];

  retirementDraftInput = savedRetirementInput || '';
  retirementInputField.value = retirementDraftInput;
  const codeRetirementBaselines = codeAppStateData?.retirementBaselines || codeRetirementData?.retirementBaselines || {};
  const codeRetirementEntries = sanitizeSavedRetirementEntries(
    codeAppStateData?.retirementContributionEntries || codeRetirementData?.retirementContributionEntries || [],
  );
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

  const repoGrants = sanitizeSavedGrants(codeAppStateData?.grants || []);
  const browserGrants = sanitizeSavedGrants(cloudState ? cloudState.grants || [] : await readGrants());
  grants = browserGrants.length > 0 ? browserGrants : repoGrants;

  if (!hasInitialized && grants.length === 0) {
    grants = DEFAULT_GRANTS;
    await saveGrantsNow();
  } else if (browserGrants.length === 0 && grants.length > 0) {
    await saveGrantsNow();
  }
  if (!hasInitialized) await writeMetadata('initialized', true);

  const sourceLabel = cloudState
    ? 'your Cloudflare account'
    : browserGrants.length > 0
      ? 'this device'
      : repoGrants.length > 0
        ? 'data/app-state.json'
        : 'starter defaults';
  databaseStatus.textContent = `Loaded ${grants.length} grant${grants.length === 1 ? '' : 's'} from ${sourceLabel}.`;
  addGrantButton.disabled = false;

  shareTransactions = sanitizeSavedTransactions(savedTransactions || codeAppStateData?.shareTransactions || []);
  appliedSeeds = Array.isArray(savedSeeds) ? savedSeeds : (codeAppStateData?.appliedSeeds || []);
  const seeded = applyCorporateEvents2026Seed();
  if (seeded) {
    await saveGrantsNow();
    await writeMetadata(TRANSACTIONS_KEY, shareTransactions).catch(() => {});
    await writeMetadata(VEST_ACTUALS_KEY, vestActuals).catch(() => {});
    await writeMetadata(APPLIED_SEEDS_KEY, appliedSeeds).catch(() => {});
  }

  updateTransactionPriceLabel();
  renderGrantInputs();
  renderSchedule();
  renderLedger();
  renderTaxableIncome();
  renderRetirementContributions();

  if (cloud.available) {
    cloudSyncReady = true;
    if (cloudState && !seeded) {
      cloudStatus.textContent = `Synced with your Cloudflare account${cloud.email ? ` as ${cloud.email}` : ''}.`;
    } else {
      cloudStatus.textContent = seeded
        ? 'Added the 2026 corporate events and syncing\u2026'
        : 'Uploading this device\u2019s data to your Cloudflare account\u2026';
      queueCloudSave(getAppStateData());
    }
  }
}

function updateStockPrice(value) {
  stockPrice = Math.max(Number(value) || 0, 0);
  renderSchedule();
  saveStockPrice();
}

addGrantButton.disabled = true;
addGrantButton.addEventListener('click', addGrant);
copyAppStateJsonButton.addEventListener('click', () => {
  copyAppStateJson().catch(() => {
    databaseStatus.textContent = 'Could not copy automatically. Use Download backup instead.';
  });
});
downloadAppStateJsonButton.addEventListener('click', downloadAppStateJson);
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
tabButtons.forEach((button, index) => {
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextButton = tabButtons[(index + offset + tabButtons.length) % tabButtons.length];
    nextButton.focus();
    switchTab(nextButton.dataset.tabTarget);
  });
});
scheduleGrid.addEventListener('change', (event) => {
  if (event.target.dataset.action === 'correct-grant-gross') {
    updateGrantGrossOverride(event.target.dataset.grantId, event.target.dataset.vestNumber, event.target.value);
  }
  if (event.target.dataset.action === 'vest-net-units') {
    updateVestActual(event.target.dataset.dateKey, 'netUnits', event.target.value);
  }
  if (event.target.dataset.action === 'vest-price') {
    updateVestActual(event.target.dataset.dateKey, 'price', event.target.value);
  }
  if (event.target.dataset.action === 'vest-settlement') {
    updateVestActual(event.target.dataset.dateKey, 'settlementDate', event.target.value);
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
document.querySelector('#retirement-panel').addEventListener('change', (event) => {
  if (event.target.dataset.action === 'update-retirement-scheduled-contribution') {
    updateScheduledRetirementContribution(event.target.dataset.dateKey, event.target.dataset.job, event.target.value);
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
onCloudStatus(({ message }) => {
  cloudStatus.textContent = message;
});

transactionForm.addEventListener('submit', addShareTransaction);
transactionTypeInput.addEventListener('change', updateTransactionPriceLabel);
document.querySelector('#ledger-panel').addEventListener('click', (event) => {
  if (event.target.dataset.action === 'remove-transaction') {
    removeShareTransaction(event.target.dataset.transactionId);
  }
});

window.addEventListener('pagehide', () => {
  flushCloudSave();
});

initializeApp().catch(() => {
  databaseStatus.textContent = 'Could not load your data. Refresh and try again.';
  grants = DEFAULT_GRANTS;
  renderGrantInputs();
  renderSchedule();
  renderTaxableIncome();
  renderRetirementContributions();
});

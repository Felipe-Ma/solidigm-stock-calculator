const DATABASE_NAME = 'solidigm-stock-calculator';
const DATABASE_VERSION = 2;
const GRANT_STORE = 'grants';
const METADATA_STORE = 'metadata';
const QUARTERS_IN_LTI_PLAN = 16;
const STOCK_PRICE_KEY = 'stockPrice';
const PAYOUT_CORRECTIONS_KEY = 'payoutCorrections';
const TAX_WITHHOLDING_RATE = 0.415;

const DEFAULT_GRANTS = [
  { id: crypto.randomUUID(), label: 'Grant A', shares: '1200', firstVestDate: '2025-01-30' },
  { id: crypto.randomUUID(), label: 'Grant B', shares: '800', firstVestDate: '2025-04-30' },
];

let grants = [];
let database;
let saveTimer;
let stockPrice = 0;
let payoutCorrections = {};

const databaseStatus = document.querySelector('#database-status');
const grantList = document.querySelector('#grant-list');
const scheduleGrid = document.querySelector('#schedule-grid');
const grandTotal = document.querySelector('#grand-total');
const totalValue = document.querySelector('#total-value');
const nextVestValue = document.querySelector('#next-vest-value');
const stockPriceInput = document.querySelector('#stock-price');
const grantTemplate = document.querySelector('#grant-template');
const addGrantButton = document.querySelector('#add-grant');

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

function savePayoutCorrections() {
  if (!database) return;
  writeMetadata(PAYOUT_CORRECTIONS_KEY, payoutCorrections).catch(() => {
    databaseStatus.textContent = 'Could not save payout correction locally.';
  });
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
        label: grant.label || 'Untitled grant',
        amount: sharesPerQuarter,
        vestNumber,
      });
    });
  });

  return Array.from(rowsByDate.values()).sort((a, b) => a.date - b.date);
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
  const schedule = getSchedule();
  const totalGrossShares = schedule.reduce((sum, row) => sum + row.total, 0);
  const totalNetShares = schedule.reduce((sum, row) => {
    const correction = parseShareAmount(payoutCorrections[toDateKey(row.date)]);
    return sum + getAfterTaxValue(row.total) + correction;
  }, 0);
  const nextRow = schedule.find((row) => row.date >= startOfToday()) || schedule[0];
  const nextRowCorrection = nextRow ? parseShareAmount(payoutCorrections[toDateKey(nextRow.date)]) : 0;
  const nextNetShares = nextRow ? getAfterTaxValue(nextRow.total) + nextRowCorrection : 0;

  grandTotal.textContent = formatShares(totalGrossShares);
  totalValue.textContent = formatCurrency(totalNetShares * stockPrice);
  nextVestValue.textContent = formatCurrency(nextNetShares * stockPrice);
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
    const correction = parseShareAmount(payoutCorrections[dateKey]);
    const grossShares = row.total;
    const expectedNetShares = getAfterTaxValue(grossShares);
    const correctedNetShares = expectedNetShares + correction;
    const taxWithheldShares = grossShares * TAX_WITHHOLDING_RATE;
    const grossValue = grossShares * stockPrice;
    const withheldValue = taxWithheldShares * stockPrice;
    const netValue = correctedNetShares * stockPrice;

    runningGrossShares += grossShares;
    runningNetShares += correctedNetShares;

    return `
      <article class="payout-card">
        <div class="payout-card-header">
          <div>
            <strong class="payout-period">Period ${index + 1}</strong>
            <time datetime="${dateKey}">${formatDate(row.date)}</time>
          </div>
          <div class="combined-payout">
            <span>${formatShares(correctedNetShares)} net units</span>
            <small>${formatShares(grossShares)} gross units from ${row.grants.length} grant${row.grants.length === 1 ? '' : 's'}</small>
          </div>
        </div>

        <div class="payout-summary-grid" aria-label="Payout period totals">
          <div class="payout-summary-item">
            <span>Gross units</span>
            <strong>${formatShares(grossShares)}</strong>
          </div>
          <div class="payout-summary-item withholding-item">
            <span>41.5% tax withheld</span>
            <strong>−${formatShares(taxWithheldShares)}</strong>
          </div>
          <div class="payout-summary-item net-item">
            <span>Post-tax units</span>
            <strong>${formatShares(expectedNetShares)}</strong>
          </div>
          <label class="payout-summary-item correction-item">
            <span>Post-tax correction</span>
            <input
              data-action="correct-payout"
              data-date-key="${dateKey}"
              type="number"
              step="0.01"
              placeholder="0"
              value="${correction || ''}"
            />
          </label>
          <div class="payout-summary-item net-item">
            <span>Corrected net units</span>
            <strong>${formatShares(correctedNetShares)}</strong>
          </div>
          <div class="payout-summary-item">
            <span>Gross value</span>
            <strong>${formatCurrency(grossValue)}</strong>
          </div>
          <div class="payout-summary-item withholding-item">
            <span>Tax value withheld</span>
            <strong>−${formatCurrency(withheldValue)}</strong>
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
          <summary>View grant sources</summary>
          <div class="grant-breakdown">
            ${row.grants.map((grant) => `
              <div class="grant-vest-line">
                <span class="grant-name">${escapeHtml(grant.label)}</span>
                <span>Vest ${grant.vestNumber}/${QUARTERS_IN_LTI_PLAN}</span>
                <span>${formatShares(grant.amount)} gross units</span>
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

function updatePayoutCorrection(dateKey, value) {
  payoutCorrections = { ...payoutCorrections };
  if (value === '') {
    delete payoutCorrections[dateKey];
  } else {
    payoutCorrections[dateKey] = value;
  }

  renderSchedule();
  savePayoutCorrections();
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
  const savedPayoutCorrections = await readMetadata(PAYOUT_CORRECTIONS_KEY);
  stockPrice = Number(savedStockPrice) || 0;
  payoutCorrections = savedPayoutCorrections || {};
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
}

function updateStockPrice(value) {
  stockPrice = Number(value) || 0;
  renderSchedule();
  saveStockPrice();
}

addGrantButton.disabled = true;
addGrantButton.addEventListener('click', addGrant);
stockPriceInput.addEventListener('input', (event) => updateStockPrice(event.target.value));
scheduleGrid.addEventListener('change', (event) => {
  if (event.target.dataset.action !== 'correct-payout') return;
  updatePayoutCorrection(event.target.dataset.dateKey, event.target.value);
});
initializeApp().catch(() => {
  databaseStatus.textContent = 'Could not open the local database. Refresh and try again.';
  renderGrantInputs();
  renderSchedule();
});

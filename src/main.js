const DATABASE_NAME = 'solidigm-stock-calculator';
const DATABASE_VERSION = 2;
const GRANT_STORE = 'grants';
const METADATA_STORE = 'metadata';
const QUARTERS_IN_LTI_PLAN = 16;
const STOCK_PRICE_KEY = 'stockPrice';
const GRANT_GROSS_OVERRIDES_KEY = 'grantGrossOverrides';
const NET_UNIT_OVERRIDES_KEY = 'netUnitOverrides';
const TAX_WITHHOLDING_RATE = 0.415;

const DEFAULT_GRANTS = [
  { id: crypto.randomUUID(), label: 'Grant A', shares: '1200', firstVestDate: '2025-01-30' },
  { id: crypto.randomUUID(), label: 'Grant B', shares: '800', firstVestDate: '2025-04-30' },
];

let grants = [];
let database;
let saveTimer;
let stockPrice = 0;
let grantGrossOverrides = {};
let netUnitOverrides = {};

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
  stockPrice = Number(savedStockPrice) || 0;
  grantGrossOverrides = savedGrantGrossOverrides || {};
  netUnitOverrides = savedNetUnitOverrides || {};
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
resetCorrectionsButton.addEventListener('click', resetManualCorrections);
stockPriceInput.addEventListener('input', (event) => updateStockPrice(event.target.value));
scheduleGrid.addEventListener('change', (event) => {
  if (event.target.dataset.action === 'correct-grant-gross') {
    updateGrantGrossOverride(event.target.dataset.grantId, event.target.dataset.vestNumber, event.target.value);
  }
  if (event.target.dataset.action === 'correct-net-payout') {
    updateNetUnitOverride(event.target.dataset.dateKey, event.target.value);
  }
});
initializeApp().catch(() => {
  databaseStatus.textContent = 'Could not open the local database. Refresh and try again.';
  renderGrantInputs();
  renderSchedule();
});

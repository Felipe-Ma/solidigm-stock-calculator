const DEFAULT_DATES = `1/30/25
4/30/25
7/30/25
10/30/25`;

let grants = [
  { id: crypto.randomUUID(), label: 'Grant A', shares: '1200', startDate: '2025-01-30', endDate: '2025-10-30' },
  { id: crypto.randomUUID(), label: 'Grant B', shares: '800', startDate: '2025-04-30', endDate: '2025-10-30' },
];

const quarterDatesInput = document.querySelector('#quarter-dates');
const validDateCount = document.querySelector('#valid-date-count');
const grantList = document.querySelector('#grant-list');
const scheduleGrid = document.querySelector('#schedule-grid');
const grandTotal = document.querySelector('#grand-total');
const grantTemplate = document.querySelector('#grant-template');
const addGrantButton = document.querySelector('#add-grant');

quarterDatesInput.value = DEFAULT_DATES;

function parseFlexibleDate(value) {
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

function getQuarterDates() {
  const uniqueDates = new Map();
  quarterDatesInput.value
    .split(/\n|,|;/)
    .map(parseFlexibleDate)
    .filter(Boolean)
    .sort((a, b) => a - b)
    .forEach((date) => uniqueDates.set(toDateKey(date), date));
  return Array.from(uniqueDates.values());
}

function getSchedule(quarterDates) {
  const rows = quarterDates.map((date) => ({ date, total: 0, grants: [] }));

  grants.forEach((grant) => {
    const shares = Number(grant.shares);
    const start = parseFlexibleDate(grant.startDate);
    const end = parseFlexibleDate(grant.endDate);

    if (!shares || shares <= 0 || !start || !end) return;

    const eligibleRows = rows.filter((row) => row.date >= start && row.date <= end);
    if (eligibleRows.length === 0) return;

    const sharesPerQuarter = shares / eligibleRows.length;
    eligibleRows.forEach((row) => {
      row.total += sharesPerQuarter;
      row.grants.push({ label: grant.label || 'Untitled grant', amount: sharesPerQuarter });
    });
  });

  return rows;
}

function renderGrantInputs() {
  grantList.replaceChildren();

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
  const quarterDates = getQuarterDates();
  const schedule = getSchedule(quarterDates);
  const totalShares = schedule.reduce((sum, row) => sum + row.total, 0);

  validDateCount.textContent = `${quarterDates.length} valid quarter dates found.`;
  grandTotal.textContent = formatShares(totalShares);
  scheduleGrid.replaceChildren();

  schedule.forEach((row) => {
    const card = document.createElement('article');
    card.className = 'schedule-card';

    const grantRows = row.grants.length
      ? `<ul>${row.grants.map((grant) => `<li><span>${escapeHtml(grant.label)}</span><b>${formatShares(grant.amount)}</b></li>`).join('')}</ul>`
      : '<p class="empty-row">No grants vest on this date yet.</p>';

    card.innerHTML = `
      <div class="date-pill">${formatDate(row.date)}</div>
      <strong>${formatShares(row.total)} shares</strong>
      ${grantRows}
    `;
    scheduleGrid.append(card);
  });
}

function updateGrant(id, field, value) {
  grants = grants.map((grant) => (grant.id === id ? { ...grant, [field]: value } : grant));
  renderSchedule();
}

function addGrant() {
  grants = [
    ...grants,
    { id: crypto.randomUUID(), label: `Grant ${String.fromCharCode(65 + grants.length)}`, shares: '', startDate: '', endDate: '' },
  ];
  renderGrantInputs();
  renderSchedule();
}

function removeGrant(id) {
  grants = grants.filter((grant) => grant.id !== id);
  renderGrantInputs();
  renderSchedule();
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

quarterDatesInput.addEventListener('input', renderSchedule);
addGrantButton.addEventListener('click', addGrant);

renderGrantInputs();
renderSchedule();

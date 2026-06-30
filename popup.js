let detectedRows = [];
const STEP = 0.125;
const TOTAL_UNITS = 8; // 1.0 / 0.125

// Priority weights — High gets 3x more units than Low
const PRIO_WEIGHT = { high: 3, medium: 2, low: 1 };

function snapToStep(val) {
  return Math.round(val / STEP) * STEP;
}
function roundTo3(val) {
  return Math.round(val * 1000) / 1000;
}

// ── Distribute totalUnits across n rows as 0.125 multiples ─
function distributeUnits(totalUnits, n) {
  if (n <= 0 || totalUnits <= 0) return Array(n).fill(0);
  const base  = Math.floor(totalUnits / n);
  const extra = totalUnits % n;
  return Array.from({ length: n }, (_, i) =>
    roundTo3((i < extra ? base + 1 : base) * STEP)
  );
}

// ── Priority-weighted distribution of 8 units ─────────────
// High=3 weight, Medium=2, Low=1
// Allocates proportionally then corrects rounding to hit exactly 8 units
function priorityDistribution(priorities) {
  const n           = priorities.length;
  const weights     = priorities.map(p => PRIO_WEIGHT[p] || 2);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // Allocate units proportionally, minimum 1 unit per row
  let units = weights.map(w =>
    Math.max(1, Math.round((w / totalWeight) * TOTAL_UNITS))
  );

  // Fix sum to exactly TOTAL_UNITS
  let diff = TOTAL_UNITS - units.reduce((a, b) => a + b, 0);

  // Sort indices by weight descending to add/remove from highest first
  const sortedIdx = [...Array(n).keys()].sort((a, b) => weights[b] - weights[a]);
  let i = 0;
  while (diff !== 0) {
    const idx = sortedIdx[i % sortedIdx.length];
    if (diff > 0) { units[idx]++; diff--; }
    else if (units[idx] > 1) { units[idx]--; diff++; }
    i++;
    if (i > 1000) break; // safety
  }

  return units.map(u => roundTo3(u * STEP));
}

// ── INIT ──────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tabId = tabs[0].id;
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'getRows' }, (response) => {
        const container = document.getElementById('rows-container');
        if (!response || !response.rows || response.rows.length === 0) {
          container.textContent = 'No rows detected. Are you on the timesheet page?';
          return;
        }
        detectedRows = response.rows;
        container.innerHTML = '';
        detectedRows.forEach((row, i) => {
          buildRowEntry(container, row.name, i, row.isBlocked);
        });
        applyDistribution();
      });
    }, 200);
  });
});

// ── GET FILLABLE INDICES ───────────────────────────────────
function getFillableIndices() {
  return detectedRows
    .map((_, i) => i)
    .filter(i => {
      const inp = document.getElementById(`val-${i}`);
      return inp && inp.dataset.skipped !== 'true';
    });
}

// ── APPLY DISTRIBUTION based on priorities + locked state ─
function applyDistribution() {
  const fillableIndices = getFillableIndices();
  const n = fillableIndices.length;

  if (n === 0) return;

  if (n > TOTAL_UNITS) {
    document.getElementById('warning').textContent =
      `${n} rows — max ${TOTAL_UNITS} fillable rows. Please skip some rows.`;
    document.getElementById('fillBtn').disabled = true;
    return;
  }

  const priorities = fillableIndices.map(i => {
    const pw = document.getElementById(`prio-${i}`);
    return pw ? (pw.dataset.prio || 'medium') : 'medium';
  });

  const allSame = priorities.every(p => p === priorities[0]);
  const vals    = allSame
    ? distributeUnits(TOTAL_UNITS, n)
    : priorityDistribution(priorities);

  fillableIndices.forEach((globalIdx, fi) => {
    const inp = document.getElementById(`val-${globalIdx}`);
    if (!inp) return;
    inp.value          = vals[fi].toFixed(3);
    inp.dataset.locked = 'false';
  });

  recalculate();
}

// ── BUILD ROW ─────────────────────────────────────────────
function buildRowEntry(container, name, i, autoSkip) {
  const div = document.createElement('div');
  div.className = 'row-entry' + (autoSkip ? ' skipped' : '');
  div.id = `entry-${i}`;

  // Label
  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = name;
  if (autoSkip) {
    const badge = document.createElement('span');
    badge.className = 'blocked-badge';
    badge.textContent = 'AUTO-SKIP';
    label.appendChild(badge);
  }

  // Value input
  const input = document.createElement('input');
  input.className       = 'val-input';
  input.type            = 'number';
  input.step            = '0.125';
  input.min             = '0';
  input.max             = '1';
  input.id              = `val-${i}`;
  input.placeholder     = autoSkip ? '–' : '0.000';
  input.disabled        = autoSkip;
  input.dataset.skipped = String(autoSkip);
  input.dataset.locked  = 'false';

  input.addEventListener('change', () => {
    const raw = parseFloat(input.value);
    if (!isNaN(raw)) {
      input.value = snapToStep(Math.max(0, Math.min(1, raw))).toFixed(3);
    }
    input.dataset.locked = 'true';
    recalculate();
  });

  input.addEventListener('input', () => {
    input.dataset.locked = 'true';
    recalculate();
  });

  // Skip button
  const skipBtn = document.createElement('button');
  skipBtn.className   = 'btn' + (autoSkip ? ' skip-active' : '');
  skipBtn.textContent = autoSkip ? 'SKIP' : 'Skip';
  skipBtn.disabled    = autoSkip;
  skipBtn.addEventListener('click', () => toggleSkip(i));

  // Priority buttons
  const prioWrap = document.createElement('div');
  prioWrap.className    = 'prio-wrap';
  prioWrap.id           = `prio-${i}`;
  prioWrap.dataset.prio = 'medium';

  if (!autoSkip) {
    ['high', 'medium', 'low'].forEach((p, pi) => {
      const pb = document.createElement('button');
      pb.className   = `prio-btn${p === 'medium' ? ' p-medium' : ''}`;
      pb.textContent = p[0].toUpperCase();
      pb.title       = `${p.charAt(0).toUpperCase() + p.slice(1)} priority — ${
        p === 'high' ? 'gets more value' :
        p === 'low'  ? 'gets less value' : 'balanced value'
      }`;
      pb.addEventListener('click', () => {
        // Update active prio button styling
        prioWrap.querySelectorAll('.prio-btn').forEach(b => {
          b.className = 'prio-btn';
        });
        pb.className      = `prio-btn p-${p}`;
        prioWrap.dataset.prio = p;

        // Unlock this row — let priority re-distribute
        input.dataset.locked = 'false';

        // Re-apply full distribution based on new priorities
        applyDistribution();
      });
      prioWrap.appendChild(pb);
    });
  }

  div.appendChild(label);
  div.appendChild(input);
  div.appendChild(skipBtn);
  div.appendChild(prioWrap);
  container.appendChild(div);
}

// ── TOGGLE SKIP ───────────────────────────────────────────
function toggleSkip(i) {
  const input     = document.getElementById(`val-${i}`);
  const entry     = document.getElementById(`entry-${i}`);
  const isSkipped = input.dataset.skipped === 'true';

  input.dataset.skipped = String(!isSkipped);
  input.disabled        = !isSkipped;
  entry.classList.toggle('skipped', !isSkipped);

  entry.querySelectorAll('.btn').forEach(b => {
    b.classList.toggle('skip-active', !isSkipped);
    b.textContent = !isSkipped ? 'SKIP' : 'Skip';
  });

  if (!isSkipped) {
    input.value          = '';
    input.dataset.locked = 'false';
  }

  applyDistribution();
}

// ── RECALCULATE — locked rows fixed, unlocked auto-adjust ─
function recalculate() {
  const balanceBar = document.getElementById('balance-bar');
  const balanceVal = document.getElementById('balance-val');
  const warning    = document.getElementById('warning');
  const fillBtn    = document.getElementById('fillBtn');

  let lockedSum         = 0;
  const unlockedIndices = [];

  detectedRows.forEach((_, i) => {
    const inp = document.getElementById(`val-${i}`);
    if (!inp || inp.dataset.skipped === 'true') return;
    if (inp.dataset.locked === 'true') {
      const v = parseFloat(inp.value);
      lockedSum += isNaN(v) ? 0 : snapToStep(Math.max(0, Math.min(1, v)));
    } else {
      unlockedIndices.push(i);
    }
  });

  const remaining      = roundTo3(1 - lockedSum);
  const remainingUnits = Math.round(remaining / STEP);
  const n              = unlockedIndices.length;

  if (n > 0) {
    if (remainingUnits > 0) {
      // Get priorities of unlocked rows
      const priorities = unlockedIndices.map(i => {
        const pw = document.getElementById(`prio-${i}`);
        return pw ? (pw.dataset.prio || 'medium') : 'medium';
      });
      const allSame = priorities.every(p => p === priorities[0]);
      let vals;
      if (allSame) {
        vals = distributeUnits(remainingUnits, n);
      } else {
        // Scale priority distribution to remainingUnits
        const totalWeight = priorities.reduce((s, p) => s + PRIO_WEIGHT[p], 0);
        let units = priorities.map(p =>
          Math.max(1, Math.round((PRIO_WEIGHT[p] / totalWeight) * remainingUnits))
        );
        let diff = remainingUnits - units.reduce((a, b) => a + b, 0);
        const sortedIdx = [...Array(n).keys()]
          .sort((a, b) => PRIO_WEIGHT[priorities[b]] - PRIO_WEIGHT[priorities[a]]);
        let idx = 0;
        while (diff !== 0 && idx < 1000) {
          const si = sortedIdx[idx % sortedIdx.length];
          if (diff > 0) { units[si]++; diff--; }
          else if (units[si] > 1) { units[si]--; diff++; }
          idx++;
        }
        vals = units.map(u => roundTo3(u * STEP));
      }
      unlockedIndices.forEach((i, fi) => {
        const inp = document.getElementById(`val-${i}`);
        inp.value = ((vals[fi] || 0)).toFixed(3);
      });
    } else {
      unlockedIndices.forEach(i => {
        document.getElementById(`val-${i}`).value = '0.000';
      });
    }
  }

  // Final total
  let total = 0;
  detectedRows.forEach((_, i) => {
    const inp = document.getElementById(`val-${i}`);
    if (!inp || inp.dataset.skipped === 'true') return;
    const v = parseFloat(inp.value);
    if (!isNaN(v)) total += snapToStep(v);
  });
  total = roundTo3(total);
  const diff = roundTo3(1 - total);
  const ok   = Math.abs(diff) < 0.001;

  balanceVal.textContent = ok
    ? '0.000 ✓'
    : diff > 0
      ? `${diff.toFixed(3)} under`
      : `${Math.abs(diff).toFixed(3)} OVER`;

  if (diff < -0.001) {
    balanceBar.className = 'over';
    warning.textContent  = 'Total exceeds 1.0 — reduce a value.';
    fillBtn.disabled     = true;
  } else if (ok) {
    balanceBar.className = 'ok';
    warning.textContent  = '';
    fillBtn.disabled     = false;
  } else {
    balanceBar.className = 'under';
    warning.textContent  = n === 0
      ? `${diff.toFixed(3)} unallocated — unskip a row.`
      : '';
    fillBtn.disabled = !ok;
  }
}

// ── CLEAR ALL ─────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', () => {
  const status = document.getElementById('status');
  status.textContent = 'Clearing...';

  const clearConfigs = detectedRows.map(row => ({
    rowId: row.rowId, name: row.name, value: 0, skip: row.isBlocked
  }));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => { window.__timesheetFillerLoaded = false; }
    }, () => {
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'fill', rowConfigs: clearConfigs }, (res) => {
            status.textContent = res?.success
              ? 'Cleared! All cells reset to 0.'
              : 'Error: ' + (res?.error || 'unknown');
          });
        }, 150);
      });
    });
  });
});

// ── FILL ──────────────────────────────────────────────────
document.getElementById('fillBtn').addEventListener('click', () => {
  const status  = document.getElementById('status');
  const warning = document.getElementById('warning');
  status.textContent  = 'Filling...';
  warning.textContent = '';

  const rowConfigs = detectedRows.map((row, i) => {
    const input   = document.getElementById(`val-${i}`);
    const skipped = input.dataset.skipped === 'true';
    const raw     = parseFloat(input.value);
    const value   = skipped ? null : snapToStep(Math.max(0, Math.min(1, raw)));
    return { rowId: row.rowId, name: row.name, value, skip: skipped || isNaN(raw) };
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => { window.__timesheetFillerLoaded = false; }
    }, () => {
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'fill', rowConfigs }, (response) => {
            if (response?.success) {
              status.textContent =
                `Done! ${response.filled} cells filled across ${response.rows} rows. Column totals = 1.0`;
            } else {
              status.textContent = 'Error: ' + (response?.error || 'unknown');
            }
          });
        }, 150);
      });
    });
  });
});

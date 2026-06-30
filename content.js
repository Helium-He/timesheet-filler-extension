if (!window.__timesheetFillerLoaded) {
  window.__timesheetFillerLoaded = true;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getRows') {
      try { sendResponse({ rows: detectRows() }); }
      catch (e) { sendResponse({ rows: [], error: e.message }); }
      return true;
    }
    if (msg.action === 'fill') {
      try { sendResponse({ success: true, ...fillTimesheet(msg.rowConfigs) }); }
      catch (e) { sendResponse({ success: false, error: e.message }); }
      return true;
    }
  });
}

function detectRows() {
  const rows = [];
  document.querySelectorAll('td.timesheet_name').forEach(td => {
    const name   = (td.getAttribute('data-original-title') || td.innerText).trim();
    const hidden = td.querySelector('input[id^="combo_already_present_"]');
    if (!hidden) return;
    const rowId     = hidden.id.replace('combo_already_present_', '');
    // A row is blocked if ALL its inputs are blocked_cell/readonly
    const allInputs = document.querySelectorAll(`input.inp_sela[id$="@${rowId}"]`);
    const isBlocked = allInputs.length > 0 &&
      Array.from(allInputs).every(inp =>
        inp.classList.contains('blocked_cell') || inp.readOnly
      );
    rows.push({ name, rowId, isBlocked });
  });
  return rows;
}

// Read bank holiday dates ONLY from rows whose name matches "bank holiday"
// Uses readonly/blocked_cell to confirm — never from fillable rows
function getBankHolidayDates() {
  const bhDates = new Set();
  document.querySelectorAll('td.timesheet_name').forEach(td => {
    const name = (td.getAttribute('data-original-title') || td.innerText).trim();
    if (!/bank.holiday/i.test(name)) return;
    const hidden = td.querySelector('input[id^="combo_already_present_"]');
    if (!hidden) return;
    const rowId = hidden.id.replace('combo_already_present_', '');
    document.querySelectorAll(`input.inp_sela[id$="@${rowId}"]`).forEach(input => {
      // Only trust blocked/readonly cells as real bank holidays
      if ((input.classList.contains('blocked_cell') || input.readOnly) &&
          parseFloat(input.value) > 0) {
        bhDates.add(input.id.split('@')[0]);
      }
    });
  });
  return bhDates;
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

function fillTimesheet(rowConfigs) {
  let totalFilled = 0, rowsFilled = 0;
  const bhDates = getBankHolidayDates();

  rowConfigs.forEach(config => {
    if (config.skip || config.value === null) return;

    const inputs = document.querySelectorAll(
      `input.inp_sela[id$="@${config.rowId}"]`
    );
    if (!inputs.length) return;

    inputs.forEach(input => {
      const dateStr = input.id.split('@')[0];
      if (isWeekend(dateStr)) return;
      if (bhDates.has(dateStr)) return;           // skip bank holiday columns
      if (input.classList.contains('blocked_cell') || input.readOnly) return;
      setNativeValue(input, parseFloat(config.value).toFixed(3));
      totalFilled++;
    });

    rowsFilled++;
  });

  return { filled: totalFilled, rows: rowsFilled };
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

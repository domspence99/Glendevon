// ── Availability calendar ──
// Renders a month-grid calendar from data/availability.json, which merges
// Vrbo's synced bookings with any manually-tracked direct bookings.
(() => {
  const root = document.getElementById('availability-calendar');
  if (!root) return;

  const monthLabel = document.getElementById('cal-month-label');
  const grid = document.getElementById('cal-grid');
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const updatedEl = document.getElementById('cal-updated');

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed

  let bookedRanges = [];

  function toDateStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function isBooked(dateStr) {
    return bookedRanges.some((r) => dateStr >= r.start && dateStr < r.end);
  }

  function render() {
    monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    grid.innerHTML = '';

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Convert JS's Sunday-first getDay() into a Monday-first offset
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      grid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(viewYear, viewMonth, day);
      const cellDate = new Date(viewYear, viewMonth, day);
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = String(day);

      if (cellDate < today) {
        cell.classList.add('past');
      } else if (isBooked(dateStr)) {
        cell.classList.add('booked');
      } else {
        cell.classList.add('available');
      }

      if (cellDate.getTime() === today.getTime()) {
        cell.classList.add('today');
      }

      grid.appendChild(cell);
    }

    prevBtn.disabled = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  }

  prevBtn.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render();
  });
  nextBtn.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  });

  fetch('data/availability.json')
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    })
    .then((data) => {
      bookedRanges = data.bookedRanges || [];
      if (data.generatedAt) {
        const updated = new Date(data.generatedAt);
        updatedEl.textContent = `Availability last updated ${updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      }
      render();
    })
    .catch((err) => {
      console.error('Could not load availability data:', err);
      grid.innerHTML = '';
      updatedEl.textContent = 'Live availability is temporarily unavailable — please use the enquiry form and we’ll confirm your dates.';
      monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    });
})();

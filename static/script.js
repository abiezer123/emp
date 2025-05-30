// Tab switching
const navItems = document.querySelectorAll('nav .nav-item');
const sections = {
  attendance: document.getElementById('attendance'),
  dashboard: document.getElementById('dashboard'),
  member: document.getElementById('member')
};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const tab = item.getAttribute('data-tab');
    for (const key in sections) {
      if (key === tab) {
        sections[key].classList.remove('hidden');
      } else {
        sections[key].classList.add('hidden');
      }
    }
  });
});

// Attendance logic
const attendanceForm = document.getElementById('attendance-form');
const attendanceTableBody = document.querySelector('#attendance-table tbody');
const nameInput = document.getElementById('name');
const dateInput = document.getElementById('date');
const filterDateInput = document.getElementById('filter-date');

// Helper function to format datetime string nicely
function formatDateTime(dtString) {
  const date = new Date(dtString);
  return date.toLocaleString();
}

// Fetch attendance records from backend for a specific date (yyyy-mm-dd)
async function fetchAttendanceRecords(date) {
  attendanceTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
  try {
    const response = await fetch(`/api/attendance?date=${date}`);
    if (!response.ok) throw new Error('Failed to fetch data');
    const data = await response.json();
    renderAttendanceTable(data.records);
  } catch (err) {
    attendanceTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#e74c3c;">Error loading records</td></tr>';
    console.error(err);
  }
}

// Render attendance records in table
function renderAttendanceTable(records) {
  if (records.length === 0) {
    attendanceTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No records found for this date.</td></tr>';
    return;
  }
  attendanceTableBody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${formatDateTime(r.date)}</td>
      <td><button class="btn-delete" data-id="${r._id}">Delete</button></td>
    `;
    attendanceTableBody.appendChild(tr);
  });
  // Attach delete handlers
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this entry?')) {
        try {
          const res = await fetch('/api/attendance/' + id, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete');
          // Refresh list after deletion
          loadRecordsForFilterDate();
        } catch (err) {
          alert('Failed to delete attendance entry.');
          console.error(err);
        }
      }
    });
  });
}

// On form submit, add attendance record
attendanceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const datetime = dateInput.value;
  if (!name || !datetime) {
    alert('Please fill in the name and date.');
    return;
  }

  try {
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, date: datetime })
    });
    if (!response.ok) throw new Error('Failed to add attendance');

    nameInput.value = '';
    // Do NOT reset date input; it keeps previous value
    filterDateInput.value = datetime.split('T')[0];
    loadRecordsForFilterDate();
    nameInput.focus();
  } catch (err) {
    alert('Error adding attendance entry.');
    console.error(err);
  }
});

// When filter date picker changes, load records
filterDateInput.addEventListener('change', () => {
  loadRecordsForFilterDate();
});

function loadRecordsForFilterDate() {
  const selectedDate = filterDateInput.value;
  if (selectedDate) {
    fetchAttendanceRecords(selectedDate);
  } else {
    attendanceTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Please select a date above to view attendance.</td></tr>';
  }
}

// Initialize filter date input to today and load records
window.addEventListener('DOMContentLoaded', () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  filterDateInput.value = todayISO;
  loadRecordsForFilterDate();
});


function renderAttendanceTable(records) {
  if (records.length === 0) {
    attendanceTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No records found for this date.</td></tr>';
    return;
  }
  attendanceTableBody.innerHTML = '';
  records.forEach((r, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>              <!-- Numbering column -->
      <td>${r.name}</td>
      <td>${formatDateTime(r.date)}</td>
      <td><button class="btn-delete" data-id="${r._id}">Delete</button></td>
    `;
    attendanceTableBody.appendChild(tr);
  });
  // Attach delete handlers (unchanged) ...
}

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
                // If switching to dashboard, load dashboard data
                if (key === 'dashboard') {
                    initializeDashboard();
                }
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
        attendanceTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No records found for this date.</td></tr>';
        return;
    }
    attendanceTableBody.innerHTML = '';
    records.forEach((r, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>          <td>${r.name}</td>
            <td>${formatDateTime(r.date)}</td>
            <td><button class="btn-delete" data-id="${r._id}">Delete</button></td>
        `;
        attendanceTableBody.appendChild(tr);
    });
    // Attach delete handlers
    attachDeleteHandlers();
}

// Attach delete handlers to delete buttons
function attachDeleteHandlers() {
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

// Suggestions logic
const suggestionsList = document.getElementById('suggestions');

// Fetch name suggestions from the backend
nameInput.addEventListener('input', async () => {
    const query = nameInput.value.trim();
    if (query.length === 0) {
        suggestionsList.innerHTML = '';
        suggestionsList.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(`/api/names?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to fetch suggestions');
        const names = await response.json();
        renderSuggestions(names);
    } catch (err) {
        console.error(err);
    }
});

// Render suggestions in the dropdown
function renderSuggestions(names) {
    suggestionsList.innerHTML = '';
    if (names.length === 0) {
        suggestionsList.classList.add('hidden');
        return;
    }

    names.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.addEventListener('click', () => {
            nameInput.value = name; // Set the input value to the selected name
            suggestionsList.innerHTML = ''; // Clear suggestions
            suggestionsList.classList.add('hidden'); // Hide suggestions
        });
        suggestionsList.appendChild(li);
    });
    suggestionsList.classList.remove('hidden'); // Show suggestions
}

// Hide suggestions when clicking outside
document.addEventListener('click', (event) => {
    if (!nameInput.contains(event.target) && !suggestionsList.contains(event.target)) {
        suggestionsList.innerHTML = '';
        suggestionsList.classList.add('hidden');
    }
});

// Mobile menu toggle
const menuToggle = document.querySelector('.menu-toggle');
menuToggle.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    const mainContent = document.querySelector('main');
    mainContent.classList.toggle('fullwidth');
});

let currentDeleteId = null; // Store the ID of the record to delete

// Attach delete handlers
function attachDeleteHandlers() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentDeleteId = btn.getAttribute('data-id'); // Store the ID
            document.getElementById('delete-confirmation').classList.remove('hidden'); // Show modal
        });
    });
}

// Confirm delete action
document.getElementById('confirm-delete').addEventListener('click', async () => {
    if (currentDeleteId) {
        try {
            const res = await fetch('/api/attendance/' + currentDeleteId, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            loadRecordsForFilterDate(); // Refresh list after deletion
            document.getElementById('delete-confirmation').classList.add('hidden'); // Hide modal
        } catch (err) {
            alert('Failed to delete attendance entry.');
            console.error(err);
        }
    }
});

// Cancel delete action
document.getElementById('cancel-delete').addEventListener('click', () => {
    document.getElementById('delete-confirmation').classList.add('hidden'); // Hide modal
});


// Dashboard logic
const timeframeSelect = document.getElementById('timeframe');
const dateSelect = document.getElementById('dateSelect');
const dateLabel = document.getElementById('dateLabel');
const rankingTableBody = document.querySelector('#rankingTable tbody');
const summaryTableBody = document.querySelector('#summaryTable tbody');

let attendanceChartInstance = null; // To hold the Chart.js instance

function updateUI() {
    const timeframe = timeframeSelect.value;
    if (timeframe === 'monthly') {
        dateSelect.type = 'month';
        dateLabel.textContent = 'Select Month:';
        // Set default to current month
        const now = new Date();
        dateSelect.value = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    } else { // yearly
        dateSelect.type = 'number'; // Using number for year input
        dateLabel.textContent = 'Select Year:';
        dateSelect.value = new Date().getFullYear();
    }
    fetchData(); // Fetch data when UI updates
}

async function fetchData() {
    const timeframe = timeframeSelect.value;
    const date = dateSelect.value;

    if (!date) {
        alert('Please select a date.');
        return;
    }

    // Fetch Top Attendees
    rankingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
    try {
        const topAttendeesResponse = await fetch(`/api/top_attendees?timeframe=${timeframe}&date=${date}`);
        if (!topAttendeesResponse.ok) throw new Error('Failed to fetch top attendees');
        const topAttendeesData = await topAttendeesResponse.json();
        renderTopAttendees(topAttendeesData);
    } catch (err) {
        rankingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#e74c3c;">Error loading top attendees</td></tr>';
        console.error(err);
    }

    // Fetch Attendance Summary
    summaryTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Loading...</td></tr>';
    try {
        const summaryResponse = await fetch(`/api/attendance_summary?timeframe=${timeframe}&date=${date}`);
        if (!summaryResponse.ok) throw new Error('Failed to fetch attendance summary');
        const summaryData = await summaryResponse.json();
        renderAttendanceSummary(summaryData);
        updateAttendanceChart(summaryData);
    } catch (err) {
        summaryTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#e74c3c;">Error loading attendance summary</td></tr>';
        console.error(err);
    }
}

function renderTopAttendees(attendees) {
    if (attendees.length === 0) {
        rankingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No top attendees found for this period.</td></tr>';
        return;
    }
    rankingTableBody.innerHTML = '';
    attendees.forEach((attendee, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${attendee.name}</td>
            <td>${attendee.count}</td>
        `;
        rankingTableBody.appendChild(tr);
    });
}

function renderAttendanceSummary(summary) {
    if (summary.length === 0) {
        summaryTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No attendance summary found for this period.</td></tr>';
        return;
    }
    summaryTableBody.innerHTML = '';
    summary.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${record.date}</td>
            <td>${record.count}</td>
        `;
        summaryTableBody.appendChild(tr);
    });
}

function updateAttendanceChart(summaryData) {
    const ctx = document.getElementById('attendanceChart').getContext('2d');

    const labels = summaryData.map(item => item.date);
    const data = summaryData.map(item => item.count);

    if (attendanceChartInstance) {
        attendanceChartInstance.destroy(); // Destroy existing chart if it exists
    }

    attendanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Attendees',
                data: data,
                borderColor: 'rgba(52, 152, 219, 1)',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: Math.max(...data) + 5 // Add some padding to the max value
                }
            }
        }
    });
}

// Initialize dashboard on load
window.addEventListener('DOMContentLoaded', () => {
    // ... (existing DOMContentLoaded logic) ...

    // Set initial values for dashboard controls and fetch data
    updateUI(); // This will set default date and call fetchData
});
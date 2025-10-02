
const timeframeSelect = document.getElementById('timeframe');
const dateSelect = document.getElementById('dateSelect');
const dateLabel = document.getElementById('dateLabel');
const rankingTableBody = document.querySelector('#rankingTable tbody');
const summaryTableBody = document.querySelector('#summaryTable tbody');
const attendanceForm = document.getElementById('attendance-form');
const attendanceTableBody = document.querySelector('#attendance-table tbody');
const nameInput = document.getElementById('name');
const dateInput = document.getElementById('date');
const filterDateInput = document.getElementById('filter-date');
const suggestionsList = document.getElementById('suggestions');


let attendanceChartInstance = null; // To hold the Chart.js instance
let currentDeleteId = null; // Store the ID of the record to delete

// Initialize filter date input to today and load records
window.addEventListener('DOMContentLoaded', () => {
    //for input date - 12:00pm at start and date today in philippines
    const now = new Date();
    const philTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const year = philTime.getFullYear();
    const month = String(philTime.getMonth() + 1).padStart(2, '0');
    const day = String(philTime.getDate()).padStart(2, '0');
    const fixedTime = "12:00";
    const datetimeLocal = `${year}-${month}-${day}T${fixedTime}`;
    document.getElementById('date').value = datetimeLocal;

    const today = now.toISOString().slice(0, 10);
    document.getElementById('filter-date').value = today;

    const downloadMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('download-month').value = downloadMonth;

    changeDateLabel();
    loadRecordsForFilterDate();
    updateUI();
    initMemberModal()
});

function updateUI() {
    const timeframe = timeframeSelect.value;
    if (timeframe === 'monthly') {
        dateSelect.type = 'month';
        dateLabel.textContent = 'Select Month:';
        const now = new Date();
        dateSelect.value = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    } else if (timeframe === 'yearly') {
        dateSelect.type = 'number';
        dateLabel.textContent = 'Select Year:';
        dateSelect.min = 2000;
        dateSelect.max = new Date().getFullYear();
        dateSelect.value = new Date().getFullYear();
    }
    fetchData();
}

dateSelect.addEventListener('change', () => {
    fetchData();
});

function formatXAxisLabel(dateString, timeframe) {
    const date = new Date(dateString);
    if (timeframe === 'yearly') {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
}


function updateAttendanceChart(summaryData) {
    const chartCanvas = document.getElementById('attendanceChart');
    if (!chartCanvas || chartCanvas.offsetParent === null) {
        console.warn('Chart container is not visible or missing.');
        return;
    }
    const ctx = chartCanvas.getContext('2d');

    if (attendanceChartInstance) {
        attendanceChartInstance.destroy();
        attendanceChartInstance = null;
    }

    if (!summaryData || summaryData.length === 0) {
        // Optionally clear the canvas or show message
        return;
    }

    chartCanvas.width = Math.max(summaryData.length * 60, 600);

    const labels = summaryData.map(item => formatXAxisLabel(item.date, timeframe));
    const data = summaryData.map(item => item.count);

    attendanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Number of Attendees',
                data,
                borderColor: 'rgba(52, 152, 219, 1)',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                fill: true,
                tension: 0.2,
                pointRadius: 3,
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.parsed.y} attendees`
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    ticks: {
                        maxRotation: 90,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 20,
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Attendance Count'
                    },
                    suggestedMax: Math.max(...data) + 5
                }
            }
        }
    });
}


// Attendance logic
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
// --- Open Member Modal ---
async function openMemberModal(name) {
    try {
        const res = await fetch(`/api/members/${encodeURIComponent(name)}`);
        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Fill modal display
        fillProfileData(data);

        // Fill edit form fields
        document.getElementById("originalName").value = data.name || "";
        document.getElementById("editName").value = data.name || "";
        document.getElementById("editBirthdate").value = data.birthdate || "";
        document.getElementById("editBaptistDate").value = data.date_baptized || "";
        document.getElementById("editBaptismPlace").value = data.place_baptism || "";
        document.getElementById("editWitnesses").value = data.witnesses || "";
        document.getElementById("editFather").value = data.father || "";
        document.getElementById("editMother").value = data.mother || "";
        document.getElementById("editContact").value = data.contact || "";
        document.getElementById("editEmail").value = data.email || "";
        document.getElementById("editFacebook").value = data.facebook || "";
        document.getElementById("editAddress").value = data.address || "";

        document.getElementById("memberModal").classList.add("show");
    } catch (err) {
        console.error(err);
        alert("Failed to load member info.");
    }
}

// --- Fill Modal Display ---
function fillProfileData(data) {
    document.getElementById('modal-member-name').textContent = data.name || "";
    document.getElementById('profileAge').textContent = data.age || "";
    document.getElementById('profileBirthdate').textContent = data.birthdate || "";
    document.getElementById('profileAddress').textContent = data.address || "";
    document.getElementById('profileBaptistDate').textContent = data.date_baptized || "";
    document.getElementById('profileBaptismPlace').textContent = data.place_baptism || "";
    document.getElementById('profileWitnesses').textContent = data.witnesses || "";
    document.getElementById('profileFather').textContent = data.father || "";
    document.getElementById('profileMother').textContent = data.mother || "";
    document.getElementById('profileContact').textContent = data.contact || "";
    document.getElementById('profileEmail').textContent = data.email || "";
    document.getElementById('profileFacebook').textContent = data.facebook || "";
    if (data.image_url) {
        document.getElementById("modal-member-image").src = data.image_url;
    }
}


function initMemberModal() {
    const editBtn = document.getElementById("editProfileBtn");
    const cancelBtn = document.getElementById("cancelEditBtn");
    const editForm = document.getElementById("editProfileForm");
    const imageInput = document.getElementById("profileImageInput");

    if (!editBtn || !cancelBtn || !editForm || !imageInput) return; // avoid errors

    // --- Edit / Cancel ---
    editBtn.addEventListener("click", () => {
        document.getElementById("profileView").style.display = "none";
        editForm.style.display = "block";
    });

    cancelBtn.addEventListener("click", () => {
        editForm.style.display = "none";
        document.getElementById("profileView").style.display = "block";
    });

    // --- Save Changes ---
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            originalName: document.getElementById("originalName").value.trim(),
            name: document.getElementById("editName").value.trim(),
            birthdate: document.getElementById("editBirthdate").value,
            date_baptized: document.getElementById("editBaptistDate").value,
            place_baptism: document.getElementById("editBaptismPlace").value,
            witnesses: document.getElementById("editWitnesses").value,
            father: document.getElementById("editFather").value,
            mother: document.getElementById("editMother").value,
            contact: document.getElementById("editContact").value,
            email: document.getElementById("editEmail").value,
            facebook: document.getElementById("editFacebook").value,
            address: document.getElementById("editAddress").value
        };

        try {
            const res = await fetch("/api/members/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (result.success && result.member) {
                alert("Profile updated successfully!");
                fillProfileData(result.member);

                // Update edit form fields
                Object.keys(result.member).forEach(key => {
                    const el = document.getElementById("edit" + key.charAt(0).toUpperCase() + key.slice(1));
                    if (el) el.value = result.member[key];
                });

                document.getElementById("originalName").value = result.member.name || "";
                editForm.style.display = "none";
                document.getElementById("profileView").style.display = "block";
            } else {
                alert("Update failed: " + (result.error || "Unknown error"));
            }
        } catch (err) {
            console.error(err);
            alert("Error saving profile.");
        }
    });

    // --- Upload Profile Picture ---
    imageInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", document.getElementById("originalName").value);

        try {
            const res = await fetch("/upload_image", { method: "POST", body: formData });
            const result = await res.json();
            if (result.url) document.getElementById("modal-member-image").src = result.url;
            else alert("Upload failed");
        } catch (err) {
            console.error(err);
            alert("Error uploading image.");
        }
    });
}

function formatPrettyDate(dateStr) {
    const date = new Date(dateStr);
    const options = { month: 'long', day: 'numeric' };
    return date.toLocaleDateString(undefined, options); // e.g., "June 1"
}

function renderAttendanceTable(records) {
    if (records.length === 0) {
        attendanceTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No records found for this date.</td></tr>';
        return;
    }

    // Sort so visitors go last
    records.sort((a, b) => {
        if (a.is_visitor && !b.is_visitor) return -1; // visitor first
        if (!a.is_visitor && b.is_visitor) return 1;
        return 0;
    });

    attendanceTableBody.innerHTML = '';
    records.forEach((r, index) => {
        const tr = document.createElement('tr');

        // Highlight if visitor
        if (r.is_visitor) {
            tr.style.backgroundColor = '#bff1bfff';
            tr.style.fontWeight = 'bold';
        }

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${r.name}${r.is_visitor ? ' (Visitor)' : ''}</td>
            <td>${formatDateTime(r.date)}</td>
            <td><button class="btn-delete" data-id="${r._id}">Delete</button></td>
        `;
        attendanceTableBody.appendChild(tr);
    });

    attachDeleteHandlers();
}

function attachDeleteHandlers() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
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

//add name in attendance record
attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const datetime = dateInput.value;
    const isVisitor = document.getElementById('visitor').checked;

    if (!name || !datetime) {
        alert('Please fill in the name and date.');
        return;
    }

    try {

        const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                date: datetime,
                is_visitor: isVisitor
            })
        });

        if (!response.ok) {
            if (response.status === 409) {
                alert(' This name already exists in attendance.');
            } else {
                alert('Error: ' + (result.error || 'Failed to add attendance'));
            }
            return;
        };

        nameInput.value = '';
        filterDateInput.value = datetime.split('T')[0];
        loadRecordsForFilterDate();
        nameInput.focus();
        document.getElementById('visitor').checked = false;

    } catch (err) {
        alert('Error adding attendance entry.');
        console.error(err);
    }
});

dateInput.addEventListener('change', () => {
    filterDateInput.value = dateInput.value.split("T")[0];
    loadRecordsForFilterDate();
    changeDateLabel()
})

// When filter date picker changes, load records
filterDateInput.addEventListener('change', () => {
    loadRecordsForFilterDate();
    dateInput.value = `${filterDateInput.value}T12:00`;
    changeDateLabel()
});

function loadRecordsForFilterDate() {
    const selectedDate = filterDateInput.value;
    if (selectedDate) {
        fetchAttendanceRecords(selectedDate);
    } else {
        attendanceTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Please select a date above to view attendance.</td></tr>';
    }
}



// Suggestions logic
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

// Dashboard logic
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
        console.log('Attendance summary data:', summaryData);
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
            <td>${formatPrettyDate(record.date)}</td>
            <td>${record.count}</td>
        `;
        summaryTableBody.appendChild(tr);
    });
}

// Format datetime string nicely
function formatDateTime(dtString) {
    const date = new Date(dtString);
    return date.toLocaleString(); // Adjust the format as needed
}

document.getElementById('download-btn').addEventListener('click', async () => {
    const monthInput = document.getElementById('download-month').value;
    if (!monthInput) {
        alert('Please select a month.');
        return;
    }

    const [year, month] = monthInput.split('-');
    const response = await fetch(`/api/download_attendance?year=${year}&month=${month}`);
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `attendance_${year}-${month}.docx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } else {
        alert('Failed to download attendance data.');
    }
});


//open edit modal
function openBulkEditModal() {
    const modal = document.getElementById("bulkEditModal");
    modal.classList.remove("hidden");
    const filterDate = document.getElementById('filter-date').value;

    if (!filterDate) {
        alert("Please select a date first.");
        return;
    }

    const defaultTime = "T12:00";

    // Set both datetime inputs in the modal to the selected date at 12:00 PM
    document.getElementById('from-date').value = filterDate;
    document.getElementById('to-date').value = filterDate + defaultTime;

}

//close edit modal
function closeBulkModal() {
    const modal = document.getElementById("bulkEditModal");
    modal.classList.add("hidden");
}

//submit edit date
function submitBulkEdit() {
    const fromDate = document.getElementById('from-date').value;
    const toDateRaw = document.getElementById('to-date').value;

    if (!fromDate || !toDateRaw) {
        alert("Please fill in both dates.");
        return;
    }

    // Send to Flask API
    fetch('/api/attendance/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from_date: fromDate,
            to_date: toDateRaw
        })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message || "Updated!");
            closeBulkModal();
            filterDateInput.value = toDateRaw.split("T")[0];
            filterDateInput.dispatchEvent(new Event('change'));


        })
        .catch(err => console.error(err));

}

function changeDateLabel() {
    const dateOnly = dateInput.value.split("T")[0];
    const dateObj = new Date(dateOnly);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };

    const headingEl = document.getElementById('dateForHeading');
    if (headingEl) {
        headingEl.textContent = dateObj.toLocaleDateString('en-US', options);
    }
}

import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import re
from flask import send_file
from io import BytesIO
from docx import Document
from docx.shared import Inches
from docx.shared import Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from calendar import monthrange
from bson.json_util import dumps
import io


load_dotenv()  # Load .env file

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your_secret_key')  # Set a secret key for session management

MONGO_URI = os.getenv('MONGO_URI')
client = MongoClient(MONGO_URI)
db = client.attendance_db
attendance_collection = db.attendance
users_collection = db.users  # Assuming you have a users collection

@app.before_serving
def init_admin():
    if users_collection.count_documents({'username': 'admin'}) == 0:
        users_collection.insert_one({'username': 'admin', 'password': 'empire123'})


@app.route('/')
def index():
    return redirect(url_for('login'))  # Redirect to login page

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username').strip()
        password = request.form.get('password')

        user = users_collection.find_one({'username': username})
        if user and user.get('password') == password:
            session['username'] = username
            return redirect(url_for('attendance'))  # Redirect to the attendance page
        else:
            error = 'Invalid username or password'
    return render_template('login.html', error=error)

@app.route('/attendance')
def attendance():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('attendance.html')

@app.route('/api/attendance', methods=['POST'])
def add_attendance():
    data = request.get_json()
    name = data.get('name', '').strip()
    date_str = data.get('date', '').strip()
    if not name or not date_str:
        return jsonify({'error': 'Name and date are required'}), 400
    try:
        date = datetime.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    record = {
        'name': name,
        'date': date
    }
    attendance_collection.insert_one(record)
    return jsonify({'message': 'Attendance added successfully'})


@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'Date query parameter is required'}), 400
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid date format, expected YYYY-MM-DD'}), 400

    start = datetime(date_obj.year, date_obj.month, date_obj.day)
    end = datetime(date_obj.year, date_obj.month, date_obj.day, 23, 59, 59, 999999)

    cursor = attendance_collection.find({'date': {'$gte': start, '$lte': end}})
    records = []
    for doc in cursor:
        records.append({
            '_id': str(doc['_id']),
            'name': doc['name'],
            'date': doc['date'].isoformat()
        })
    return jsonify({'records': records})

@app.route('/api/attendance/<record_id>', methods=['DELETE'])
def delete_attendance(record_id):
    try:
        result = attendance_collection.delete_one({'_id': ObjectId(record_id)})
        if result.deleted_count == 0:
            return jsonify({'error': 'Record not found'}), 404
        return jsonify({'message': 'Record deleted successfully'})
    except Exception:
        return jsonify({'error': 'Invalid record id'}), 400

@app.route('/api/names', methods=['GET'])
def suggest_names():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])  # Empty list if no query
    regex = re.compile(re.escape(q), re.IGNORECASE)
    names = attendance_collection.distinct('name', {'name': regex})[:10]
    return jsonify(names)

@app.route('/dashboard')
def dashboard():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html')

@app.route('/logout')
def logout():
    session.pop('username', None)
    return redirect(url_for('login'))

@app.route('/api/attendance_summary', methods=['GET'])
def get_attendance_summary():
    timeframe = request.args.get('timeframe', 'monthly')
    date_str = request.args.get('date')
    
    if not date_str:
        return jsonify({'error': 'Date query parameter is required'}), 400
    try:
        if timeframe == 'monthly':
            year, month = map(int, date_str.split('-'))
            last_day = monthrange(year, month)[1]
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month, last_day, 23, 59, 59)
        else:  # yearly
            year = int(date_str)
            start_date = datetime(year, 1, 1)
            end_date = datetime(year, 12, 31, 23, 59, 59)
    except ValueError:
        return jsonify({'error': 'Invalid date format, expected YYYY-MM or YYYY'}), 400

    pipeline = [
        { '$match': { 'date': { '$gte': start_date, '$lte': end_date } } },
        { '$group': {
            '_id': { '$dateToString': { 'format': '%Y-%m-%d', 'date': '$date' } },
            'count': { '$sum': 1 }
        }},
        { '$sort': { '_id': 1 } }
    ]

    try:
        cursor = attendance_collection.aggregate(pipeline)
        summary_data = [{ 'date': doc['_id'], 'count': doc['count'] } for doc in cursor]
        return jsonify(summary_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/download_attendance', methods=['GET'])
def download_attendance():
    year = int(request.args.get('year'))
    month = int(request.args.get('month'))

    start_date = datetime(year, month, 1)
    end_date = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)

    # Attendance Records
    records = list(attendance_collection.find({
        'date': {'$gte': start_date, '$lt': end_date}
    }))

    # Top Attendees
    top_attendees = list(attendance_collection.aggregate([
        { '$match': { 'date': {'$gte': start_date, '$lt': end_date} } },
        { '$group': { '_id': '$name', 'count': { '$sum': 1 } } },
        { '$sort': { 'count': -1 } },
        { '$limit': 10 }
    ]))

    # Attendance Summary (grouped by day)
    summary = list(attendance_collection.aggregate([
        { '$match': { 'date': {'$gte': start_date, '$lt': end_date} } },
        { '$group': {
            '_id': { '$dateToString': { 'format': "%Y-%m-%d", 'date': "$date" }},
            'count': { '$sum': 1 }
        }},
        { '$sort': { '_id': 1 }}
    ]))

    # Generate Word document
    doc = Document()
    doc.add_heading(f'Attendance Report - {start_date.strftime("%B %Y")}', 0)

    # Attendance Table
    doc.add_heading('Attendance Records', level=1)
    records_by_date = {}

    # Group records by date
    for record in records:
        date_obj = record['date']
        date_str = date_obj.strftime('%B %d, %Y')
        if date_str not in records_by_date:
            records_by_date[date_str] = []
        records_by_date[date_str].append(record)

    # Write grouped records
    for date_str in sorted(records_by_date):
        doc.add_paragraph(date_str, style='Heading 2')

        table = doc.add_table(rows=1, cols=3)
        table.style = 'Light List Accent 1'
        hdr_cells = table.rows[0].cells
        hdr_cells[0].text = '#'
        hdr_cells[1].text = 'Name'
        hdr_cells[2].text = 'Time'

        for idx, record in enumerate(records_by_date[date_str], 1):
            row = table.add_row().cells
            row[0].text = str(idx)
            row[1].text = record['name']
            row[2].text = record['date'].strftime('%I:%M %p')

        doc.add_paragraph()

    # Top Attendees
    doc.add_heading('Top Attendees', level=1)
    top_table = doc.add_table(rows=1, cols=2)
    top_table.style = 'Light List Accent 2'
    top_hdr = top_table.rows[0].cells
    top_hdr[0].text = 'Name'
    top_hdr[1].text = 'Attendance Count'
    for attendee in top_attendees:
        row = top_table.add_row().cells
        row[0].text = str(attendee['_id'])
        row[1].text = str(attendee['count'])

    # Attendance Summary
    doc.add_heading('Attendance Summary', level=1)
    summary_table = doc.add_table(rows=1, cols=2)
    summary_table.style = 'Light Grid Accent 3'
    hdr = summary_table.rows[0].cells
    hdr[0].text = 'Date'
    hdr[1].text = 'Attendance Count'
    summary_dates = []
    summary_counts = []
    for item in summary:
        row = summary_table.add_row().cells
        row[0].text = item['_id']
        row[1].text = str(item['count'])
        summary_dates.append(item['_id'])
        summary_counts.append(item['count'])

  
    # Return document
    doc_stream = io.BytesIO()
    doc.save(doc_stream)
    doc_stream.seek(0)
    filename = f'attendance_{year}-{month:02d}.docx'
    return send_file(doc_stream, as_attachment=True, download_name=filename)

@app.route('/api/top_attendees', methods=['GET'])
def get_top_attendees():
    timeframe = request.args.get('timeframe', 'monthly')  # Default to monthly
    date_str = request.args.get('date')

    if not date_str:
        return jsonify({'error': 'Date query parameter is required'}), 400

    if timeframe == 'monthly':
        try:
            year, month = map(int, date_str.split('-'))
            start_date = datetime(year, month, 1)
            # Calculate the end date for the month
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)
        except ValueError:
            return jsonify({'error': 'Invalid date format for monthly summary, expected YYYY-MM'}), 400
    else:  # yearly
        try:
            year = int(date_str)
            start_date = datetime(year, 1, 1)
            end_date = datetime(year + 1, 1, 1)
        except ValueError:
            return jsonify({'error': 'Invalid date format for yearly summary, expected YYYY'}), 400

    pipeline = [
        {
            '$match': {
                'date': {'$gte': start_date, '$lt': end_date}
            }
        },
        {
            '$group': {
                '_id': '$name',
                'count': {'$sum': 1}
            }
        },
        {
            '$sort': {'count': -1}  # Sort by count descending
        }
    ]

    cursor = attendance_collection.aggregate(pipeline)
    top_attendees = []
    for doc in cursor:
        top_attendees.append({
            'name': doc['_id'],
            'count': doc['count']
        })

    return jsonify(top_attendees)





@app.route('/members')
def members():
    if 'username' not in session:
        return redirect(url_for('login'))
    
    names = attendance_collection.distinct('name')
    return render_template('members.html', names=names)

@app.route('/api/member_attendance/<name>', methods=['GET'])
def get_member_attendance(name):
    name = name.strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    # Get all unique attendance dates from the database
    all_dates_cursor = attendance_collection.find({}, {'date': 1})
    all_dates = set()
    for record in all_dates_cursor:
        all_dates.add(record['date'].date())  # Extract only the date part

    # Get all dates where the member is present
    present_dates_cursor = attendance_collection.find({'name': name}, {'date': 1})
    present_dates = set()
    for record in present_dates_cursor:
        present_dates.add(record['date'].date())

    # Prepare the response: every date in the database, marked present or not
    response = []
    for date in sorted(all_dates):
        response.append({
            'date': date.isoformat(),
            'present': date in present_dates
        })

    return jsonify(response)

@app.route('/api/attendance/bulk-update', methods=['PUT'])
def bulk_update_attendance_dates():
    data = request.get_json()
    from_date_str = data.get('from_date')
    to_date_str = data.get('to_date')

    if not from_date_str or not to_date_str:
        return jsonify({'error': 'Both from_date and to_date are required'}), 400

    try:
        from_date_obj = datetime.fromisoformat(from_date_str)
        to_date_obj = datetime.fromisoformat(to_date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    # Get all records on the same calendar day (regardless of time)
    day_start = from_date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = from_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)

    result = attendance_collection.update_many(
        {'date': {'$gte': day_start, '$lte': day_end}},
        {'$set': {'date': to_date_obj}}
    )

    return jsonify({'message': f'Updated {result.modified_count} record(s)'})



if __name__ == '__main__':
    app.run(debug=True)
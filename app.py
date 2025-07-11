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
from docx.shared import Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from calendar import monthrange

load_dotenv()  # Load .env file

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your_secret_key')  # Set a secret key for session management

MONGO_URI = os.getenv('MONGO_URI')
client = MongoClient(MONGO_URI)
db = client.attendance_db
attendance_collection = db.attendance
users_collection = db.users  # Assuming you have a users collection

# Create a default admin user if it doesn't exist
if users_collection.count_documents({'username': 'admin'}) == 0:
    users_collection.insert_one({'username': 'admin', 'password': 'empire123'})

@app.route('/')
def index():
    return redirect(url_for('login'))  # Redirect to login page

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username')
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
    year = request.args.get('year')
    month = request.args.get('month')
    if not year or not month:
        return jsonify({'error': 'Year and month are required'}), 400
    try:
        year_int = int(year)
        month_int = int(month)
        start_date = datetime(year_int, month_int, 1)
        if month_int == 12:
            end_date = datetime(year_int + 1, 1, 1)
        else:
            end_date = datetime(year_int, month_int + 1, 1)
    except ValueError:
        return jsonify({'error': 'Invalid year or month format'}), 400
    cursor = attendance_collection.find({'date': {'$gte': start_date, '$lt': end_date}}).sort('date', 1)
    # Group attendance by exact date
    attendance_by_date = {}
    for record in cursor:
        date_obj = record['date'].date()
        if date_obj not in attendance_by_date:
            attendance_by_date[date_obj] = []
        attendance_by_date[date_obj].append(record['name'])
    # Create the DOCX document
    doc = Document()
    title = f'Attendance Report for {start_date.strftime("%B %Y")}'
    doc.add_heading(title, level=1)
    # For each date, add the date header and numbered list of attendees
    for date_key in sorted(attendance_by_date.keys()):
        # Add date with full date format like: June 1, 2025
        date_paragraph = doc.add_paragraph(date_key.strftime("%B %d, %Y"))
        date_paragraph.style = 'Heading2'
        date_paragraph.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT
        attendees = attendance_by_date[date_key]
        # Add numbered list of names
        for idx, name in enumerate(attendees, start=1):
            para = doc.add_paragraph(f"{idx}. {name}")
    # Save to BytesIO
    doc_io = BytesIO()
    doc.save(doc_io)
    doc_io.seek(0)
    filename = f"attendance_{year}-{str(month).zfill(2)}.docx"
    return send_file(
        doc_io,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

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



if __name__ == '__main__':
    app.run(debug=True)
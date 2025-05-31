import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import re

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
                '_id': { '$dateToString': { format: "%Y-%m-%d", date: "$date" } }, # Group by day for daily counts
                'count': {'$sum': 1}
            }
        },
        {
            '$sort': {'_id': 1} # Sort by date
        }
    ]

    cursor = attendance_collection.aggregate(pipeline)
    summary_data = []
    for doc in cursor:
        summary_data.append({
            'date': doc['_id'],
            'count': doc['count']
        })
    return jsonify(summary_data)

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
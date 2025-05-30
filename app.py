import os
from flask import Flask, render_template, request, jsonify
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import re

load_dotenv()  # Load .env file

app = Flask(__name__)

MONGO_URI = os.getenv('MONGO_URI')
client = MongoClient(MONGO_URI)
db = client.attendance_db
attendance_collection = db.attendance

@app.route('/')
def index():
    return render_template('attendance.html')

@app.route('/api/attendance', methods=['POST'])
def add_attendance():
    data = request.get_json()
    name = data.get('name', '').strip()
    date_str = data.get('date', '').strip()
    if not name or not date_str:
        return jsonify({'error': 'Name and date are required'}), 400
    try:
        # Parse date string in ISO format
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
    # Case-insensitive regex to find names starting with or containing q substring
    regex = re.compile(re.escape(q), re.IGNORECASE)
    # Find distinct names matching regex, limit to 10 suggestions
    names = attendance_collection.distinct('name', {'name': regex})[:10]
    return jsonify(names)

if __name__ == '__main__':
    app.run(debug=True)


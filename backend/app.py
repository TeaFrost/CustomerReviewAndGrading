from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, '../database/amazon_reviews.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row 
    return conn

@app.route('/')
def home():
    return "Flask Backend is running successfully!"

@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT product_category FROM amazon_reviews WHERE product_category IS NOT NULL")
    categories = [row['product_category'] for row in cursor.fetchall()]
    conn.close()
    return jsonify(categories)

@app.route('/api/products', methods=['GET'])
def get_products():
    category = request.args.get('category', default='ALL', type=str)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if category == 'ALL' or not category:
        cursor.execute("SELECT DISTINCT product_title FROM amazon_reviews WHERE product_title IS NOT NULL LIMIT 50")
    else:
        cursor.execute("SELECT DISTINCT product_title FROM amazon_reviews WHERE product_category = ? AND product_title IS NOT NULL LIMIT 50", (category,))
        
    products = [row['product_title'] for row in cursor.fetchall()]
    conn.close()
    return jsonify(products)

@app.route('/api/product-details', methods=['GET'])
def get_product_details():
    category = request.args.get('category', default='ALL', type=str)
    title = request.args.get('title', default='ALL', type=str)
    sort_by = request.args.get('sort', default='helpful', type=str)
    order = request.args.get('order', default='DESC', type=str)
    flag_filter = request.args.get('flag', default='ALL', type=str) # Lọc theo cờ mâu thuẫn

    valid_columns = {
        'star': 'star_rating',
        'helpful': 'helpful_votes',
        'date': 'review_date',
        'title': 'product_title'
    }
    column_to_sort = valid_columns.get(sort_by, 'helpful_votes')
    sort_order = 'ASC' if order.upper() == 'ASC' else 'DESC'

    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT review_id, product_title, product_category, star_rating, review_body, helpful_votes, review_date, 
               high_rating_negative_flag, low_rating_positive_flag 
        FROM amazon_reviews 
        WHERE 1=1
    """
    params = []

    if category != 'ALL' and category:
        query += " AND product_category = ?"
        params.append(category)

    if title != 'ALL' and title:
        query += " AND product_title = ?"
        params.append(title)

    if flag_filter == 'high_neg':
        query += " AND high_rating_negative_flag = 1"
    elif flag_filter == 'low_pos':
        query += " AND low_rating_positive_flag = 1"

    query += f" ORDER BY {column_to_sort} {sort_order} LIMIT 50"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    reviews_list = [dict(row) for row in rows]
    return jsonify(reviews_list)

@app.route('/api/product-analytics', methods=['GET'])
def get_product_analytics():
    category = request.args.get('category', default='ALL', type=str)
    title = request.args.get('title', default='ALL', type=str)
    conn = get_db_connection()
    cursor = conn.cursor()

    star_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    
    base_where = "WHERE 1=1"
    params = []
    if category != 'ALL' and category:
        base_where += " AND product_category = ?"
        params.append(category)
    if title != 'ALL' and title:
        base_where += " AND product_title = ?"
        params.append(title)

    cursor.execute(f"SELECT star_rating, COUNT(*) as cnt FROM amazon_reviews {base_where} GROUP BY star_rating", params)
    
    for row in cursor.fetchall():
        if row['star_rating'] in star_counts:
            star_counts[row['star_rating']] = row['cnt']

    flags = {"high_rating_negative": 0, "low_rating_positive": 0}
    try:
        cursor.execute(f"SELECT SUM(IFNULL(high_rating_negative_flag, 0)) as h_neg, SUM(IFNULL(low_rating_positive_flag, 0)) as l_pos FROM amazon_reviews {base_where}", params)
        flag_row = cursor.fetchone()
        if flag_row:
            flags["high_rating_negative"] = flag_row['h_neg'] or 0
            flags["low_rating_positive"] = flag_row['l_pos'] or 0
    except Exception as e:
        print("Note: Flag columns might not exist yet:", e)

    conn.close()

    return jsonify({
        "star_distribution": [star_counts[1], star_counts[2], star_counts[3], star_counts[4], star_counts[5]],
        "sentiment_mismatch_flags": [flags["high_rating_negative"], flags["low_rating_positive"]]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
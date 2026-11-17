import sqlite3
import pandas as pd
import os

# 1. Tự động lấy thư mục gốc của project (lùi ra 1 cấp từ thư mục database)
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)

# 2. Trỏ chuẩn xác vào thư mục data và database
csv_path = os.path.join(project_root, 'data', '3.amazon_reviews_nlp_results.csv')
db_path = os.path.join(current_dir, 'amazon_reviews.db')

print(f"Đang đọc file từ: {csv_path}")
df = pd.read_csv(csv_path)

# 3. Kết nối và nạp vào SQLite
conn = sqlite3.connect(db_path)
df.to_sql('amazon_reviews', conn, if_exists='replace', index=False)
conn.close()

print(f"Thành công! Đã nạp {len(df)} dòng dữ liệu vào SQLite!")
from flask import Flask, request, jsonify, render_template, url_for
import pandas as pd
import numpy as np
import os

app = Flask(__name__)

# Biến global để lưu DataFrame sau khi upload
df_students = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    global df_students
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        try:
            # Đọc file dựa vào định dạng
            if file.filename.endswith('.csv'):
                df = pd.read_csv(file)
            elif file.filename.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file)
            else:
                return jsonify({'error': 'Unsupported file type'}), 400
            
            # Tiền xử lý dữ liệu: xóa khoảng trắng ở đầu/cuối tên cột và đổi về dạng chuẩn
            df.columns = df.columns.str.strip().str.replace(' ', '')
            
            # Xử lý tên cột 'lop'
            if 'lop' in df.columns:
                df.rename(columns={'lop': 'Lop'}, inplace=True)
            
            # Xử lý cột 'TenHocSinh' (nếu không có, dùng 'MaHS')
            if 'TenHocSinh' not in df.columns and 'MaHS' in df.columns:
                df['TenHocSinh'] = df['MaHS'].astype(str)

            # Kiểm tra và tính toán DiemTrungBinh nếu cột không tồn tại
            if 'DiemTrungBinh' not in df.columns:
                score_cols_grade = ['Toan', 'Van', 'Ly', 'Hoa', 'Ngoaingu', 'Su', 'Tin', 'Sinh', 'Dia']
                score_cols_component = ['TX1', 'TX2', 'TX3', 'GK', 'CK']
                
                # Tìm các cột điểm môn học
                subject_scores = [col for col in df.columns if col in score_cols_grade]
                
                # Tìm các cột điểm thành phần
                component_scores = [col for col in df.columns if col in score_cols_component]

                if subject_scores:
                    # Tính điểm trung bình từ các môn học
                    df['DiemTrungBinh'] = df[subject_scores].mean(axis=1, skipna=True)
                elif component_scores:
                    # Tính điểm trung bình từ các điểm thành phần
                    df['DiemTrungBinh'] = df[component_scores].mean(axis=1, skipna=True)
                else:
                    return jsonify({'error': 'File không có cột Điểm Trung Bình và không có cột điểm thành phần để tính toán.'}), 400
            
            # Kiểm tra lại các cột yêu cầu sau khi tiền xử lý
            required_cols = ['TenHocSinh', 'Lop', 'DiemTrungBinh']
            if not all(col in df.columns for col in required_cols):
                return jsonify({'error': f"File phải chứa các cột: {', '.join(required_cols)} hoặc có thể tính toán được."}), 400

            df_students = df.copy() # Lưu DataFrame vào biến global
            return jsonify({'message': 'File uploaded and processed successfully'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_data():
    global df_students
    if df_students is None:
        return jsonify({'error': 'No data uploaded yet'}), 400
    try:
        data = request.json
        zscore_threshold = float(data.get('zscore_threshold', 1.5))
        df = df_students.copy()
        
        # Lấy danh sách các cột điểm môn học (ví dụ: Toan, Ly, Hoa)
        subject_list = [col for col in df.columns if col not in ['STT', 'MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh']]
        
        # Chuyển đổi các cột điểm sang dạng số
        for col in ['TenHocSinh', 'Lop', 'DiemTrungBinh'] + subject_list:
             df[col] = pd.to_numeric(df[col], errors='coerce')

        df.dropna(subset=['Lop', 'DiemTrungBinh'], inplace=True)

        # Tính Z-score cho DiemTrungBinh
        df['Z_score'] = df.groupby('Lop')['DiemTrungBinh'].transform(
            lambda x: (x - x.mean()) / x.std() if x.std() != 0 else 0
        )
        
        # Tìm học sinh bất thường
        df['IsAbnormal'] = df['Z_score'].abs() > zscore_threshold
        abnormal_students_df = df[df['IsAbnormal']].copy()

        # Lấy dữ liệu đầy đủ cho frontend
        full_data = df.to_dict('records')
        
        # Chọn các cột cần thiết và chuyển về dict
        abnormal_students = abnormal_students_df[['TenHocSinh', 'Lop', 'DiemTrungBinh', 'Z_score']].to_dict('records')
        
        # Thống kê tổng số và bất thường theo lớp
        class_counts = df.groupby('Lop').agg(
            total_students=('IsAbnormal', 'size'),
            abnormal_students=('IsAbnormal', 'sum')
        ).reset_index().to_dict('records')
        
        return jsonify({
            'abnormal_students': abnormal_students,
            'class_stats': class_counts,
            'full_data': full_data,
            'subject_list': subject_list
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Tạo thư mục 'static' và 'templates' nếu chưa có
    if not os.path.exists('static'):
        os.makedirs('static')
    if not os.path.exists('templates'):
        os.makedirs('templates')
    app.run(debug=True)

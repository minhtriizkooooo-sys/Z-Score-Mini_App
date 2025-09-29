from flask import Flask, request, jsonify, render_template, url_for, Response
import pandas as pd
import numpy as np
import os
import io

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
            # Đọc file
            if file.filename.endswith('.csv'):
                df = pd.read_csv(file)
            elif file.filename.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file)
            else:
                return jsonify({'error': 'Unsupported file type'}), 400
            
            # Làm sạch tên cột
            df.columns = df.columns.str.strip().str.replace(' ', '').str.replace('.', '').str.replace('/', '')
            
            # Chuẩn hóa tên cột lớp và học sinh
            if 'lop' in df.columns:
                df.rename(columns={'lop': 'Lop'}, inplace=True)
            
            # Tạo TenHocSinh giả định nếu chỉ có MaHS
            if 'TenHocSinh' not in df.columns and 'MaHS' in df.columns:
                df['TenHocSinh'] = 'HS-' + df['MaHS'].astype(str)
                
            required_cols_present = all(col in df.columns for col in ['TenHocSinh', 'Lop'])
            if not required_cols_present:
                 return jsonify({'error': 'File phải chứa các cột TenHocSinh/MaHS và Lop.'}), 400

            # Xác định cột điểm và tính Điểm Trung Bình nếu chưa có
            score_cols_grade = ['Toan', 'Van', 'Ly', 'Hoa', 'Ngoaingu', 'Su', 'Tin', 'Sinh', 'Dia']
            score_cols_component = ['TX1', 'TX2', 'TX3', 'GK', 'CK']
            
            subject_scores_present = [col for col in score_cols_grade if col in df.columns]
            component_scores_present = [col for col in score_cols_component if col in df.columns]

            if 'DiemTrungBinh' not in df.columns:
                score_cols_to_use = []
                if subject_scores_present:
                    score_cols_to_use = subject_scores_present
                elif component_scores_present:
                    score_cols_to_use = component_scores_present
                
                if score_cols_to_use:
                    # Chuyển đổi điểm số sang dạng số (thay thế lỗi bằng NaN)
                    df[score_cols_to_use] = df[score_cols_to_use].apply(pd.to_numeric, errors='coerce')
                    # Điền NaN bằng 0 trước khi tính trung bình, giả định điểm bị trống là 0 (hoặc điểm chưa thi)
                    df['DiemTrungBinh'] = df[score_cols_to_use].fillna(0).mean(axis=1)
                else:
                    return jsonify({'error': 'File không có cột Điểm Trung Bình và không có cột điểm thành phần hoặc môn học để tính toán.'}), 400
            
            # Chuyển đổi tất cả cột điểm đã tính toán sang số và điền 0 cho NaN
            all_score_cols = ['DiemTrungBinh'] + subject_scores_present
            for col in all_score_cols:
                 df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)


            df_students = df.copy()
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
        
        # Lấy danh sách môn học/thành phần điểm có thể phân tích chi tiết
        subject_list = [col for col in df.columns if col not in ['STT', 'MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh']]
        
        # TÍNH Z-SCORE TRÊN ĐIỂM TRUNG BÌNH CỦA TỪNG LỚP
        # Công thức Z = (X - Mu) / Sigma
        df['Z_score'] = df.groupby('Lop')['DiemTrungBinh'].transform(
            lambda x: (x - x.mean()) / x.std() if x.std() != 0 else 0
        )
        
        # Xác định học sinh bất thường
        df['IsAbnormal'] = df['Z_score'].abs() > zscore_threshold
        
        abnormal_students_df = df[df['IsAbnormal']].copy()

        # Dữ liệu đầy đủ cho frontend (cần MaHS cho bộ lọc)
        full_data = df.to_dict('records')
        
        abnormal_students = abnormal_students_df[['MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh', 'Z_score']].to_dict('records')
        
        # Thống kê cho biểu đồ cột
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

@app.route('/download_abnormal', methods=['GET'])
def download_abnormal_students():
    global df_students
    if df_students is None:
        return "Không có dữ liệu để tải xuống.", 404
    
    # Lấy ngưỡng Z-score từ query param (hoặc dùng mặc định 1.5)
    zscore_threshold = float(request.args.get('zscore', 1.5))
    df = df_students.copy()
    
    # TÍNH LẠI Z-SCORE VÀ XÁC ĐỊNH BẤT THƯỜNG
    df['Z_score'] = df.groupby('Lop')['DiemTrungBinh'].transform(
        lambda x: (x - x.mean()) / x.std() if x.std() != 0 else 0
    )
    df['IsAbnormal'] = df['Z_score'].abs() > zscore_threshold

    abnormal_df = df[df['IsAbnormal']][['MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh', 'Z_score']]
    
    # Xuất ra CSV
    output = io.StringIO()
    abnormal_df.to_csv(output, index=False, encoding='utf-8-sig')
    csv_data = output.getvalue()
    
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=danh_sach_hoc_sinh_bat_thuong.csv"}
    )

if __name__ == '__main__':
    # Tạo thư mục static và templates nếu chưa tồn tại (chỉ cần thiết cho môi trường local)
    if not os.path.exists('static'):
        os.makedirs('static')
    if not os.path.exists('templates'):
        os.makedirs('templates')
    app.run(debug=True)

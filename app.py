from flask import Flask, request, jsonify, render_template, url_for, Response
import pandas as pd
import numpy as np
import os
import io

app = Flask(__name__)

# Global variable to store DataFrame after upload
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
            # Read file
            if file.filename.endswith('.csv'):
                df = pd.read_csv(file)
            elif file.filename.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file)
            else:
                return jsonify({'error': 'Unsupported file type'}), 400
            
            # Clean column names
            df.columns = df.columns.str.strip().str.replace(' ', '').str.replace('.', '').str.replace('/', '')
            
            # Standardize class and student name columns
            if 'lop' in df.columns:
                df.rename(columns={'lop': 'Lop'}, inplace=True)
            
            # Create TenHocSinh if only MaHS exists
            if 'TenHocSinh' not in df.columns and 'MaHS' in df.columns:
                df['TenHocSinh'] = 'HS-' + df['MaHS'].astype(str)
                
            required_cols_present = all(col in df.columns for col in ['TenHocSinh', 'Lop'])
            if not required_cols_present:
                 return jsonify({'error': 'File phải chứa các cột TenHocSinh/MaHS và Lop.'}), 400

            # Identify score columns and calculate average score if not present
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
                    # Convert scores to numeric (replace errors with NaN)
                    df[score_cols_to_use] = df[score_cols_to_use].apply(pd.to_numeric, errors='coerce')
                    # Fill NaN with 0 before calculating average
                    df['DiemTrungBinh'] = df[score_cols_to_use].fillna(0).mean(axis=1)
                else:
                    return jsonify({'error': 'File không có cột Điểm Trung Bình và không có cột điểm thành phần hoặc môn học để tính toán.'}), 400
            
            # Convert all score columns to numeric and fill NaN with 0
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
        
        # Get list of subjects/components for detailed analysis
        subject_list = [col for col in df.columns if col not in ['STT', 'MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh']]
        
        # Calculate Z-score on average score per class
        df['Z_score'] = df.groupby('Lop')['DiemTrungBinh'].transform(
            lambda x: (x - x.mean()) / x.std() if x.std() != 0 else 0
        )
        
        # Identify abnormal students
        df['IsAbnormal'] = df['Z_score'].abs() > zscore_threshold
        
        abnormal_students_df = df[df['IsAbnormal']].copy()

        # Full data for frontend (needed for filters)
        full_data = df.to_dict('records')
        
        abnormal_students = abnormal_students_df[['MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh', 'Z_score']].to_dict('records')
        
        # Stats for bar chart
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
    
    # Get Z-score threshold from query param (default 1.5)
    zscore_threshold = float(request.args.get('zscore', 1.5))
    df = df_students.copy()
    
    # Recalculate Z-score and identify abnormal students
    df['Z_score'] = df.groupby('Lop')['DiemTrungBinh'].transform(
        lambda x: (x - x.mean()) / x.std() if x.std() != 0 else 0
    )
    df['IsAbnormal'] = df['Z_score'].abs() > zscore_threshold

    abnormal_df = df[df['IsAbnormal']][['MaHS', 'TenHocSinh', 'Lop', 'DiemTrungBinh', 'Z_score']]
    
    # Export to CSV
    output = io.StringIO()
    abnormal_df.to_csv(output, index=False, encoding='utf-8-sig')
    csv_data = output.getvalue()
    
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=danh_sach_hoc_sinh_bat_thuong.csv"}
    )

if __name__ == '__main__':
    # Create static and templates folders if they don't exist
    if not os.path.exists('static'):
        os.makedirs('static')
    if not os.path.exists('templates'):
        os.makedirs('templates')
    app.run(debug=True)

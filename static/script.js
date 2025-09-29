let currentAbnormalStudents = []; // Lưu trữ danh sách học sinh bất thường hiện tại (chưa lọc)
let classChart, histogramChart, scatterChart;
let fullData = []; // Dữ liệu đầy đủ từ backend
let subjectList = [];
let currentClass = null;

document.addEventListener('DOMContentLoaded', () => {
    const introVideo = document.getElementById('intro-video');
    const introContainer = document.getElementById('intro-container');
    const startButton = document.getElementById('start-button');
    const mainContent = document.getElementById('main-content');
    const uploadForm = document.getElementById('upload-form');
    const zscoreSlider = document.getElementById('zscore-slider');
    const zscoreValueSpan = document.getElementById('zscore-value');
    const downloadButton = document.getElementById('download-button');
    
    // Filters
    window.filterTable = filterTable; // Export function to window scope for inline HTML calls
    const filterLop = document.getElementById('filter-lop');
    const filterMaHS = document.getElementById('filter-mahs');
    
    // Advanced Charts elements
    const advancedChartsSection = document.getElementById('advanced-charts-section');
    const subjectSelect = document.getElementById('subject-select');
    const classNameTitle = document.getElementById('class-name-title');

    // --- 1. INTRO VIDEO INTERACTION ---
    // Hiển thị nút bắt đầu khi video kết thúc
    introVideo.addEventListener('ended', () => {
        startButton.style.display = 'block';
    });
    
    // Ẩn intro container và hiển thị nội dung chính khi click vào nút bắt đầu
    startButton.addEventListener('click', () => {
        // Tạo hiệu ứng chuyển cảnh mượt mà
        introContainer.style.opacity = '0';
        setTimeout(() => {
            introContainer.style.display = 'none';
            mainContent.style.display = 'block';
        }, 1000); // Đợi transition kết thúc
    });


    // --- 2. UPLOAD AND ANALYZE DATA ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];
        if (!file) {
            alert('Vui lòng chọn một file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                console.log('Tệp đã được tải lên và xử lý thành công.');
                alert('Tải lên thành công! Bắt đầu phân tích.');
                // Bắt đầu phân tích với Z-score mặc định
                await analyzeData(zscoreSlider.value);
            } else {
                const errorData = await response.json();
                alert(`Lỗi: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Lỗi khi tải lên file:', error);
            alert('Đã xảy ra lỗi khi kết nối đến máy chủ.');
        }
    });

    // --- 3. REAL-TIME Z-SCORE SLIDER ---
    zscoreSlider.addEventListener('input', async () => {
        // Cập nhật giá trị hiển thị real-time
        zscoreValueSpan.textContent = parseFloat(zscoreSlider.value).toFixed(1);
        
        // Gọi lại hàm phân tích để cập nhật real-time
        await analyzeData(zscoreSlider.value);
        
        // Nếu đang xem chi tiết lớp, cập nhật lại biểu đồ chi tiết
        if (currentClass) {
            updateAdvancedCharts(currentClass);
        }
    });

    // --- 4. ADVANCED CHART INTERACTIONS ---
    subjectSelect.addEventListener('change', () => {
        if (currentClass) {
            updateAdvancedCharts(currentClass);
        }
    });
    
    // --- 5. DOWNLOAD BUTTON ---
    downloadButton.addEventListener('click', () => {
        const zscore = parseFloat(zscoreSlider.value).toFixed(1);
        const downloadUrl = `/download_abnormal?zscore=${zscore}`;
        window.location.href = downloadUrl;
    });

    // --- CORE ANALYSIS FUNCTION ---
    async function analyzeData(zscoreThreshold) {
        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ zscore_threshold: parseFloat(zscoreThreshold) }),
            });

            if (response.ok) {
                const data = await response.json();
                fullData = data.full_data;
                subjectList = data.subject_list;
                currentAbnormalStudents = data.abnormal_students; // Lưu trữ dữ liệu gốc
                
                // Cập nhật UI
                updateTable(currentAbnormalStudents); 
                updateClassChart(data.class_stats);
                updateFilterDropdowns(data.abnormal_students);
                updateSubjectDropdown();

            } else {
                const errorData = await response.json();
                console.error('Lỗi khi phân tích:', errorData.error);
            }
        } catch (error) {
            console.error('Lỗi khi gọi API phân tích:', error);
        }
    }
    
    // --- UTILITY FUNCTIONS ---
    
    function updateFilterDropdowns(students) {
        // Cập nhật bộ lọc Lớp
        const uniqueClasses = [...new Set(students.map(s => s.Lop))].sort();
        filterLop.innerHTML = '<option value="">-- Tất cả Lớp --</option>';
        uniqueClasses.forEach(lop => {
            const option = document.createElement('option');
            option.value = lop;
            option.textContent = lop;
            filterLop.appendChild(option);
        });
        
        // Cập nhật bộ lọc Mã HS (chỉ cần input text, không cần dropdown)
        // Đảm bảo filterMaHS reset
        filterMaHS.value = '';
    }

    function filterTable() {
        const selectedClass = filterLop.value.toLowerCase();
        const searchMaHS = filterMaHS.value.toLowerCase();
        const abnormalStudentsTableBody = document.querySelector('#abnormal-students-table tbody');

        const filteredStudents = currentAbnormalStudents.filter(student => {
            const matchClass = !selectedClass || student.Lop.toLowerCase() === selectedClass;
            const matchMaHS = !searchMaHS || student.MaHS.toString().toLowerCase().includes(searchMaHS);
            return matchClass && matchMaHS;
        });

        renderTable(filteredStudents, abnormalStudentsTableBody);
    }
    
    function updateTable(students) {
        const abnormalStudentsTableBody = document.querySelector('#abnormal-students-table tbody');
        renderTable(students, abnormalStudentsTableBody);
    }

    function renderTable(students, tableBody) {
        tableBody.innerHTML = '';
        if (students.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">Không tìm thấy học sinh bất thường nào phù hợp với bộ lọc/ngưỡng Z-score.</td></tr>';
            return;
        }
        students.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.MaHS}</td>
                <td>${student.TenHocSinh}</td>
                <td>${student.Lop}</td>
                <td>${student.DiemTrungBinh.toFixed(2)}</td>
                <td>${student.Z_score.toFixed(2)}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function updateClassChart(classStats) {
        const labels = classStats.map(stat => stat.Lop);
        const totalStudents = classStats.map(stat => stat.total_students);
        const abnormalStudents = classStats.map(stat => stat.abnormal_students);

        if (classChart) {
            classChart.destroy();
        }

        classChart = new Chart(document.getElementById('class-chart'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tổng số Học sinh',
                        data: totalStudents,
                        backgroundColor: 'rgba(46, 139, 87, 0.7)', // Màu xanh lá đậm
                        borderColor: 'rgba(46, 139, 87, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Học sinh Bất thường (Outlier)',
                        data: abnormalStudents,
                        backgroundColor: 'rgba(255, 99, 132, 0.8)', // Màu đỏ
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: false }
                },
                onClick: (e) => {
                    const activePoint = classChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    if (activePoint.length > 0) {
                        const firstPoint = activePoint[0];
                        const label = classChart.data.labels[firstPoint.index];
                        currentClass = label;
                        classNameTitle.textContent = label;
                        advancedChartsSection.style.display = 'block';
                        
                        // Đảm bảo dropdown có giá trị trước khi vẽ biểu đồ
                        if (subjectSelect.value) {
                            updateAdvancedCharts(label);
                        }
                    }
                }
            }
        });
    }

    function updateSubjectDropdown() {
        // Cập nhật danh sách môn học cho dropdown
        subjectSelect.innerHTML = '';
        if (subjectList.length === 0) {
            subjectSelect.innerHTML = '<option value="">Không có cột điểm chi tiết</option>';
            return;
        }

        subjectList.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            subjectSelect.appendChild(option);
        });
        
        // Nếu đã có lớp được chọn trước đó, cập nhật lại biểu đồ
        if (currentClass) {
             updateAdvancedCharts(currentClass);
        }
    }

    function updateAdvancedCharts(className) {
        if (!subjectSelect.value) return; // Không có môn học để vẽ

        const selectedSubject = subjectSelect.value;
        const classStudents = fullData.filter(s => s.Lop === className);

        // --- HISTOGRAM (PHÂN BỐ ĐIỂM) ---
        const subjectScores = classStudents.map(s => s[selectedSubject]).filter(s => s !== null && s !== undefined);
        const maxScore = Math.max(...subjectScores);
        const minScore = Math.min(...subjectScores);
        const numBins = 10;
        const binSize = (maxScore - minScore) / numBins;

        const bins = Array(numBins).fill(0);
        const labels = [];
        for (let i = 0; i < numBins; i++) {
            labels.push(`${(minScore + i * binSize).toFixed(1)} - ${(minScore + (i + 1) * binSize).toFixed(1)}`);
        }
        
        subjectScores.forEach(score => {
            let index = Math.floor((score - minScore) / binSize);
            if (index === numBins) index = numBins - 1; // Trường hợp điểm = maxScore
            if (index >= 0 && index < numBins) {
                 bins[index]++;
            }
        });
        
        if (histogramChart) histogramChart.destroy();
        histogramChart = new Chart(document.getElementById('histogram-chart'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Phân bố điểm môn ${selectedSubject} (Số lượng HS)`,
                    data: bins,
                    backgroundColor: 'rgba(75, 192, 192, 0.8)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Số lượng Học sinh' } },
                    x: { title: { display: true, text: `Khoảng điểm môn ${selectedSubject}` } }
                },
                plugins: {
                    title: { display: false }
                }
            }
        });

        // --- SCATTER PLOT ---
        const scatterPoints = classStudents.map(s => ({
            x: s.DiemTrungBinh,
            y: s[selectedSubject],
            name: s.TenHocSinh,
            isAbnormal: s.IsAbnormal
        })).filter(p => p.x !== null && p.y !== null);

        const normalPoints = scatterPoints.filter(p => !p.isAbnormal);
        const abnormalPoints = scatterPoints.filter(p => p.isAbnormal);
        
        if (scatterChart) scatterChart.destroy();
        scatterChart = new Chart(document.getElementById('scatter-chart'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Học sinh Bình thường',
                        data: normalPoints.map(p => ({ x: p.x, y: p.y, name: p.name })),
                        backgroundColor: 'rgba(46, 139, 87, 0.8)'
                    },
                    {
                        label: 'Học sinh Bất thường (Outlier)',
                        data: abnormalPoints.map(p => ({ x: p.x, y: p.y, name: p.name })),
                        backgroundColor: 'rgba(255, 99, 132, 1)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: { display: true, text: 'Điểm Trung bình (TB)' }
                    },
                    y: {
                        title: { display: true, text: `Điểm môn ${selectedSubject}` }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${point.name}: TB ${point.x.toFixed(2)}, ${selectedSubject} ${point.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const introVideo = document.getElementById('intro-video');
    const introContainer = document.getElementById('intro-container');
    const startButton = document.getElementById('start-button');
    const mainContent = document.getElementById('main-content');
    const uploadForm = document.getElementById('upload-form');
    const zscoreSlider = document.getElementById('zscore-slider');
    const zscoreValueSpan = document.getElementById('zscore-value');
    const abnormalStudentsTableBody = document.querySelector('#abnormal-students-table tbody');
    const chartCanvas = document.getElementById('class-chart');
    const advancedChartsSection = document.getElementById('advanced-charts-section');
    const subjectSelect = document.getElementById('subject-select');
    const classNameTitle = document.getElementById('class-name-title');

    let classChart, histogramChart, scatterChart;
    let fullData = [];
    let subjectList = [];
    let currentClass = null;
    
    // Hiển thị nút bắt đầu khi video kết thúc
    introVideo.addEventListener('ended', () => {
        startButton.style.display = 'block';
    });
    
    // Ẩn intro container và hiển thị nội dung chính khi click vào nút bắt đầu
    startButton.addEventListener('click', () => {
        introContainer.style.display = 'none';
        mainContent.style.display = 'block';
    });

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
                alert('Tệp đã được tải lên và xử lý thành công.');
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

    zscoreSlider.addEventListener('input', async () => {
        zscoreValueSpan.textContent = zscoreSlider.value;
        await analyzeData(zscoreSlider.value);
    });

    subjectSelect.addEventListener('change', () => {
        if (currentClass) {
            updateAdvancedCharts(currentClass);
        }
    });

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
                updateTable(data.abnormal_students);
                updateClassChart(data.class_stats);
                updateSubjectDropdown();
            } else {
                const errorData = await response.json();
                console.error('Lỗi khi phân tích:', errorData.error);
            }
        } catch (error) {
            console.error('Lỗi khi gọi API phân tích:', error);
        }
    }

    function updateTable(students) {
        abnormalStudentsTableBody.innerHTML = '';
        if (students.length === 0) {
            abnormalStudentsTableBody.innerHTML = '<tr><td colspan="4">Không tìm thấy học sinh bất thường.</td></tr>';
            return;
        }
        students.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.TenHocSinh}</td>
                <td>${student.Lop}</td>
                <td>${student.DiemTrungBinh.toFixed(2)}</td>
                <td>${student.Z_score.toFixed(2)}</td>
            `;
            abnormalStudentsTableBody.appendChild(row);
        });
    }

    function updateClassChart(classStats) {
        const labels = classStats.map(stat => stat.Lop);
        const totalStudents = classStats.map(stat => stat.total_students);
        const abnormalStudents = classStats.map(stat => stat.abnormal_students);

        if (classChart) {
            classChart.destroy();
        }

        classChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tổng số Học sinh',
                        data: totalStudents,
                        backgroundColor: 'rgba(0, 123, 255, 0.6)',
                        borderColor: 'rgba(0, 123, 255, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Học sinh Bất thường',
                        data: abnormalStudents,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                onClick: (e) => {
                    const activePoint = classChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    if (activePoint.length > 0) {
                        const firstPoint = activePoint[0];
                        const label = classChart.data.labels[firstPoint.index];
                        currentClass = label;
                        classNameTitle.textContent = label;
                        advancedChartsSection.style.display = 'block';
                        updateAdvancedCharts(label);
                    }
                }
            }
        });
    }

    function updateSubjectDropdown() {
        subjectSelect.innerHTML = '';
        subjectList.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            subjectSelect.appendChild(option);
        });
    }

    function updateAdvancedCharts(className) {
        const selectedSubject = subjectSelect.value;
        const classStudents = fullData.filter(s => s.Lop === className);

        const subjectScores = classStudents.map(s => s[selectedSubject]).filter(s => !isNaN(s) && s !== null);
        const histogramData = {};
        subjectScores.forEach(score => {
            const bin = Math.floor(score);
            histogramData[bin] = (histogramData[bin] || 0) + 1;
        });

        const scatterPoints = classStudents.map(s => ({
            x: s.DiemTrungBinh,
            y: s[selectedSubject],
            name: s.TenHocSinh,
            isAbnormal: s.IsAbnormal
        })).filter(p => !isNaN(p.x) && !isNaN(p.y));

        const normalPoints = scatterPoints.filter(p => !p.isAbnormal);
        const abnormalPoints = scatterPoints.filter(p => p.isAbnormal);
        
        if (histogramChart) histogramChart.destroy();
        if (scatterChart) scatterChart.destroy();
        
        histogramChart = new Chart(document.getElementById('histogram-chart'), {
            type: 'bar',
            data: {
                labels: Object.keys(histogramData).sort((a, b) => a - b),
                datasets: [{
                    label: `Phân bố điểm môn ${selectedSubject}`,
                    data: Object.values(histogramData),
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true },
                    x: { title: { display: true, text: `Điểm môn ${selectedSubject}` } }
                }
            }
        });

        scatterChart = new Chart(document.getElementById('scatter-chart'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Học sinh Bình thường',
                        data: normalPoints,
                        backgroundColor: 'rgba(75, 192, 192, 0.8)'
                    },
                    {
                        label: 'Học sinh Bất thường',
                        data: abnormalPoints,
                        backgroundColor: 'rgba(255, 99, 132, 1)'
                    }
                ]
            },
            options: {
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: { display: true, text: 'Điểm Trung bình' }
                    },
                    y: {
                        title: { display: true, text: `Điểm môn ${selectedSubject}` }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${point.name}: Điểm TB ${point.x.toFixed(2)}, Điểm ${selectedSubject} ${point.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }
});

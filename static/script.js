let currentAbnormalStudents = [];
let classChart, histogramChart, scatterChart;
let fullData = [];
let subjectList = [];
let currentClass = null;
const videoThemes = [
    '/static/intro-video-theme1.mp4',
    '/static/intro-video-theme2.mp4',
    '/static/intro-video-theme3.mp4'
];
let currentThemeIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    const introVideo = document.getElementById('intro-video');
    const introContainer = document.getElementById('intro-container');
    const mainContent = document.getElementById('main-content');
    const uploadForm = document.getElementById('upload-form');
    const zscoreSlider = document.getElementById('zscore-slider');
    const zscoreValueSpan = document.getElementById('zscore-value');
    const downloadButton = document.getElementById('download-button');
    const videoOverlay = document.getElementById('video-overlay');
    
    // Filters
    window.filterTable = filterTable;
    const filterLop = document.getElementById('filter-lop');
    const filterMaHS = document.getElementById('filter-mahs');
    
    // Advanced Charts elements
    const advancedChartsSection = document.getElementById('advanced-charts-section');
    const subjectSelect = document.getElementById('subject-select');
    const classNameTitle = document.getElementById('class-name-title');

    // Set initial video source
    introVideo.src = videoThemes[currentThemeIndex];

    // Video theme switching and transition to main content
    videoOverlay.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex + 1) % videoThemes.length;
        if (currentThemeIndex === 0) {
            // Transition to main content when cycling back to first theme
            introContainer.style.opacity = '0';
            setTimeout(() => {
                introContainer.style.display = 'none';
                mainContent.style.display = 'block';
            }, 500);
        } else {
            introVideo.src = videoThemes[currentThemeIndex];
            introVideo.play();
        }
    });

    // Auto-transition to main content when video ends
    introVideo.addEventListener('ended', () => {
        introContainer.style.opacity = '0';
        setTimeout(() => {
            introContainer.style.display = 'none';
            mainContent.style.display = 'block';
        }, 500);
    });

    // Upload and analyze data
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
                alert('Tải lên thành công! Bắt đầu phân tích.');
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

    // Real-time Z-score slider
    zscoreSlider.addEventListener('input', async () => {
        zscoreValueSpan.textContent = parseFloat(zscoreSlider.value).toFixed(1);
        await analyzeData(zscoreSlider.value);
        if (currentClass) {
            updateAdvancedCharts(currentClass);
        }
    });

    // Advanced chart interactions
    subjectSelect.addEventListener('change', () => {
        if (currentClass) {
            updateAdvancedCharts(currentClass);
        }
    });

    // Download button
    downloadButton.addEventListener('click', () => {
        const zscore = parseFloat(zscoreSlider.value).toFixed(1);
        window.location.href = `/download_abnormal?zscore=${zscore}`;
    });

    // Core analysis function
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
                currentAbnormalStudents = data.abnormal_students;
                
                updateTable(currentAbnormalStudents);
                updateClassChart(data.class_stats);
                updateFilterDropdowns(data.abnormal_students);
                updateSubjectDropdown();
            } else {
                const errorData = await response.json();
                alert(`Lỗi: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Lỗi khi gọi API phân tích:', error);
            alert('Đã xảy ra lỗi khi kết nối đến máy chủ.');
        }
    }

    // Utility functions
    function updateFilterDropdowns(students) {
        const uniqueClasses = [...new Set(students.map(s => s.Lop))].sort();
        filterLop.innerHTML = '<option value="">-- Tất cả Lớp --</option>';
        uniqueClasses.forEach(lop => {
            const option = document.createElement('option');
            option.value = lop;
            option.textContent = lop;
            filterLop.appendChild(option);
        });
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

        ```chartjs
        {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": "Tổng số Học sinh",
                        "data": totalStudents,
                        "backgroundColor": "#4caf50",
                        "borderColor": "#388e3c",
                        "borderWidth": 1
                    },
                    {
                        "label": "Học sinh Bất thường (Outlier)",
                        "data": abnormalStudents,
                        "backgroundColor": "#d32f2f",
                        "borderColor": "#b71c1c",
                        "borderWidth": 1
                    }
                ]
            },
            "options": {
                "responsive": true,
                "maintainAspectRatio": false,
                "scales": {
                    "y": {
                        "beginAtZero": true,
                        "title": { "display": true, "text": "Số lượng Học sinh", "color": "#1a1a1a" }
                    },
                    "x": {
                        "title": { "display": true, "text": "Lớp", "color": "#1a1a1a" }
                    }
                },
                "plugins": {
                    "legend": { "position": "top", "labels": { "color": "#1a1a1a" } },
                    "title": { "display": false }
                },
                "onClick": (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = labels[index];
                        currentClass = label;
                        classNameTitle.textContent = label;
                        advancedChartsSection.style.display = 'block';
                        if (subjectSelect.value) {
                            updateAdvancedCharts(label);
                        }
                    }
                }
            }
        }

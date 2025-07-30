// frontend/ec2/js/ec2-free-tier-monitor.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Make sure this matches your Flask backend
    const loadingFreeTierMessage = document.getElementById('loadingFreeTierMessage');
    const errorFreeTierMessageDiv = document.getElementById('errorFreeTierMessage');
    const currentUsageSpan = document.getElementById('currentUsage');
    const freeTierLimitSpan = document.getElementById('freeTierLimit');
    const remainingHoursSpan = document.getElementById('remainingHours');
    const ctx = document.getElementById('freeTierChart').getContext('2d');

    let freeTierChart; // Declare chart variable globally

    async function fetchFreeTierUsage() {
        loadingFreeTierMessage.style.display = 'block';
        errorFreeTierMessageDiv.style.display = 'none';

        try {
            const data = await callApi(`${API_BASE_URL}/ec2-free-tier-usage`);
            displayUsageData(data);
        } catch (error) {
            console.error('Error fetching EC2 Free Tier usage:', error);
            errorMessageDiv.textContent = `Failed to load EC2 Free Tier usage: ${error.message}. Please ensure the backend is running and has Cost Explorer permissions.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingFreeTierMessage.style.display = 'none';
        }
    }

    function displayUsageData(data) {
        currentUsageSpan.textContent = data.totalCurrentMonthUsage;
        freeTierLimitSpan.textContent = data.freeTierLimitHours;
        remainingHoursSpan.textContent = data.remainingHours;

        // Determine color for remaining hours
        if (data.remainingHours <= 0) {
            remainingHoursSpan.style.color = 'red';
        } else if (data.remainingHours <= data.freeTierLimitHours * 0.2) { // 20% remaining
            remainingHoursSpan.style.color = 'orange';
        } else {
            remainingHoursSpan.style.color = 'green';
        }

        if (freeTierChart) {
            freeTierChart.destroy(); // Destroy existing chart before creating a new one
        }

        freeTierChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Daily Usage (Hours)',
                    data: data.data,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }, {
                    label: 'Free Tier Limit (750h)',
                    data: Array(data.labels.length).fill(data.freeTierLimitHours), // Constant line for limit
                    borderColor: 'rgb(255, 99, 132)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0 // Hide points for the limit line
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allow chart to fill container
                plugins: {
                    title: {
                        display: true,
                        text: 'EC2 t2/t3.micro Instance Hours Usage This Month'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Hours'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                }
            }
        });
    }

    // Initial fetch when the page loads
    fetchFreeTierUsage();
});


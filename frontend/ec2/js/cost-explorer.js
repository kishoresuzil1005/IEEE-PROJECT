// frontend/cost/js/cost-explorer.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const loadingElement = document.getElementById('loadingMessage');
    const errorElement = document.getElementById('errorMessage');
    const costTableBody = document.querySelector('#costTable tbody');
    const costChartCanvas = document.getElementById('costChart');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const fetchCostButton = document.getElementById('fetchCostButton');
    const totalCostDisplay = document.getElementById('totalCostDisplay');

    let costChartInstance; // Variable to hold the Chart.js instance

    // Set default dates (last 6 months)
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1); // First day of 6 months ago

    startDateInput.value = sixMonthsAgo.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];

    async function fetchCostData() {
        loadingElement.style.display = 'block'; // Show loading message
        errorElement.style.display = 'none';    // Hide error message
        costTableBody.innerHTML = ''; // Clear existing table rows
        totalCostDisplay.textContent = '--'; // Reset total cost display

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            errorElement.textContent = 'Please select both start and end dates.';
            errorElement.style.display = 'block';
            loadingElement.style.display = 'none';
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            errorElement.textContent = 'Start date cannot be after end date.';
            errorElement.style.display = 'block';
            loadingElement.style.display = 'none';
            return;
        }

        try {
            const response = await callApi(`${API_BASE_URL}/aws-cost-explorer?startDate=${startDate}&endDate=${endDate}`);
            displayCostData(response);
            drawChart(response);
        } catch (error) {
            console.error('Failed to fetch cost data:', error);
            errorElement.textContent = `Error loading data: ${error.message}. Please check console for details.`;
            errorElement.style.display = 'block'; // Show error message
        } finally {
            loadingElement.style.display = 'none'; // Hide loading message
        }
    }

    function displayCostData(data) {
        if (data.length === 0) {
            const row = costTableBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 3;
            cell.textContent = 'No cost data available for the selected period.';
            cell.style.textAlign = 'center';
            totalCostDisplay.textContent = '0.00 USD';
            return;
        }

        let overallTotalCost = 0;

        // Group data by month and service for the table
        const groupedData = {}; // { 'YYYY-MM': { 'ServiceA': amount, 'ServiceB': amount } }
        data.forEach(item => {
            const month = item.TimePeriod.substring(0, 7); // YYYY-MM
            if (!groupedData[month]) {
                groupedData[month] = {};
            }
            groupedData[month][item.Service] = (groupedData[month][item.Service] || 0) + parseFloat(item.Amount);
            overallTotalCost += parseFloat(item.Amount);
        });

        // Sort months for consistent table display
        const sortedMonths = Object.keys(groupedData).sort();

        sortedMonths.forEach(month => {
            const servicesInMonth = Object.keys(groupedData[month]).sort();
            servicesInMonth.forEach(service => {
                const row = costTableBody.insertRow();
                row.insertCell().textContent = month;
                row.insertCell().textContent = service;
                row.insertCell().textContent = `${groupedData[month][service].toFixed(2)} USD`;
            });
            // Add a total row for each month for clarity
            const monthlyTotal = Object.values(groupedData[month]).reduce((sum, current) => sum + current, 0);
            const totalRow = costTableBody.insertRow();
            totalRow.classList.add('monthly-total-row'); // Add a class for styling
            const monthCell = totalRow.insertCell();
            monthCell.colSpan = 2;
            monthCell.textContent = `Total for ${month}:`;
            monthCell.style.fontWeight = 'bold';
            const totalAmountCell = totalRow.insertCell();
            totalAmountCell.textContent = `${monthlyTotal.toFixed(2)} USD`;
            totalAmountCell.style.fontWeight = 'bold';
        });

        totalCostDisplay.textContent = `${overallTotalCost.toFixed(2)} USD`;
    }

    function drawChart(data) {
        if (data.length === 0) {
            if (costChartInstance) {
                costChartInstance.destroy();
            }
            costChartCanvas.style.display = 'none'; // Hide canvas if no data
            return;
        }
        costChartCanvas.style.display = 'block'; // Show canvas if data is available

        const monthlyTotals = {};
        const serviceMonthlyCosts = {}; // {service: {month: cost}}

        data.forEach(item => {
            const month = item.TimePeriod.substring(0, 7); // YYYY-MM (e.g., "2023-10")
            const service = item.Service;
            const amount = parseFloat(item.Amount);

            // Aggregate total monthly cost
            if (!monthlyTotals[month]) {
                monthlyTotals[month] = 0;
            }
            monthlyTotals[month] += amount;

            // Aggregate service-specific monthly cost
            if (!serviceMonthlyCosts[service]) {
                serviceMonthlyCosts[service] = {};
            }
            if (!serviceMonthlyCosts[service][month]) {
                serviceMonthlyCosts[service][month] = 0;
            }
            serviceMonthlyCosts[service][month] += amount;
        });

        // Get sorted list of months for x-axis labels
        const sortedMonths = Object.keys(monthlyTotals).sort();

        const datasets = [];

        // Add a line dataset for Overall Total Monthly Cost
        datasets.push({
            label: 'Total Monthly Cost (USD)',
            data: sortedMonths.map(month => monthlyTotals[month].toFixed(2)),
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.2, // Smooth line
            fill: false,
            type: 'line', // This dataset will be a line chart
            order: 0, // Draw on top
            yAxisID: 'y'
        });

        // Add bar datasets for each service's monthly cost
        const backgroundColors = [
            'rgba(255, 99, 132, 0.7)', // Red
            'rgba(54, 162, 235, 0.7)', // Blue
            'rgba(255, 206, 86, 0.7)', // Yellow
            'rgba(75, 192, 192, 0.7)', // Green
            'rgba(153, 102, 255, 0.7)', // Purple
            'rgba(255, 159, 64, 0.7)', // Orange
            'rgba(199, 199, 199, 0.7)', // Grey
            'rgba(25, 200, 150, 0.7)', // Teal
            'rgba(100, 50, 150, 0.7)'  // Indigo
        ];
        let colorIndex = 0;

        for (const service in serviceMonthlyCosts) {
            datasets.push({
                label: service,
                data: sortedMonths.map(month => (serviceMonthlyCosts[service][month] || 0).toFixed(2)),
                backgroundColor: backgroundColors[colorIndex % backgroundColors.length],
                borderColor: backgroundColors[colorIndex % backgroundColors.length],
                borderWidth: 1,
                stack: 'ServiceCosts', // Stack these bars
                type: 'bar', // These datasets will be bar charts
                order: 1, // Draw below the line
                yAxisID: 'y'
            });
            colorIndex++;
        }

        // Destroy previous chart instance if it exists to avoid conflicts
        if (costChartInstance) {
            costChartInstance.destroy();
        }

        // Create new Chart.js instance
        costChartInstance = new Chart(costChartCanvas, {
            type: 'bar', // Default type, individual datasets can override
            data: {
                labels: sortedMonths,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allows custom canvas height
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly AWS Cost Breakdown by Service'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true, // Stack the service bars
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        stacked: true, // Stack the service bars
                        title: {
                            display: true,
                            text: 'Cost (USD)'
                        },
                        ticks: {
                            callback: function(value, index, ticks) {
                                return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
                            }
                        }
                    }
                }
            }
        });
    }

    // Event listener for the "Get Cost Data" button
    fetchCostButton.addEventListener('click', fetchCostData);

    // Initial fetch when the page loads
    fetchCostData();
});


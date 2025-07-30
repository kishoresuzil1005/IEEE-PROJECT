// frontend/ec2/js/ec2-load-balancers.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Make sure this matches your Flask backend URL
    const tableBody = document.querySelector('#loadBalancersTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchLoadBalancers() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            const lbs = await callApi(`${API_BASE_URL}/load-balancers`);
            displayLoadBalancers(lbs);
        } catch (error) {
            console.error('Error fetching Load Balancers:', error);
            errorMessageDiv.textContent = `Failed to load Load Balancers: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayLoadBalancers(lbs) {
        if (lbs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">No Load Balancers found in this region.</td></tr>';
            return;
        }

        lbs.forEach(lb => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = lb.Name || 'N/A';
            row.insertCell().textContent = lb.Type || 'N/A';
            row.insertCell().textContent = lb.DNSName || 'N/A';
            row.insertCell().textContent = lb.State || 'N/A';
            row.insertCell().textContent = lb.VpcId || 'N/A';
            row.insertCell().textContent = lb.CreatedTime ? new Date(lb.CreatedTime).toLocaleString() : 'N/A';
            // Add actions here if you want to implement delete/modify for Load Balancers
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    // Initial fetch when the page loads
    fetchLoadBalancers();

    // Add event listener for the refresh button
    refreshButton.addEventListener('click', fetchLoadBalancers);
});


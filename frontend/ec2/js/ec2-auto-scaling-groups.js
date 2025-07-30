// frontend/ec2/js/ec2-auto-scaling-groups.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Make sure this matches your Flask backend URL
    const tableBody = document.querySelector('#autoScalingGroupsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchAutoScalingGroups() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            const asgs = await callApi(`${API_BASE_URL}/auto-scaling-groups`);
            displayAutoScalingGroups(asgs);
        } catch (error) {
            console.error('Error fetching Auto Scaling Groups:', error);
            errorMessageDiv.textContent = `Failed to load Auto Scaling Groups: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayAutoScalingGroups(asgs) {
        if (asgs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8">No Auto Scaling Groups found in this region.</td></tr>';
            return;
        }

        asgs.forEach(asg => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = asg.AutoScalingGroupName || 'N/A';
            row.insertCell().textContent = asg.MinSize !== undefined ? asg.MinSize : 'N/A';
            row.insertCell().textContent = asg.MaxSize !== undefined ? asg.MaxSize : 'N/A';
            row.insertCell().textContent = asg.DesiredCapacity !== undefined ? asg.DesiredCapacity : 'N/A';
            row.insertCell().textContent = asg.LaunchConfigurationName || 'N/A';
            row.insertCell().textContent = asg.HealthCheckType || 'N/A';
            row.insertCell().textContent = asg.HealthCheckGracePeriod !== undefined ? asg.HealthCheckGracePeriod : 'N/A';
            row.insertCell().textContent = asg.CreatedTime ? new Date(asg.CreatedTime).toLocaleString() : 'N/A';
            // Add actions here if you want to implement update/delete for ASGs
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    // Initial fetch when the page loads
    fetchAutoScalingGroups();

    // Add event listener for the refresh button
    refreshButton.addEventListener('click', fetchAutoScalingGroups);
});


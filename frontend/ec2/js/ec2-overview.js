// frontend/ec2/js/ec2-overview.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Make sure this matches your Flask backend

    // Elements for EC2 Overview
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const resourceGrid = document.getElementById('resourceGrid');

    // --- EC2 Overview Functions ---
    async function fetchEc2Overview() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        resourceGrid.innerHTML = ''; // Clear previous content

        try {
            const data = await callApi(`${API_BASE_URL}/ec2-overview`);
            displayEc2Overview(data);
        } catch (error) {
            console.error('Error fetching EC2 overview:', error);
            errorMessageDiv.textContent = `Failed to load EC2 overview: ${error.message}. Please ensure the backend is running and has EC2 permissions.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayEc2Overview(data) {
        const resources = [
            { name: 'Instances', count: data.Instances, page: 'ec2-instances.html' },
            { name: 'Security Groups', count: data.SecurityGroups, page: 'ec2-security-groups.html' },
            { name: 'Key Pairs', count: data.KeyPairs, page: 'ec2-key-pairs.html' },
            { name: 'Auto Scaling Groups', count: data.AutoScalingGroups, page: 'ec2-auto-scaling-groups.html' },
            { name: 'Load Balancers', count: data.LoadBalancers, page: 'ec2-load-balancers.html' },
            { name: 'Elastic IPs', count: data.ElasticIPs, page: 'ec2-elastic-ips.html' },
            { name: 'Snapshots', count: data.Snapshots, page: 'ec2-snapshots.html' },
            { name: 'Volumes', count: data.Volumes, page: 'ec2-volumes.html' },
            { name: 'Capacity Reservations', count: data.CapacityReservations, page: 'ec2-capacity-reservations.html' },
            { name: 'Dedicated Hosts', count: data.DedicatedHosts, page: 'ec2-dedicated-hosts.html' },
            { name: 'Placement Groups', count: data.PlacementGroups, page: 'ec2-placement-groups.html' },
            { name: 'Free Tier Monitor', count: 'View', page: 'ec2-free-tier-monitor.html' } // NEW CARD for Free Tier
        ];

        resources.forEach(resource => {
            const card = document.createElement('div');
            card.className = 'resource-card';
            // For the Free Tier Monitor card, we'll just show 'View' instead of a count
            const countOrView = resource.name === 'Free Tier Monitor' ? '<div class="count-text">View</div>' : `<div class="count">${resource.count}</div>`;

            card.innerHTML = `
                <h3>${resource.name}</h3>
                ${countOrView}
                <a href="${resource.page}">View Details</a>
            `;
            resourceGrid.appendChild(card);
        });
    }

    // Initial fetch when the page loads
    fetchEc2Overview();
});

